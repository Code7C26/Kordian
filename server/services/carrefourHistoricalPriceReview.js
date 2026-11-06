const {
  comparePackageSizes,
  validateHistoricalIdentityEvidence,
} = require('./carrefourHistoricalEnrichment')

const HISTORICAL_PRICE_MAX_AGE_HOURS = 72
const HISTORICAL_PRICE_MAX_CHANGE_RATIO = 0.2

function buildHistoricalPriceIndex(rows) {
  const index = new Map()
  for (const row of rows) {
    if (!validateHistoricalIdentityEvidence(row)) continue
    const gtin = String(row.gtin || '').replace(/[\s-]/g, '')
    const entries = index.get(gtin) || []
    entries.push(row)
    index.set(gtin, entries)
  }
  return index
}

function priceReviewForRow(item, captureRow, historicalByGtin) {
  const gtin = String(item.ean || '').replace(/[\s-]/g, '')
  const references = historicalByGtin.get(gtin) || []
  if (!gtin || references.length === 0) {
    return { status: 'missing_reference', reason: 'No hay precio histórico validado para el GTIN exacto' }
  }
  if (references.length > 1) {
    return { status: 'ambiguous_reference', reason: 'El GTIN tiene más de una referencia histórica validada' }
  }

  const reference = references[0]
  const currentPrice = Number(item.capturedPrice)
  const referencePrice = Number(reference.price)
  if (!Number.isFinite(currentPrice) || currentPrice <= 0
    || !Number.isFinite(referencePrice) || referencePrice <= 0) {
    return { status: 'invalid_price', reason: 'El precio actual o histórico no es válido' }
  }

  const captureTime = Date.parse(captureRow.capture_timestamp || item.capturedAt || '')
  const referenceTime = Date.parse(reference.capture_timestamp || '')
  if (!Number.isFinite(captureTime) || !Number.isFinite(referenceTime)) {
    return { status: 'invalid_timestamp', reason: 'No se pudo verificar la fecha de captura del precio' }
  }
  const ageHours = (captureTime - referenceTime) / 3_600_000
  if (ageHours < 0 || ageHours > HISTORICAL_PRICE_MAX_AGE_HOURS) {
    return {
      status: 'stale_reference',
      reason: `La referencia histórica tiene ${ageHours.toFixed(1)} horas; el máximo es ${HISTORICAL_PRICE_MAX_AGE_HOURS}`,
      ageHours,
    }
  }

  const packageName = String(captureRow.name || item.name || '')
  const historicalName = String(reference.name || '')
  const presentation = comparePackageSizes(packageName, historicalName)
  if (presentation !== 'match') {
    return {
      status: presentation === 'mismatch' ? 'presentation_mismatch' : 'presentation_unverified',
      reason: presentation === 'mismatch'
        ? 'La presentación actual difiere de la referencia histórica'
        : 'No se pudo confirmar la presentación de la referencia histórica',
    }
  }

  const changeRatio = (currentPrice - referencePrice) / referencePrice
  const withinTolerance = Math.abs(changeRatio) <= HISTORICAL_PRICE_MAX_CHANGE_RATIO
  return {
    status: withinTolerance ? 'within_tolerance' : 'outside_tolerance',
    reason: withinTolerance
      ? 'El precio está dentro de la variación histórica permitida'
      : `El precio varió ${changeRatio >= 0 ? '+' : ''}${(changeRatio * 100).toFixed(1)}%; supera ±${HISTORICAL_PRICE_MAX_CHANGE_RATIO * 100}%`,
    source: 'historical_validated_carrefour',
    referencePrice,
    referenceCapturedAt: reference.capture_timestamp,
    ageHours,
    changeRatio,
    maxAgeHours: HISTORICAL_PRICE_MAX_AGE_HOURS,
    maxChangeRatio: HISTORICAL_PRICE_MAX_CHANGE_RATIO,
  }
}

function resolvePriceReviewedStatus(item) {
  if (item.existingCarrefourPrice !== null && item.existingCarrefourPrice !== undefined) {
    return Number(Number(item.existingCarrefourPrice).toFixed(2)) === Number(Number(item.capturedPrice).toFixed(2))
      ? 'unchanged'
      : 'ready_update_offer'
  }
  if (item.existingProduct) return 'ready_add_offer'
  if (!item.proposedTaxonomyExists) return 'manual_review_taxonomy'
  return 'ready_new_product'
}

function applyHistoricalPriceReview(reportRows, captureRows, historicalRows) {
  const historicalByGtin = buildHistoricalPriceIndex(historicalRows)
  return reportRows.map((item) => {
    if (item.status !== 'manual_review_price_no_reference') return item

    const captureRow = captureRows[item.rowNumber - 2] || {}
    const historicalPriceReview = priceReviewForRow(item, captureRow, historicalByGtin)
    const reviewedItem = { ...item, historicalPriceReview }

    if (historicalPriceReview.status === 'within_tolerance') {
      reviewedItem.status = resolvePriceReviewedStatus(item)
      reviewedItem.reasons = item.reasons.filter(
        (reason) => reason !== 'No hay otra oferta local para comparar; verificar el precio en Carrefour',
      )
    } else if (historicalPriceReview.status === 'outside_tolerance') {
      reviewedItem.status = 'manual_review_price_deviation'
      reviewedItem.reasons = [
        ...item.reasons.filter(
          (reason) => reason !== 'No hay otra oferta local para comparar; verificar el precio en Carrefour',
        ),
        historicalPriceReview.reason,
      ]
    }

    return reviewedItem
  })
}

module.exports = {
  HISTORICAL_PRICE_MAX_AGE_HOURS,
  HISTORICAL_PRICE_MAX_CHANGE_RATIO,
  applyHistoricalPriceReview,
  buildHistoricalPriceIndex,
  priceReviewForRow,
}
