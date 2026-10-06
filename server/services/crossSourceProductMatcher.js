const { evaluateIdentityPair, isValidGtin, summarizeProduct } = require('./productIdentityAudit')

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const REQUIRED_FIELDS_BY_FAMILY = {
  milk: ['measure', 'variant.form', 'flavor', 'format.container'],
  yogurt: ['measure', 'variant.style', 'flavor'],
  detergent: ['measure', 'variant.productLine', 'flavor', 'format.container'],
  yerba_mate: ['measure', 'flavor'],
}

const NAME_STOP_WORDS = new Set(['la', 'el', 'de', 'del', 'con', 'x', 'un', 'una', 'ml', 'lt', 'lts', 'gr', 'g', 'kg', 'l'])

function getNameTokens(product) {
  const brandTokens = normalize(product.brands?.name || product.brand).split(' ').filter(Boolean)
  return new Set(normalize(product.name).split(' ').filter((token) => (
    token.length > 1 && !NAME_STOP_WORDS.has(token) && !brandTokens.includes(token) && !/^\d+(?:\d+)?$/.test(token)
  )))
}

function getSharedNameTokenCount(left, right) {
  const leftTokens = getNameTokens(left)
  const rightTokens = getNameTokens(right)
  return [...leftTokens].filter((token) => rightTokens.has(token)).length
}

function calculateNameSimilarity(left, right) {
  const leftTokens = getNameTokens(left)
  const rightTokens = getNameTokens(right)
  const union = new Set([...leftTokens, ...rightTokens])
  if (!union.size) return 0
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / union.size
}

function hasCorroboratedIdentifier(left, right) {
  const leftSummary = summarizeProduct(left)
  const rightSummary = summarizeProduct(right)
  const leftIds = [leftSummary.validGtin]
  const rightIds = [rightSummary.validGtin]
  const leftSku = String(leftSummary.sourceSku || '').replace(/\D/g, '')
  const rightSku = String(rightSummary.sourceSku || '').replace(/\D/g, '')
  if (isValidGtin(leftSku)) leftIds.push(leftSku)
  if (isValidGtin(rightSku)) rightIds.push(rightSku)
  return leftIds.filter(Boolean).some((identifier) => rightIds.includes(identifier))
}

function stableValue(value) {
  if (Array.isArray(value)) return value.length ? [...value].sort() : null
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== null && item !== '')
    return entries.length ? Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right))) : null
  }
  return value === '' || value === undefined ? null : value
}

function getComparableAttributes(product) {
  const attributes = product.attributes || {}
  return {
    family: attributes.family || null,
    brand: normalize(product.brand) || null,
    measure: attributes.measure
      ? { unit: attributes.measure.baseUnit, amount: attributes.measure.normalizedAmount }
      : null,
    variant: stableValue({
      form: attributes.form,
      line: attributes.productLine,
      style: attributes.style,
      fatClass: attributes.fatClass,
      fatPercent: attributes.fatPercent,
      lactose: attributes.lactose,
    }),
    format: stableValue({ container: attributes.container, packCount: attributes.packCount }),
    flavor: attributes.flavor || null,
    additionalFeatures: stableValue(attributes.additionalFeatures || []),
  }
}

function getFieldValue(attributes, field) {
  const [group, key] = field.split('.')
  if (!key) return attributes[field]
  let value = null
  if (group === 'variant') {
    value = ({
      form: attributes.form,
      productLine: attributes.productLine,
      style: attributes.style,
      fatClass: attributes.fatClass,
      fatPercent: attributes.fatPercent,
      lactose: attributes.lactose,
      flavor: attributes.flavor,
    })[key] ?? null
  } else if (group === 'format') {
    value = ({ container: attributes.container, packCount: attributes.packCount })[key] ?? null
  }
  return value === '' ? null : value
}

