const crypto = require('node:crypto')
const fs = require('node:fs')
const { matchCrossSourcePair } = require('./crossSourceProductMatcher')
const { createPriceStatusQueueCapacityErrorPayload } = require('./priceStatusQueueCapacityError')
const {
  extractAttributes,
  extractGtin,
  isValidGtin,
  summarizeProduct,
} = require('./productIdentityAudit')

const MAX_DECISION_IDS = 50
const DECISION_SELECT = [
  'id',
  'pair_key',
  'source',
  'mami_product_id',
  'disco_product_id',
  'status',
  'reason_codes',
  'confidence',
  'evidence',
  'admin_username',
  'created_at',
  'updated_at',
].join(',')
const PRODUCT_SELECT = 'id,source,name,source_product_id,source_sku,ean,brand_id'
const NAME_DERIVED_ATTRIBUTES = [
  'family',
  'measure',
  'flavor',
  'form',
  'productLine',
  'style',
  'container',
  'packCount',
  'fatClass',
  'fatPercent',
  'lactose',
]
const SNAPSHOT_FIELDS = [
  'source',
  'sourceProductId',
  'sourceSku',
  'ean',
  'name',
  'brand',
  'family',
  'measure',
  'flavor',
  'form',
  'productLine',
  'style',
  'container',
  'packCount',
]
const HARD_CONFLICT_FIELDS = new Set([
  'family',
  'brand',
  'measure',
  'flavor',
  'form',
  'productLine',
  'style',
  'fatClass',
  'fatPercent',
  'lactose',
  'container',
  'packCount',
])

class ReevaluationInputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ReevaluationInputError'
    this.statusCode = 400
  }
}

function implementationVersion(modulePath) {
  return crypto.createHash('sha256')
    .update(fs.readFileSync(modulePath))
    .digest('hex')
}

function getImplementationVersions() {
  return {
    parser: implementationVersion(require.resolve('./productIdentityAudit')),
    matcher: implementationVersion(require.resolve('./crossSourceProductMatcher')),
  }
}

function validateDecisionIds(decisionIds) {
  if (!Array.isArray(decisionIds) || decisionIds.length === 0) {
    throw new ReevaluationInputError('decisionIds debe incluir al menos un UUID')
  }
  if (decisionIds.length > MAX_DECISION_IDS) {
    throw new ReevaluationInputError(`Se permiten como máximo ${MAX_DECISION_IDS} decisiones por solicitud`)
  }

  const ids = decisionIds.map((id) => String(id || '').trim().toLowerCase())
  if (ids.some((id) => !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id))) {
    throw new ReevaluationInputError('Todos los decisionIds deben ser UUID válidos')
  }
  if (new Set(ids).size !== ids.length) {
    throw new ReevaluationInputError('decisionIds no puede contener IDs duplicados')
  }
  return ids
}

function getDeclaredGtin(product) {
  const value = product?.ean ?? product?.gtin ?? product?.gtin13 ?? product?.barcode ?? null
  if (value === null || value === undefined || String(value).trim() === '') {
    return { value: null, status: 'missing' }
  }
  return {
    value: String(value),
    status: isValidGtin(value) ? 'valid' : 'invalid',
  }
}

function getIdentitySnapshot(product) {
  const summary = summarizeProduct(product)
  const attributes = summary.attributes
  const declaredGtin = getDeclaredGtin(product)
  return {
    source: String(product.source || ''),
    sourceProductId: String(product.source_product_id ?? product.sourceProductId ?? ''),
    sourceSku: String(product.source_sku ?? product.sourceSku ?? ''),
    ean: declaredGtin.value,
    name: String(product.name || ''),
    brand: String(summary.brand || ''),
    family: attributes.family || null,
    measure: attributes.measure || null,
    flavor: attributes.flavor || null,
    form: attributes.form || null,
    productLine: attributes.productLine || null,
    style: attributes.style || null,
    container: attributes.container || null,
    packCount: attributes.packCount ?? null,
  }
}

