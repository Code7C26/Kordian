const {
  calculateNameSimilarity,
  evaluateIdentityPair,
  extractAttributes,
  extractGtin,
  isValidGtin,
} = require('./productIdentityAudit')

const DEFAULT_MATCH_THRESHOLDS = Object.freeze({
  highConfidence: 95,
  review: 80,
  minimumCandidate: 35,
  candidateLimit: 5,
})

const VARIANT_FIELDS = [
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
const HARD_DIFFERENCES = new Set(['brand', 'family', 'measure', ...VARIANT_FIELDS])

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizedGtin(product) {
  const gtin = extractGtin(product)
  return isValidGtin(gtin) ? gtin : ''
}

function normalizeProduct(product = {}, source = 'carrefour') {
  return {
    ...product,
    source: product.source || source,
    sourceProductId: String(product.sourceProductId || product.source_product_id || ''),
    sourceSku: String(product.sourceSku || product.source_sku || ''),
    brand: String(product.brand || product.brands?.name || ''),
    presentation: product.presentation || product.netContent || product.net_content || '',
  }
}

function compareAttributes(sourceProduct, candidateProduct) {
  const sourceAttributes = extractAttributes(sourceProduct)
  const candidateAttributes = extractAttributes(candidateProduct)
  const differences = []
  const uncertain = []
  const matched = []
  const addComparison = (field, left, right) => {
    if (left === null || left === undefined || left === ''
      || right === null || right === undefined || right === '') {
      if (left !== right) uncertain.push({ field, source: left || null, candidate: right || null })
      return
    }
    const equal = Array.isArray(left) && Array.isArray(right)
      ? left.length === right.length && left.every((value) => right.includes(value))
      : JSON.stringify(left) === JSON.stringify(right)
    if (equal) matched.push(field)
    else differences.push({ field, source: left, candidate: right })
  }

  addComparison('brand', normalizeText(sourceProduct.brand), normalizeText(candidateProduct.brand))
  addComparison('family', sourceAttributes.family, candidateAttributes.family)
  addComparison('measure', sourceAttributes.measure
    ? { unit: sourceAttributes.measure.baseUnit, amount: sourceAttributes.measure.normalizedAmount }
    : null, candidateAttributes.measure
      ? { unit: candidateAttributes.measure.baseUnit, amount: candidateAttributes.measure.normalizedAmount }
      : null)
  for (const field of VARIANT_FIELDS) {
    addComparison(field, sourceAttributes[field], candidateAttributes[field])
  }

  const sourceGtin = normalizedGtin(sourceProduct)
  const candidateGtin = normalizedGtin(candidateProduct)
  if (sourceGtin && candidateGtin) {
    if (sourceGtin === candidateGtin) matched.push('gtin')
    else differences.push({ field: 'gtin', source: sourceGtin, candidate: candidateGtin })
  } else {
    uncertain.push({ field: 'gtin', source: sourceGtin || null, candidate: candidateGtin || null })
  }

  return {
    sourceAttributes,
    candidateAttributes,
    sourceGtin,
    candidateGtin,
    matched,
    differences,
    uncertain,
  }
}

function calculateFallbackScore(sourceProduct, candidateProduct, comparison, nameSimilarity) {
  let score = Math.round(nameSimilarity * 25)
  const sourceBrand = normalizeText(sourceProduct.brand)
  const candidateBrand = normalizeText(candidateProduct.brand)
  if (sourceBrand && candidateBrand && sourceBrand === candidateBrand) score += 20
  else if (!sourceBrand || !candidateBrand) score += 8
  if (comparison.matched.includes('family')) score += 10
  if (comparison.matched.includes('measure')) score += 15
  const matchedVariants = comparison.matched.filter((field) => VARIANT_FIELDS.includes(field)).length
  score += Math.round((matchedVariants / VARIANT_FIELDS.length) * 15)
  if (comparison.sourceGtin && comparison.sourceGtin === comparison.candidateGtin) score += 25
  return Math.min(100, score)
}

function isComparableOffer(offer) {
  return String(offer?.supermarket || '').trim().toLowerCase() !== 'carrefour'
    && Number.isFinite(Number(offer?.cash_price ?? offer?.cashPrice))
    && Number(offer?.cash_price ?? offer?.cashPrice) > 0
}

function buildCandidate(sourceInput, candidateInput, thresholds = {}) {
  const source = normalizeProduct(sourceInput, 'carrefour')
  const candidate = normalizeProduct(candidateInput, candidateInput.source || 'unknown')
  if (candidate.source === 'carrefour') return null

  const comparison = compareAttributes(source, candidate)
  const evaluation = evaluateIdentityPair(source, candidate)
  const nameSimilarity = evaluation?.nameSimilarity
    ?? Number(calculateNameSimilarity(source, candidate).toFixed(3))
  const score = evaluation?.score
    ?? calculateFallbackScore(source, candidate, comparison, nameSimilarity)
  const hasExactGtin = Boolean(comparison.sourceGtin
    && comparison.sourceGtin === comparison.candidateGtin)
  const hardDifferences = comparison.differences.filter(({ field }) => HARD_DIFFERENCES.has(field))
  const sourceBrand = normalizeText(source.brand)
  const candidateBrand = normalizeText(candidate.brand)
  const sameBrand = Boolean(sourceBrand && candidateBrand && sourceBrand === candidateBrand)
  const sameFamily = comparison.matched.includes('family')
  const sameMeasure = comparison.matched.includes('measure')
  const nameEvidence = nameSimilarity >= 0.2
    || evaluation?.decision === 'candidate'
    || evaluation?.decision === 'review'
  const plausible = hasExactGtin
    || (sameBrand && sameFamily && nameEvidence)
    || (score >= (thresholds.minimumCandidate ?? DEFAULT_MATCH_THRESHOLDS.minimumCandidate)
      && nameEvidence)
  if (!plausible) return null

  const exactCompatible = hasExactGtin
    && sameBrand
    && sameFamily
    && sameMeasure
    && hardDifferences.length === 0
  const highThreshold = thresholds.highConfidence ?? DEFAULT_MATCH_THRESHOLDS.highConfidence
  const status = exactCompatible
    ? 'MATCH_EXACTO'
    : hasExactGtin
      && hardDifferences.length === 0
      && !comparison.differences.some(({ field }) => field === 'gtin')
      && score >= highThreshold
      ? 'MATCH_ALTO'
      : 'MATCH_REVISAR'
  const confidence = score >= highThreshold
    ? 'alta'
    : score >= (thresholds.review ?? DEFAULT_MATCH_THRESHOLDS.review)
      ? 'media'
      : 'baja'
  const reasons = []
  if (comparison.differences.some(({ field }) => field === 'gtin')) reasons.push('GTIN_CONTRADICTORIO')
  if (comparison.differences.some(({ field }) => field === 'measure')) reasons.push('PRESENTACION_INCOMPATIBLE')
  if (comparison.differences.some(({ field }) => VARIANT_FIELDS.includes(field))) reasons.push('VARIANTE_INCOMPATIBLE')
  if (comparison.differences.some(({ field }) => field === 'brand')) reasons.push('MARCA_DIFERENTE')
  if (!sameMeasure) reasons.push('PRESENTACION_NO_VERIFICADA')
  if (!comparison.sourceGtin || !comparison.candidateGtin) reasons.push('GTIN_INCOMPLETO')
  if (!sameBrand) reasons.push('MARCA_NO_CONFIRMADA')
  if (!sameFamily) reasons.push('FAMILIA_NO_CONFIRMADA')
  if (comparison.uncertain.length) reasons.push('ATRIBUTOS_INCOMPLETOS')
  if (!nameEvidence) reasons.push('SIMILITUD_DE_NOMBRE_BAJA')

  const offers = Array.isArray(candidate.offers) ? candidate.offers : []
  const comparableOffers = offers.filter(isComparableOffer)
  const presentation = candidate.presentation || (
    comparison.candidateAttributes.measure
      ? `${comparison.candidateAttributes.measure.amount} ${comparison.candidateAttributes.measure.baseUnit}`
      : ''
  )

  return {
    localProductId: candidate.id ?? null,
    source: candidate.source,
    sourceProductId: candidate.sourceProductId || null,
    name: candidate.name || '',
    brand: candidate.brand || '',
    gtin: comparison.candidateGtin || String(candidate.ean || ''),
    presentation,
    supermarket: comparableOffers.map((offer) => offer.supermarket),
    prices: comparableOffers.map((offer) => ({
      supermarket: offer.supermarket,
      price: Number(offer.cash_price ?? offer.cashPrice),
    })),
    score,
    confidence,
    status,
    nameSimilarity,
    differences: comparison.differences,
    uncertainAttributes: comparison.uncertain,
    matchedAttributes: comparison.matched,
    reasons: [...new Set(reasons)],
    hasComparableOffer: comparableOffers.length > 0,
    sourceSku: candidate.sourceSku || null,
    _identity: {
      sourceGtin: comparison.sourceGtin,
      candidateGtin: comparison.candidateGtin,
      sourceAttributes: comparison.sourceAttributes,
      candidateAttributes: comparison.candidateAttributes,
      sameBrand,
      sameFamily,
      sameMeasure,
      hardDifferences,
    },
  }
}

function hasSufficientIdentityData(product = {}) {
  const normalized = normalizeProduct(product)
  const attributes = extractAttributes(normalized)
  return Boolean(normalized.name.trim()
    && normalized.brand.trim()
    && attributes.family
    && attributes.measure)
}

function classifyCarrefourProduct(sourceProduct, localProducts = [], options = {}) {
  const thresholds = { ...DEFAULT_MATCH_THRESHOLDS, ...options }
  const candidates = (Array.isArray(localProducts) ? localProducts : [])
    .map((candidate) => buildCandidate(sourceProduct, candidate, thresholds))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score
      || Number(right.hasComparableOffer) - Number(left.hasComparableOffer)
      || String(left.name).localeCompare(String(right.name)))
  const comparableCandidates = candidates.filter((candidate) => candidate.hasComparableOffer)
  const limitedCandidates = candidates.slice(0, thresholds.candidateLimit)
  if (comparableCandidates.length && !limitedCandidates.some((candidate) => candidate.hasComparableOffer)) {
    limitedCandidates[limitedCandidates.length - 1] = comparableCandidates[0]
    limitedCandidates.sort((left, right) => right.score - left.score
      || Number(right.hasComparableOffer) - Number(left.hasComparableOffer)
      || String(left.name).localeCompare(String(right.name)))
  }
  const ambiguous = limitedCandidates.length > 1
    && limitedCandidates[0].score === limitedCandidates[1].score
  const top = comparableCandidates[0] || null
  let classification
  let reasons = []

  if (top) {
    classification = ambiguous ? 'MATCH_REVISAR' : top.status
    if (ambiguous) reasons.push('CANDIDATOS_IGUALMENTE_PROBABLES')
  } else if (!hasSufficientIdentityData(sourceProduct) && !normalizedGtin(sourceProduct)) {
    classification = 'DATOS_INSUFICIENTES'
    reasons.push('FALTAN_ATRIBUTOS_ESENCIALES')
  } else {
    classification = 'SIN_REFERENCIA'
    reasons.push(candidates.length
      ? 'PRODUCTO_EXISTENTE_SIN_OFERTA_COMPARABLE'
      : 'SIN_CANDIDATOS')
  }

  return {
    classification,
    candidateCount: candidates.length,
    candidates: limitedCandidates,
    ambiguous,
    hasComparableCandidates: comparableCandidates.length > 0,
    reasons,
    sufficientIdentityData: hasSufficientIdentityData(sourceProduct),
    candidateSearchResult: candidates.length ? null : 'SIN_CANDIDATOS',
    writeSafety: {
      associationsCreated: false,
      productsMutated: false,
      offersMutated: false,
    },
  }
}

module.exports = {
  DEFAULT_MATCH_THRESHOLDS,
  buildCandidate,
  classifyCarrefourProduct,
  compareAttributes,
  hasSufficientIdentityData,
}