function compareComparableAttributes(mami, disco) {
  const mamiAttributes = getComparableAttributes(mami)
  const discoAttributes = getComparableAttributes(disco)
  const matched = []
  const mismatched = []
  const uncertain = []

  const compareField = (field, left, right) => {
    if (left === null || right === null) {
      if (left !== null || right !== null) uncertain.push({ field, mami: left, disco: right })
      return
    }
    if (Array.isArray(left) || Array.isArray(right)) {
      const leftValues = Array.isArray(left) ? left : []
      const rightValues = Array.isArray(right) ? right : []
      if (!leftValues.length && !rightValues.length) return
      if (leftValues.length === rightValues.length && leftValues.every((value) => rightValues.includes(value))) matched.push(field)
      else uncertain.push({ field, mami: leftValues, disco: rightValues })
      return
    }
    if (JSON.stringify(left) === JSON.stringify(right)) matched.push(field)
    else mismatched.push({ field, mami: left, disco: right })
  }

  for (const field of ['family', 'brand', 'measure', 'flavor']) {
    compareField(field, mamiAttributes[field], discoAttributes[field])
  }
  for (const field of [
    'variant.form', 'variant.productLine', 'variant.style', 'variant.fatClass',
    'variant.fatPercent', 'variant.lactose', 'format.container', 'format.packCount',
  ]) {
    compareField(field, getFieldValue(mami.attributes, field), getFieldValue(disco.attributes, field))
  }
  compareField('additionalFeatures', mamiAttributes.additionalFeatures, discoAttributes.additionalFeatures)

  return { mami: mamiAttributes, disco: discoAttributes, matched, mismatched, uncertain }
}

function getBestPrice(product) {
  const prices = (product.offers || [])
    .map((offer) => Number(offer.cash_price ?? offer.cashPrice ?? offer.price))
    .filter((price) => Number.isFinite(price) && price > 0)
  return prices.length ? Math.min(...prices) : null
}

function getPriceSignal(mami, disco) {
  const mamiPrice = getBestPrice(mami)
  const discoPrice = getBestPrice(disco)
  if (!mamiPrice || !discoPrice) return { mamiPrice, discoPrice, differencePercent: null, suspicious: false }
  const ratio = Math.max(mamiPrice, discoPrice) / Math.min(mamiPrice, discoPrice)
  return {
    mamiPrice,
    discoPrice,
    differencePercent: Number((((mamiPrice - discoPrice) / discoPrice) * 100).toFixed(1)),
    suspicious: ratio >= 5,
  }
}

function getStoreConstraint(mami, disco) {
  const mamiStores = (mami.offers || []).map((offer) => String(offer.supermarket || '').trim()).filter(Boolean)
  const discoStores = (disco.offers || []).map((offer) => String(offer.supermarket || '').trim()).filter(Boolean)
  const counts = new Map()
  for (const store of [...mamiStores, ...discoStores]) counts.set(store, (counts.get(store) || 0) + 1)
  const repeatedSupermarkets = [...counts.entries()].filter(([, count]) => count > 1).map(([store]) => store)
  return {
    validForOneOfferPerSupermarket: repeatedSupermarkets.length === 0,
    repeatedSupermarkets,
  }
}

function makeResult(mami, disco, status, comparisons, reasons, confidence, evaluation = null) {
  const priceSignal = getPriceSignal(mami, disco)
  const storeConstraint = getStoreConstraint(mami, disco)
  const finalStatus = status === 'match' && !storeConstraint.validForOneOfferPerSupermarket ? 'revisión' : status
  const finalReasons = [...reasons]
  if (!storeConstraint.validForOneOfferPerSupermarket) finalReasons.push('supermarket_offer_collision')
  if (priceSignal.suspicious) finalReasons.push('price_difference_suspicious')

  return {
    status: finalStatus,
    confidence,
    reasonCodes: [...new Set(finalReasons)],
    matchedAttributes: comparisons.matched,
    mismatchedAttributes: comparisons.mismatched,
    uncertainAttributes: comparisons.uncertain,
    nameCompatibility: evaluation?.nameCompatibility || 'unknown',
    normalizedAttributes: { mami: comparisons.mami, disco: comparisons.disco },
    priceSignal,
    storeConstraint,
    images: { mami: mami.image || null, disco: disco.image || null, visuallyCompared: false },
    products: { mami, disco },
    automaticGroupingAllowed: false,
    previousEvaluation: evaluation ? {
      decision: evaluation.decision,
      score: evaluation.score,
      identifierNotes: evaluation.identifierNotes,
    } : null,
  }
}