function getSnapshotDifferences(savedSnapshot, currentSnapshot) {
  if (!savedSnapshot || typeof savedSnapshot !== 'object' || Array.isArray(savedSnapshot)) return []
  return SNAPSHOT_FIELDS.filter((field) => (
    Object.hasOwn(savedSnapshot, field)
    && JSON.stringify(savedSnapshot[field] ?? null) !== JSON.stringify(currentSnapshot[field] ?? null)
  ))
}

function getSavedEvidence(evidence) {
  const stored = evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : {}
  const snapshots = stored.identitySnapshots || stored.snapshots || {}
  return {
    evidence: stored,
    mamiSnapshot: snapshots.mami || stored.mamiSnapshot || null,
    discoSnapshot: snapshots.disco || stored.discoSnapshot || null,
    parserVersion: stored.parserVersion || null,
    matcherVersion: stored.matcherVersion || null,
    manualOriginVerified: false,
  }
}

function getRecomputedEvidenceDifferences(evidence, result) {
  const savedMatched = evidence?.matchedAttributes
  const savedMismatched = evidence?.mismatchedAttributes
  if (!Array.isArray(savedMatched) && !Array.isArray(savedMismatched)) return []

  const canonicalize = (items) => JSON.stringify((items || [])
    .map((item) => typeof item === 'string'
      ? { field: item }
      : { field: item.field, mami: item.mami ?? null, disco: item.disco ?? null })
    .sort((left, right) => left.field.localeCompare(right.field)))
  const currentMismatched = result.mismatchedAttributes.filter(({ field }) => (
    HARD_CONFLICT_FIELDS.has(field) || field.startsWith('variant.') || field.startsWith('format.')
  ))
  return canonicalize(savedMatched) !== canonicalize(result.matchedAttributes)
    || canonicalize(savedMismatched) !== canonicalize(currentMismatched)
    ? ['stored_attribute_evidence_differs']
    : []
}

function hasHardIdentityConflict(result) {
  return result.previousEvaluation?.identifierNotes?.includes('different_valid_gtins')
    || result.mismatchedAttributes.some(({ field }) => (
      HARD_CONFLICT_FIELDS.has(field)
      || field.startsWith('variant.')
      || field.startsWith('format.')
    ))
}

function classifyEvaluation({
  decision,
  result,
  baselineAvailable,
  parserChanged,
  matcherChanged,
  versionBaselineMissing,
  manualOriginVerified,
  identitySnapshotChanged,
  evidenceOutdated,
  evidenceSupportsAssociation,
}) {
  if (hasHardIdentityConflict(result)) return 'identity_conflict'
  if (parserChanged || matcherChanged || versionBaselineMissing
    || identitySnapshotChanged || evidenceOutdated) return 'evidence_outdated'
  if (decision.status === 'match'
    && (!baselineAvailable || !manualOriginVerified || !evidenceSupportsAssociation)) {
    return 'manual_confirmation_required'
  }
  if (decision.status === 'match' && result.status !== 'match') return 'needs_review'
  if (result.status === 'match' && decision.status === 'match') return 'still_valid'
  return 'needs_review'
}

function getProductReport(product) {
  const summary = summarizeProduct(product)
  const declaredGtin = getDeclaredGtin(product)
  const sku = String(product.source_sku ?? product.sourceSku ?? '')
  const attributeEvidence = Object.fromEntries(NAME_DERIVED_ATTRIBUTES.map((field) => {
    const value = summary.attributes[field]
    return [field, value !== null && value !== undefined && value !== ''
      ? { status: 'extracted_from_name', value }
      : { status: 'absent' }]
  }))
  attributeEvidence.brand = summary.brand
    ? { status: 'available_from_brands_table', value: summary.brand }
    : { status: 'absent' }
  attributeEvidence.gtin = declaredGtin.status === 'valid'
    ? { status: 'available_from_ean', value: declaredGtin.value }
    : { status: declaredGtin.status }
  return {
    id: product.id,
    source: product.source || '',
    name: product.name || '',
    parserInputAvailability: {
      name: product.name ? 'available' : 'absent',
      description: 'not_in_products_schema',
      presentation: 'not_in_products_schema',
      unit: 'not_in_products_schema',
    },
    attributeEvidence,
    sourceProductId: product.source_product_id ?? product.sourceProductId ?? null,
    sourceSku: sku || null,
    gtin: {
      value: declaredGtin.value,
      status: declaredGtin.status,
      validValue: extractGtin(product) || null,
    },
    attributes: summary.attributes,
    measure: summary.attributes.measure || null,
  }
}

