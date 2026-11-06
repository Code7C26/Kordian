const { isValidGtin } = require('./carrefourImporter')

const HISTORICAL_MATCH_METHOD = 'exact_id_name_sku_presentation'

function normalizeProductName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function extractPackageSize(name) {
  const matches = [...String(name || '').matchAll(
    /(\d+(?:[.,]\d+)?)\s*(kg|kgs?|kilos?|grs?|gramos?|g|ml|cc|cm3|lts?|litros?|l)(?![a-z])/giu,
  )]
  if (matches.length !== 1) return null

  const [, rawAmount, rawUnit] = matches[0]
  const amount = Number(rawAmount.replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return null

  const unit = rawUnit.toLowerCase()
  if (['kg', 'kgs', 'kilo', 'kilos'].includes(unit)) {
    return { dimension: 'mass', amount: amount * 1000 }
  }
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(unit)) {
    return { dimension: 'mass', amount }
  }
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(unit)) {
    return { dimension: 'volume', amount: amount * 1000 }
  }
  return { dimension: 'volume', amount }
}

function arePackageSizesEqual(leftName, rightName) {
  return comparePackageSizes(leftName, rightName) === 'match'
}

function comparePackageSizes(leftName, rightName) {
  const left = extractPackageSize(leftName)
  const right = extractPackageSize(rightName)
  if (!left || !right) return 'unverified'
  if (left.dimension !== right.dimension) return 'mismatch'
  return Math.abs(left.amount - right.amount) <= Math.max(0.01, right.amount * 0.01)
    ? 'match'
    : 'mismatch'
}

function getHistoricalIdentity(row) {
  return {
    sourceProductId: String(row.enriched_source_product_id || '').trim(),
    sourceSku: String(row.enriched_source_sku || '').trim(),
    gtin: String(row.enriched_gtin || '').replace(/[\s-]/g, ''),
    name: String(row.enriched_name || '').trim(),
    captureTimestamp: String(row.capture_timestamp || '').trim(),
    enrichmentStatus: String(row.enrichment_status || '').trim(),
  }
}

function groupBySourceId(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const identity = getHistoricalIdentity(row)
    if (!identity.sourceProductId) continue
    const entries = grouped.get(identity.sourceProductId) || []
    entries.push({ row, identity })
    grouped.set(identity.sourceProductId, entries)
  }
  return grouped
}

function findHistoricalMatch(row, historicalById) {
  const sourceProductId = String(row.source_product_id || '').trim()
  if (!sourceProductId) return { status: 'missing_source_id', reason: 'La captura no tiene ID Carrefour' }
  if (String(row.gtin || '').trim()) {
    return { status: 'current_gtin_present', reason: 'La captura ya contiene un GTIN; no se reemplazó' }
  }

  const entries = historicalById.get(sourceProductId) || []
  if (!entries.length) return { status: 'not_found', reason: 'ID no encontrado en el histórico validado' }
  if (entries.length !== 1) {
    return { status: 'ambiguous_history', reason: 'El ID aparece varias veces en el histórico' }
  }

  const { row: historicalRow, identity } = entries[0]
  if (identity.enrichmentStatus !== 'validated') {
    return { status: 'history_not_validated', reason: 'La fila histórica no figura como validada' }
  }
  if (identity.sourceProductId !== sourceProductId) {
    return { status: 'source_id_mismatch', reason: 'El ID del producto no coincide exactamente' }
  }
  if (!identity.sourceSku || identity.sourceSku !== String(row.source_sku || '').trim()) {
    return { status: 'sku_mismatch', reason: 'El SKU actual no coincide exactamente con el histórico' }
  }
  const presentationStatus = comparePackageSizes(identity.name, row.name)
  if (presentationStatus !== 'match') {
    return {
      status: presentationStatus === 'mismatch' ? 'presentation_mismatch' : 'presentation_unverified',
      reason: presentationStatus === 'mismatch'
        ? 'La presentación actual difiere del histórico'
        : 'No se pudo confirmar que la presentación actual coincida',
    }
  }
  if (!identity.name || normalizeProductName(identity.name) !== normalizeProductName(row.name)) {
    return { status: 'name_mismatch', reason: 'El nombre actual no coincide con el histórico' }
  }
  if (!isValidGtin(identity.gtin)) {
    return { status: 'invalid_historical_gtin', reason: 'El GTIN histórico no supera la validación' }
  }

  return {
    status: 'matched',
    historicalRow,
    identity,
    method: HISTORICAL_MATCH_METHOD,
  }
}