function matchCrossSourcePair(mamiProduct, discoProduct) {
  const mami = summarizeProduct(mamiProduct)
  const disco = summarizeProduct(discoProduct)
  const comparisons = compareComparableAttributes(mami, disco)
  const mamiFamily = mami.attributes.family
  const discoFamily = disco.attributes.family
  const mamiBrand = normalize(mami.brand)
  const discoBrand = normalize(disco.brand)

  if (mami.source !== 'mami' || disco.source !== 'disco') {
    return makeResult(mami, disco, 'no_match', comparisons, ['unexpected_source_pair'], 'alta')
  }
  if (!mamiFamily || !discoFamily) {
    return makeResult(mami, disco, 'revisión', comparisons, ['product_family_missing'], 'baja')
  }
  if (mamiFamily !== discoFamily) {
    return makeResult(mami, disco, 'no_match', comparisons, ['product_family_mismatch'], 'alta')
  }
  if (mamiBrand && discoBrand && mamiBrand !== discoBrand) {
    return makeResult(mami, disco, 'no_match', comparisons, ['brand_mismatch'], 'alta')
  }
  if (!mamiBrand || !discoBrand) {
    return makeResult(mami, disco, 'revisión', comparisons, ['brand_missing'], 'baja')
  }

  const evaluation = evaluateIdentityPair(mamiProduct, discoProduct)
  if (!evaluation) return makeResult(mami, disco, 'revisión', comparisons, ['identity_not_evaluated'], 'baja')

  const hardMismatches = comparisons.mismatched.filter(({ field }) => (
    ['family', 'brand', 'measure', 'flavor'].includes(field)
    || field.startsWith('variant.')
    || field.startsWith('format.')
  ))
  if (evaluation.decision === 'separate' || hardMismatches.length) {
    const reasons = hardMismatches.map(({ field }) => `${field}_mismatch`)
    if (!reasons.length) reasons.push('incompatible_attributes')
    return makeResult(mami, disco, 'no_match', comparisons, reasons, 'alta', evaluation)
  }

  if (evaluation.conflicts.some((conflict) => conflict.field === 'additionalFeatures')) {
    return makeResult(mami, disco, 'revisión', comparisons, ['additional_features_differ'], 'media', evaluation)
  }

  const mamiGtin = String(mami.validGtin || '')
  const discoGtin = String(disco.validGtin || '')
  const exactDeclaredGtin = Boolean(mamiGtin && discoGtin && mamiGtin === discoGtin)
  const sourceSkuOnlyMatch = evaluation.matchedSignals.includes('source_sku_matches_gtin') && !exactDeclaredGtin
  const requiredFields = REQUIRED_FIELDS_BY_FAMILY[mamiFamily] || ['measure', 'flavor']
  const requiredAttributesKnown = requiredFields.every((field) => comparisons.matched.includes(field))
    && comparisons.uncertain.length === 0
  const oneSidedExtra = comparisons.uncertain.some((attribute) => attribute.field === 'additionalFeatures')

  if (exactDeclaredGtin) {
    if (requiredAttributesKnown && !oneSidedExtra) {
      return makeResult(mami, disco, 'match', comparisons, ['exact_valid_gtin'], 'alta', evaluation)
    }
    return makeResult(mami, disco, 'revisión', comparisons, ['exact_gtin_attributes_incomplete'], 'media', evaluation)
  }
  if (sourceSkuOnlyMatch) {
    if (requiredAttributesKnown && !comparisons.mismatched.length && !oneSidedExtra) {
      return makeResult(mami, disco, 'match', comparisons, ['source_sku_corrobated_by_gtin'], 'media', evaluation)
    }
    return makeResult(mami, disco, 'revisión', comparisons, ['source_sku_gtin_attributes_incomplete'], 'media', evaluation)
  }
  if (evaluation.decision === 'candidate' && requiredAttributesKnown && !comparisons.mismatched.length && !oneSidedExtra) {
    return makeResult(mami, disco, 'match', comparisons, ['complete_attribute_match'], 'media', evaluation)
  }

  const reasons = [...evaluation.identifierNotes]
  if (!requiredAttributesKnown) reasons.push('important_attributes_missing')
  if (!reasons.length) reasons.push('identity_ambiguous')
  return makeResult(mami, disco, 'revisión', comparisons, reasons, evaluation.score >= 70 ? 'media' : 'baja', evaluation)
}

