const supabaseAdmin = require('../supabaseAdmin')
const { extractAttributes, extractGtin } = require('./productIdentityAudit')

const SNAPSHOT_ATTRIBUTE_FIELDS = [
  'family',
  'form',
  'productLine',
  'style',
  'fatClass',
  'fatPercent',
  'lactose',
  'flavor',
  'container',
  'packCount',
  'additionalFeatures',
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizeSnapshotProduct(product = {}, overrides = {}) {
  return {
    ...product,
    source: overrides.source || product.source || '',
    sourceProductId: overrides.sourceProductId
      ?? product.sourceProductId
      ?? product.source_product_id
      ?? '',
    sourceSku: overrides.sourceSku ?? product.sourceSku ?? product.source_sku ?? '',
    brand: product.brand || product.brands?.name || '',
    presentation: product.presentation || product.netContent || product.net_content || '',
  }
}

function buildIdentitySnapshot(product = {}, overrides = {}) {
  const normalizedProduct = normalizeSnapshotProduct(product, overrides)
  const attributes = extractAttributes(normalizedProduct)
  return {
    source: String(normalizedProduct.source || ''),
    sourceProductId: String(normalizedProduct.sourceProductId || '').trim(),
    sourceSku: String(normalizedProduct.sourceSku || '').trim(),
    gtin: extractGtin(normalizedProduct),
    name: String(normalizedProduct.name || '').trim(),
    normalizedName: normalizeText(normalizedProduct.name),
    brand: normalizeText(normalizedProduct.brand),
    attributes: {
      family: attributes.family || null,
      measure: attributes.measure
        ? { unit: attributes.measure.baseUnit, amount: attributes.measure.normalizedAmount }
        : null,
      variants: Object.fromEntries(SNAPSHOT_ATTRIBUTE_FIELDS
        .filter((field) => field !== 'family')
        .map((field) => [field, attributes[field] ?? null])),
    },
  }
}

function snapshotDifferences(savedSnapshot, currentSnapshot) {
  if (!savedSnapshot || !currentSnapshot) return ['IDENTITY_SNAPSHOT_MISSING']
  const differences = []
  for (const field of ['source', 'sourceProductId', 'sourceSku', 'gtin', 'normalizedName', 'brand']) {
    if (String(savedSnapshot[field] || '') !== String(currentSnapshot[field] || '')) {
      differences.push(`${field.toUpperCase()}_CHANGED`)
    }
  }
  if (JSON.stringify(savedSnapshot.attributes?.measure || null)
    !== JSON.stringify(currentSnapshot.attributes?.measure || null)) {
    differences.push('PRESENTACION_CAMBIADA')
  }
  if (JSON.stringify(savedSnapshot.attributes?.family || null)
    !== JSON.stringify(currentSnapshot.attributes?.family || null)) {
    differences.push('FAMILIA_CAMBIADA')
  }
  if (JSON.stringify(savedSnapshot.attributes?.variants || {})
    !== JSON.stringify(currentSnapshot.attributes?.variants || {})) {
    differences.push('VARIANTE_CAMBIADA')
  }
  return differences
}

function approvedMatchCompatibilityIssues(sourceSnapshot, localSnapshot) {
  const issues = []
  if (sourceSnapshot.gtin && localSnapshot.gtin && sourceSnapshot.gtin !== localSnapshot.gtin) {
    issues.push('GTIN_INCOMPATIBLE')
  }
  if (sourceSnapshot.brand && localSnapshot.brand && sourceSnapshot.brand !== localSnapshot.brand) {
    issues.push('MARCA_INCOMPATIBLE')
  }
  if (sourceSnapshot.attributes?.family && localSnapshot.attributes?.family
    && sourceSnapshot.attributes.family !== localSnapshot.attributes.family) {
    issues.push('FAMILIA_INCOMPATIBLE')
  }
  if (sourceSnapshot.attributes?.measure && localSnapshot.attributes?.measure
    && JSON.stringify(sourceSnapshot.attributes.measure) !== JSON.stringify(localSnapshot.attributes.measure)) {
    issues.push('PRESENTACION_INCOMPATIBLE')
  }
  const sourceVariants = sourceSnapshot.attributes?.variants || {}
  const localVariants = localSnapshot.attributes?.variants || {}
  for (const field of SNAPSHOT_ATTRIBUTE_FIELDS.filter((entry) => entry !== 'family')) {
    const sourceValue = sourceVariants[field]
    const localValue = localVariants[field]
    if (sourceValue !== null && sourceValue !== '' && localValue !== null && localValue !== ''
      && JSON.stringify(sourceValue) !== JSON.stringify(localValue)) {
      issues.push(`VARIANTE_INCOMPATIBLE:${field}`)
    }
  }
  return issues
}

function isProductMatchDecisionCurrent(decision, sourceProduct, localProduct = null) {
  if (!decision) return { current: false, reasons: ['DECISION_NO_DISPONIBLE'] }
  const sourceSnapshot = buildIdentitySnapshot(sourceProduct, {
    source: decision.source,
    sourceProductId: decision.source_product_id || decision.sourceProductId,
    sourceSku: sourceProduct.sourceSku || sourceProduct.source_sku,
  })
  const reasons = snapshotDifferences(decision.source_snapshot || decision.sourceSnapshot, sourceSnapshot)

  if (decision.decision_type === 'no_comparable') {
    if (decision.status !== 'approved') {
      return { current: false, reasons: [...reasons, 'DECISION_NO_APROBADA'] }
    }
    return { current: reasons.length === 0, reasons }
  }
  if (!localProduct
    || String(localProduct.id) !== String(decision.local_product_id ?? decision.localProductId)) {
    return { current: false, reasons: [...reasons, 'PRODUCTO_LOCAL_NO_DISPONIBLE'] }
  }
  const localSnapshot = buildIdentitySnapshot(localProduct)
  reasons.push(...snapshotDifferences(decision.local_snapshot || decision.localSnapshot, localSnapshot))
  if (decision.status === 'rejected' && decision.decision_type === 'no_match') {
    return { current: reasons.length === 0, reasons }
  }
  if (decision.status === 'rejected') {
    return { current: false, reasons: [...reasons, 'DECISION_NO_APROBADA'] }
  }
  if (decision.status !== 'approved') {
    return { current: false, reasons: [...reasons, 'DECISION_NO_APROBADA'] }
  }
  if (decision.decision_type === 'match') {
    reasons.push(...approvedMatchCompatibilityIssues(sourceSnapshot, localSnapshot))
  }
  return { current: reasons.length === 0, reasons: [...new Set(reasons)] }
}

function createDecisionKey({ source, sourceProductId, localProductId }) {
  const encodedSourceId = encodeURIComponent(String(sourceProductId || '').trim())
  const localKey = localProductId === null || localProductId === undefined
    ? 'no-comparable'
    : String(localProductId)
  return `${String(source || '').trim()}:${encodedSourceId}:${localKey}`
}

async function listProductMatchDecisions({
  source,
  sourceProductIds = [],
  database = supabaseAdmin,
}) {
  const ids = [...new Set(sourceProductIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!ids.length) return []
  const results = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await database
      .from('product_match_review_decisions')
      .select('*')
      .eq('source', source)
      .in('source_product_id', ids.slice(offset, offset + 100))
    if (error) throw error
    results.push(...(data || []))
  }
  return results
}

async function upsertProductMatchDecision(decision, database = supabaseAdmin) {
  const decisionKey = createDecisionKey(decision)
  const payload = {
    decision_key: decisionKey,
    source: decision.source,
    source_product_id: String(decision.sourceProductId),
    source_sku: decision.sourceSku || null,
    local_product_id: decision.localProductId ?? null,
    decision_type: decision.decisionType,
    status: decision.status,
    source_snapshot: decision.sourceSnapshot,
    local_snapshot: decision.localSnapshot || {},
    evidence: decision.evidence || {},
    reviewed_by: decision.reviewedBy,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await database
    .from('product_match_review_decisions')
    .upsert(payload, { onConflict: 'decision_key' })
    .select()
    .single()
  if (error) throw error
  return data
}

module.exports = {
  approvedMatchCompatibilityIssues,
  buildIdentitySnapshot,
  createDecisionKey,
  isProductMatchDecisionCurrent,
  listProductMatchDecisions,
  snapshotDifferences,
  upsertProductMatchDecision,
}