function getPersistedDecision(decision) {
  return {
    status: decision.status,
    reasonCodes: decision.reason_codes || [],
    confidence: decision.confidence || null,
    evidence: decision.evidence || {},
    admin: decision.admin_username || null,
    createdAt: decision.created_at || null,
    updatedAt: decision.updated_at || null,
  }
}

function evaluateDecision(decision, productsById, brandsById, currentVersions) {
  const firstProduct = productsById.get(String(decision.mami_product_id))
  const secondProduct = productsById.get(String(decision.disco_product_id))
  const attachBrand = (product) => product && ({
    ...product,
    brands: product.brand_id === null || product.brand_id === undefined
      ? null
      : { name: brandsById.get(String(product.brand_id)) || null },
  })
  const products = [attachBrand(firstProduct), attachBrand(secondProduct)]
  const sourceMami = products.find((product) => product?.source === 'mami')
  const sourceDisco = products.find((product) => product?.source === 'disco')
  const mami = sourceMami || products[0]
  const disco = sourceDisco || products[1]
  const baseResult = {
    decisionId: decision.id,
    pairKey: decision.pair_key,
    persisted: getPersistedDecision(decision),
    products: {
      mami: mami ? getProductReport(mami) : null,
      disco: disco ? getProductReport(disco) : null,
    },
    currentMatcher: null,
    baseline: { available: false, reason: 'product_missing_or_decision_snapshot_not_stored' },
    versions: { current: currentVersions, saved: null, changed: { parser: null, matcher: null } },
    evidenceDifferences: [],
    signals: [],
    outcome: 'needs_review',
  }

  if (decision.source !== 'cross_source') {
    return { ...baseResult, signals: ['unsupported_decision_source'] }
  }
  if (!mami || !disco) {
    return {
      ...baseResult,
      signals: ['baseline_snapshot_missing', 'manual_origin_unverified', 'identity_attributes_missing', 'product_missing'],
    }
  }
  if (mami.source !== 'mami' || disco.source !== 'disco' || String(mami.id) === String(disco.id)) {
    return {
      ...baseResult,
      signals: ['association_source_mismatch'],
      baseline: { available: false, reason: 'products_do_not_form_a_mami_disco_pair' },
    }
  }

  const matcherResult = matchCrossSourcePair(mami, disco)
  const saved = getSavedEvidence(decision.evidence)
  const mamiSnapshot = getIdentitySnapshot(mami)
  const discoSnapshot = getIdentitySnapshot(disco)
  const baselineAvailable = Boolean(saved.mamiSnapshot && saved.discoSnapshot)
  const parserChanged = Boolean(saved.parserVersion && saved.parserVersion !== currentVersions.parser)
  const matcherChanged = Boolean(saved.matcherVersion && saved.matcherVersion !== currentVersions.matcher)
  const signals = []
  const mamiGtin = getDeclaredGtin(mami)
  const discoGtin = getDeclaredGtin(disco)
  const mamiAttributes = extractAttributes(mami)
  const discoAttributes = extractAttributes(disco)
  const evidenceSupportsAssociation = Boolean(
    (Array.isArray(saved.evidence.matchedAttributes) && saved.evidence.matchedAttributes.length)
    || (Array.isArray(decision.reason_codes) && decision.reason_codes.length)
    || (Array.isArray(saved.evidence.reasonCodes) && saved.evidence.reasonCodes.length),
  )

  if (!baselineAvailable) signals.push('baseline_snapshot_missing')
  if (!saved.parserVersion) signals.push('parser_version_missing')
  if (!saved.matcherVersion) signals.push('matcher_version_missing')
  if (!saved.manualOriginVerified) signals.push('manual_origin_unverified')
  if (decision.status === 'match' && !evidenceSupportsAssociation) {
    signals.push('historical_evidence_insufficient')
  }
  if (mamiGtin.status === 'missing' || discoGtin.status === 'missing') signals.push('gtin_missing')
  if (mamiGtin.status === 'invalid' || discoGtin.status === 'invalid') signals.push('gtin_invalid')
  if ((mami.source_sku || disco.source_sku) && (mamiGtin.status !== 'valid' || discoGtin.status !== 'valid')) {
    signals.push('sku_not_verified_as_gtin')
  }
  if (parserChanged) signals.push('parser_changed')
  if (matcherChanged) signals.push('matcher_changed')
  if (matcherResult.uncertainAttributes.length
    || !mamiAttributes.family
    || !discoAttributes.family
    || !mamiAttributes.measure
    || !discoAttributes.measure
    || matcherResult.reasonCodes.some((code) => [
      'important_attributes_missing',
      'product_family_missing',
      'exact_gtin_attributes_incomplete',
    ].includes(code))) {
    signals.push('identity_attributes_missing')
  }
  if (matcherResult.mismatchedAttributes.some(({ field }) => field === 'measure')) {
    signals.push('measure_conflict')
  }
  const evidenceDifferences = getRecomputedEvidenceDifferences(saved.evidence, matcherResult)
  if (evidenceDifferences.length) signals.push('evidence_outdated')

  const snapshotDifferences = baselineAvailable
    ? {
      mami: getSnapshotDifferences(saved.mamiSnapshot, mamiSnapshot),
      disco: getSnapshotDifferences(saved.discoSnapshot, discoSnapshot),
    }
    : { mami: [], disco: [] }
  const identitySnapshotChanged = Boolean(
    snapshotDifferences.mami.length || snapshotDifferences.disco.length,
  )
  const changed = {
    parser: saved.parserVersion ? parserChanged : null,
    matcher: saved.matcherVersion ? matcherChanged : null,
  }
  if (identitySnapshotChanged) signals.push('identity_snapshot_changed')
  if (decision.status === 'match' && matcherResult.status !== 'match') {
    signals.push('matcher_disagrees_with_persisted_match')
  }

  const uniqueSignals = [...new Set(signals)]
  return {
    decisionId: decision.id,
    pairKey: decision.pair_key,
    persisted: getPersistedDecision(decision),
    products: {
      mami: { ...getProductReport(mami), currentSnapshot: mamiSnapshot },
      disco: { ...getProductReport(disco), currentSnapshot: discoSnapshot },
    },
    currentMatcher: {
      status: matcherResult.status,
      confidence: matcherResult.confidence,
      reasonCodes: matcherResult.reasonCodes,
      matchedAttributes: matcherResult.matchedAttributes,
      mismatchedAttributes: matcherResult.mismatchedAttributes,
      uncertainAttributes: matcherResult.uncertainAttributes,
      normalizedAttributes: matcherResult.normalizedAttributes,
      nameCompatibility: matcherResult.nameCompatibility,
      previousEvaluation: matcherResult.previousEvaluation,
    },
    baseline: {
      available: baselineAvailable,
      reason: baselineAvailable ? null : 'decision_has_no_historical_identity_snapshots',
      snapshotDifferences,
    },
    versions: {
      current: currentVersions,
      saved: { parser: saved.parserVersion, matcher: saved.matcherVersion },
      changed,
    },
    evidenceDifferences,
    signals: uniqueSignals,
    outcome: classifyEvaluation({
      decision,
      result: matcherResult,
      baselineAvailable,
      parserChanged,
      matcherChanged,
      versionBaselineMissing: baselineAvailable && (!saved.parserVersion || !saved.matcherVersion),
      manualOriginVerified: saved.manualOriginVerified,
      identitySnapshotChanged,
      evidenceOutdated: evidenceDifferences.length > 0,
      evidenceSupportsAssociation,
    }),
  }
}