function enrichRowsWithHistoricalIdentity(currentRows, historicalRows) {
  const historicalById = groupBySourceId(historicalRows)
  const decisions = currentRows.map((row, index) => ({
    rowNumber: index + 2,
    row,
    match: findHistoricalMatch(row, historicalById),
  }))

  const rowsByGtin = new Map()
  for (const decision of decisions) {
    if (decision.match.status !== 'matched') continue
    const gtinRows = rowsByGtin.get(decision.match.identity.gtin) || []
    gtinRows.push(decision)
    rowsByGtin.set(decision.match.identity.gtin, gtinRows)
  }
  for (const [gtin, gtinRows] of rowsByGtin) {
    if (gtinRows.length < 2) continue
    for (const decision of gtinRows) {
      decision.match = {
        status: 'duplicate_historical_gtin',
        reason: `El GTIN histórico ${gtin} se asignaría a varios productos actuales`,
      }
    }
  }

  const rows = decisions.map((decision) => {
    if (decision.match.status !== 'matched') return { ...decision.row }
    const { identity, method } = decision.match
    return {
      ...decision.row,
      gtin: identity.gtin,
      gtin_extraction_method: 'historical_strict_match',
      gtin_validation_status: 'valid',
      identity_source: 'historical_validated',
      identity_confidence: '0.95',
      historical_origin_date: identity.captureTimestamp,
      identity_match_method: method,
      historical_source_product_id: identity.sourceProductId,
      historical_source_sku: identity.sourceSku,
      historical_source_gtin: identity.gtin,
      historical_source_name: identity.name,
      historical_source_enrichment_status: identity.enrichmentStatus,
      historical_source_capture_timestamp: identity.captureTimestamp,
    }
  })

  const counts = decisions.reduce((result, decision) => {
    result[decision.match.status] = (result[decision.match.status] || 0) + 1
    return result
  }, {})

  return {
    rows,
    counts,
    decisions: decisions.map(({ rowNumber, row, match }) => ({
      rowNumber,
      sourceProductId: String(row.source_product_id || '').trim(),
      name: String(row.name || ''),
      status: match.status,
      reason: match.reason || null,
      gtin: match.identity?.gtin || null,
    })),
  }
}

function validateHistoricalIdentityEvidence(row) {
  if (row.identity_source !== 'historical_validated'
    || row.gtin_extraction_method !== 'historical_strict_match'
    || row.gtin_validation_status !== 'valid'
    || row.identity_match_method !== HISTORICAL_MATCH_METHOD) {
    return false
  }

  const sourceProductId = String(row.source_product_id || '').trim()
  const sourceSku = String(row.source_sku || '').trim()
  const gtin = String(row.gtin || '').replace(/[\s-]/g, '')
  const historicalSourceProductId = String(row.historical_source_product_id || '').trim()
  const historicalSourceSku = String(row.historical_source_sku || '').trim()
  const historicalSourceGtin = String(row.historical_source_gtin || '').replace(/[\s-]/g, '')
  const historicalSourceName = String(row.historical_source_name || '').trim()
  const historicalSourceCaptureTimestamp = Date.parse(row.historical_source_capture_timestamp)

  return Boolean(sourceProductId
    && sourceProductId === historicalSourceProductId
    && sourceSku
    && sourceSku === historicalSourceSku
    && gtin
    && gtin === historicalSourceGtin
    && row.historical_source_enrichment_status === 'validated'
    && Number.isFinite(historicalSourceCaptureTimestamp)
    && isValidGtin(gtin)
    && normalizeProductName(row.name) === normalizeProductName(historicalSourceName)
    && arePackageSizesEqual(row.name, historicalSourceName))
}

module.exports = {
  HISTORICAL_MATCH_METHOD,
  arePackageSizesEqual,
  comparePackageSizes,
  enrichRowsWithHistoricalIdentity,
  normalizeProductName,
  validateHistoricalIdentityEvidence,
}