function auditCrossSourceProducts(mamiProducts = [], discoProducts = []) {
  const discoByBrand = new Map()
  for (const product of discoProducts) {
    const brand = normalize(product.brands?.name || product.brand)
    if (!brand) continue
    const group = discoByBrand.get(brand) || []
    group.push(product)
    discoByBrand.set(brand, group)
  }

  const results = []
  let mamiProductsWithoutBrand = 0
  for (const product of mamiProducts) {
    const brand = normalize(product.brands?.name || product.brand)
    if (!brand) {
      mamiProductsWithoutBrand += 1
      continue
    }
    const mamiAttributes = product.attributes || require('./productIdentityAudit').extractAttributes(product)
    for (const discoProduct of discoByBrand.get(brand) || []) {
      const discoAttributes = discoProduct.attributes || require('./productIdentityAudit').extractAttributes(discoProduct)
      const sharedIdentifier = hasCorroboratedIdentifier(product, discoProduct)
      const sharedNameTokens = getSharedNameTokenCount(product, discoProduct)
      const nameSimilarity = calculateNameSimilarity(product, discoProduct)
      if (!sharedIdentifier && (sharedNameTokens < 2 || nameSimilarity < 0.15)) continue
      results.push(matchCrossSourcePair(product, discoProduct))
    }
  }

  const strongCounts = new Map()
  for (const result of results.filter((item) => item.status === 'match')) {
    for (const product of [result.products.mami, result.products.disco]) {
      const key = `${product.source}:${product.id}`
      strongCounts.set(key, (strongCounts.get(key) || 0) + 1)
    }
  }
  for (const result of results) {
    if (result.status !== 'match') continue
    const ids = [result.products.mami, result.products.disco].map((product) => `${product.source}:${product.id}`)
    if (ids.some((id) => strongCounts.get(id) > 1)) {
      result.status = 'revisión'
      result.confidence = 'media'
      result.reasonCodes.push('multiple_possible_matches')
    }
  }

  const byStatus = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1
    return counts
  }, {})
  const takeExamples = (predicate, limit = 5) => results.filter(predicate).slice(0, limit)
  return {
    summary: {
      mamiProducts: mamiProducts.length,
      discoProducts: discoProducts.length,
      mamiProductsWithoutBrand,
      pairsCompared: results.length,
      statusCounts: byStatus,
      automaticGroupsCreated: 0,
    },
    examples: {
      clearMatches: takeExamples((result) => result.status === 'match'),
      similarButDifferent: takeExamples((result) => result.status === 'no_match' && result.mismatchedAttributes.length > 0),
      ambiguous: takeExamples((result) => result.status === 'revisión'),
      additionalFeatures: takeExamples((result) => result.reasonCodes.includes('additional_features_differ')),
      differentFlavors: takeExamples((result) => result.mismatchedAttributes.some((attribute) => attribute.field === 'flavor')),
      differentQuantities: takeExamples((result) => result.mismatchedAttributes.some((attribute) => attribute.field === 'measure')),
      repeatedSupermarket: takeExamples((result) => result.status !== 'no_match' && !result.storeConstraint.validForOneOfferPerSupermarket),
      suspiciousPrices: takeExamples((result) => result.priceSignal.suspicious),
    },
    pairs: results,
    writeSafety: {
      databaseWrites: false,
      importersCalled: false,
      tablesMutated: [],
      reason: 'Audit service only compares the supplied in-memory product arrays.',
    },
  }
}

module.exports = { auditCrossSourceProducts, matchCrossSourcePair }