function createCrossSourceDecisionReevaluationService({
  database,
  getVersions = getImplementationVersions,
  now = () => new Date().toISOString(),
} = {}) {
  if (!database || typeof database.from !== 'function') {
    throw new TypeError('database with a from() method is required')
  }

  return {
    async reevaluate(decisionIds) {
      const ids = validateDecisionIds(decisionIds)
      const versions = getVersions()
      const { data: decisions, error: decisionError } = await database
        .from('cross_source_review_decisions')
        .select(DECISION_SELECT)
        .in('id', ids)
      if (decisionError) throw decisionError

      const decisionRows = decisions || []
      const productIds = [...new Set(decisionRows
        .flatMap((decision) => [decision.mami_product_id, decision.disco_product_id])
        .filter((id) => id !== null && id !== undefined)
        .map(String))]
      let products = []
      const brandsById = new Map()
      if (productIds.length) {
        const { data, error } = await database
          .from('products')
          .select(PRODUCT_SELECT)
          .in('id', productIds)
        if (error) throw error
        products = data || []
        const brandIds = [...new Set(products
          .map((product) => product.brand_id)
          .filter((id) => id !== null && id !== undefined)
          .map(String))]
        if (brandIds.length) {
          const { data: brands, error: brandError } = await database
            .from('brands')
            .select('id,name')
            .in('id', brandIds)
          if (brandError) throw brandError
          for (const brand of brands || []) brandsById.set(String(brand.id), brand.name)
        }
      }

      const productsById = new Map(products.map((product) => [String(product.id), product]))
      const decisionsById = new Map(decisionRows.map((decision) => [String(decision.id), decision]))
      const missingDecisionIds = ids.filter((id) => !decisionsById.has(id))
      const results = ids
        .map((id) => decisionsById.get(id))
        .filter(Boolean)
        .map((decision) => evaluateDecision(decision, productsById, brandsById, versions))
      const outcomes = results.reduce((counts, result) => {
        counts[result.outcome] = (counts[result.outcome] || 0) + 1
        return counts
      }, {})

      return {
        readOnly: true,
        evaluatedAt: now(),
        versions,
        queryCounts: {
          decisionsRequested: ids.length,
          decisionsRead: decisionRows.length,
          productsRequested: productIds.length,
          productsRead: products.length,
          brandsRead: brandsById.size,
          offerRowsRead: 0,
          priceHistoryRowsRead: 0,
        },
        missingDecisionIds,
        summary: {
          evaluated: results.length,
          missingDecisions: missingDecisionIds.length,
          outcomes,
        },
        results,
      }
    },
  }
}

function createReevaluationHandler(service) {
  return async function reevaluationHandler(req, res) {
    try {
      const report = await service.reevaluate(req.body?.decisionIds)
      return res.json(report)
    } catch (error) {
      if (error instanceof ReevaluationInputError) {
        return res.status(error.statusCode).json({ error: error.message })
      }
      console.error('Error reevaluating cross-source decisions', error)
      const capacityError = createPriceStatusQueueCapacityErrorPayload(error, { rolledBack: null })
      if (capacityError) {
        return res.status(503).json({
          ...capacityError,
          partialWriteState: 'unknown',
        })
      }
      return res.status(502).json({
        error: 'No se pudieron reevaluar las decisiones',
        detail: error.message || 'Unknown error',
      })
    }
  }
}

module.exports = {
  MAX_DECISION_IDS,
  ReevaluationInputError,
  createCrossSourceDecisionReevaluationService,
  createReevaluationHandler,
  getIdentitySnapshot,
  getImplementationVersions,
  validateDecisionIds,
}
