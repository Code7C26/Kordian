const MEASURE_PATTERN = /(?:\b|(?<=x))(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo(?:s)?|g|gr|grs|gramo(?:s)?|mg|l|lt|lts|litro(?:s)?|ml|cc|cl)\b/gi
const MILK_PATTERN = /\b(leche|milk)\b/i
const GENERIC_NAME_TOKENS = new Set([
  'la', 'el', 'de', 'del', 'con', 'x', 'un', 'una', 'lts', 'lt', 'ml', 'gr', 'g', 'kg', 'l', 'litro', 'litros',
  'sachet', 'sachets', 'saquito', 'saquitos', 'bolsa', 'bottle', 'botella', 'package', 'paquete', 'pack', 'caja', 'envase',
  'mini', 'maxi', 'extra', 'premium', 'especial', 'integral', 'firme', 'bebible', 'descafeinado',
])
const KNOWN_FAMILIES = [
  ['bakery', /\b(magdalena|magdalenas|medialuna|medialunas|budin|budines|bizcochuelo|torta|tortas)\b/i],
  ['dulce_de_leche', /\b(dulce de leche|manjar)\b/i],
  ['alfajor', /\b(alfajor|alfajores)\b/i],
  ['dessert', /\b(flan|postre|postres)\b/i],
  ['cookies', /\b(galleta|galletas|galletita|galletitas|cookie|cookies)\b/i],
  ['milk', /\b(leche|milk)\b/i],
  ['yogurt', /\b(yogur|yogurt)\b/i],
  ['cheese', /\b(queso|quesos)\b/i],
  ['yerba_mate', /\b(yerba|yerbas)\b/i],
  ['coffee', /\b(cafe|cafes|cappuccino|capuccino)\b/i],
  ['rice', /\b(arroz)\b/i],
  ['oil', /\b(aceite|aceites)\b/i],
  ['detergent', /\b(detergente|detergentes)\b/i],
  ['soft_drink', /\b(gaseosa|gaseosas|cola)\b/i],
]

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getCatalogName(product, field) {
  return product[field]
    || product[`${field}_name`]
    || product[field === 'subcategory' ? 'subcategories' : 'categories']?.name
    || ''
}

function isValidGtin(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(digits.length)) return false
  const values = [...digits].map(Number)
  const checkDigit = values.pop()
  const sum = values.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === checkDigit
}

function extractGtin(product) {
  for (const value of [product.ean, product.gtin, product.gtin13, product.barcode]) {
    const digits = String(value || '').replace(/\D/g, '')
    if (isValidGtin(digits)) return digits
  }
  return ''
}

function extractMeasure(product) {
  const text = [product.name, product.description, product.presentation, product.unit].filter(Boolean).join(' ')
  const matches = [...text.matchAll(MEASURE_PATTERN)]
  const match = matches.at(-1)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  const unit = match[2].toLowerCase()
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (/^(kg|kgs|kilo)/.test(unit)) return { amount, baseUnit: 'kg', normalizedAmount: amount }
  if (/^(g|gr|gramo)/.test(unit)) return { amount, baseUnit: 'kg', normalizedAmount: amount / 1000 }
  if (unit === 'mg') return { amount, baseUnit: 'kg', normalizedAmount: amount / 1000000 }
  if (/^(l|lt|lts|litro)/.test(unit)) return { amount, baseUnit: 'l', normalizedAmount: amount }
  return { amount, baseUnit: 'l', normalizedAmount: amount / (unit === 'cl' ? 100 : 1000) }
}

function extractAttributes(product = {}) {
  const text = [product.name, product.description, product.presentation, product.unit].filter(Boolean).join(' ')
  const normalizedText = normalizeText(text)
  const family = KNOWN_FAMILIES.find(([, pattern]) => pattern.test(text))?.[0] || ''
  const measure = extractMeasure(product)
  const fatMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*%\s*(?:grasa)?/i)
  const fatClass = /\b(entera|entero)\b/i.test(text)
    ? 'whole'
    : /\b(parcialmente descremada|semidescremada|semi descremada)\b/i.test(text)
      ? 'partially_skimmed'
      : /\b(descremada|descremado|skim)\b/i.test(text)
        ? 'skimmed'
        : ''
  const form = family === 'milk'
    ? /\b(polvo|en polvo|instantanea)\b/i.test(text)
      ? 'powder'
      : /\b(condensada|evaporada|formula|infantil)\b/i.test(text)
        ? normalizeText(text).match(/condensada|evaporada|formula|infantil/)?.[0] || 'specialty'
        : MILK_PATTERN.test(text)
          ? 'liquid'
          : ''
    : ''
  const productLine = family === 'detergent'
    ? [
      ['platinum_plus', /\bplatinum plus\b/i],
      ['platinum', /\bplatinum\b/i],
      ['ultra', /\bultra\b/i],
      ['pureza_activa', /\bpureza activa\b/i],
      ['cremoso', /\bcremos[oa]\b/i],
    ].find(([, pattern]) => pattern.test(text))?.[0] || ''
    : family === 'yerba_mate'
      ? [
        ['compound', /\bcompuesta\b/i],
        ['flavored', /\bsaborizada\b/i],
        ['tea_bags', /\b(saquito|saquitos)\b/i],
        ['without_stems', /\b(sin palo|despalada)\b/i],
        ['with_stems', /\bcon palos?\b/i],
        ['special', /\b(seleccion especial|especial|premium|suave|organica)\b/i],
      ].find(([, pattern]) => pattern.test(text))?.[0] || ''
      : family === 'yogurt'
        ? [
          ['mi_primer', /\bmi primer\b/i],
          ['cremix', /\bcremix\b/i],
          ['shake', /\bshake\b/i],
          ['go', /\byogurisimo go\b/i],
          ['griego', /\bgriego\b/i],
        ].find(([, pattern]) => pattern.test(text))?.[0] || ''
    : ''
  const style = family === 'yogurt'
    ? [
      ['frozen', /\b(helado|congelado)\b/i],
      ['drinkable', /\bbebible\b/i],
      ['set', /\bfirme\b/i],
      ['greek', /\bgriego\b/i],
      ['stirred', /\bbatido\b/i],
    ].find(([, pattern]) => pattern.test(text))?.[0] || ''
    : ''
  const container = [
    ['sachet', /\b(sachet|sachets)\b/i],
    ['bottle', /\b(botella|bot|bottle)\b/i],
    ['carton', /\b(caja|tetra brik|tetra pak|tetra)\b/i],
    ['can', /\blata\b/i],
    ['pot', /\bpote\b/i],
    ['bag', /\bbolsa\b/i],
  ].find(([, pattern]) => pattern.test(text))?.[0] || ''
  const packMatch = text.match(/\b(?:pack|paquete|paq|caja|estuche|x)\s*(?:x\s*)?(\d+)\s*(?:un(?:idad(?:es)?)?|u\b|botellas?)\b/i)
  const packCount = packMatch ? Number(packMatch[1]) : 1
  const lactose = /\b(sin lactosa|zero lactosa|cero lactosa)\b/i.test(text) ? 'lactose_free' : ''
  const additionalFeatures = [...new Set([
    /\b(sin azucar|sin azucares|cero azucar|0\s*%\s*azucar|no sugar)\b/i.test(normalizedText) ? 'sugar_free' : '',
    /\b(sin gluten|libre de gluten|sin tacc)\b/i.test(normalizedText) ? 'gluten_free' : '',
    /\b(con calcio|calcio agregado|fortificado con calcio)\b/i.test(normalizedText) ? 'added_calcium' : '',
    /\b(alto en proteina|con proteina|proteina agregada|protein)\b/i.test(normalizedText) ? 'protein_enriched' : '',
    /\b(fortificad[oa]|enriquecid[oa]|vitaminas? [a-z0-9 y,]+)\b/i.test(normalizedText) ? 'fortified' : '',
    /\b(integral|grano entero)\b/i.test(normalizedText) ? 'whole_grain' : '',
  ].filter(Boolean))].sort()
  const flavor = [
    ['strawberry_kiwi', /\b(frutilla|fresa)\s*[-/]\s*kiwi\b/i],
    ['forest_fruit', /\b(frutos del bosque|frutos rojos|frutas del bosque)\b/i],
    ['mountain_herbs', /\bhierbas serranas\b/i],
    ['chocolate', /\b(chocolate|chocolatada|chocolatado|cacao)\b/i],
    ['vanilla', /\bvainilla\b/i],
    ['strawberry', /\b(frutilla|fresa)\b/i],
    ['peach', /\b(durazno|melocoton)\b/i],
    ['banana', /\b(banana|platano)\b/i],
    ['lemon', /\b(limon|lemon)\b/i],
    ['orange', /\bnaranja\b/i],
    ['grapefruit', /\b(pomelo|toronja)\b/i],
    ['apple', /\bmanzana\b/i],
    ['guarana', /\bguarana\b/i],
    ['ginger', /\b(jengibre|ginger)\b/i],
    ['honey', /\b(miel|honey)\b/i],
    ['mint', /\b(menta|menthol)\b/i],
    ['aloe', /\baloe\b/i],
    ['marine', /\bmarina\b/i],
    ['lavender', /\blavanda\b/i],
    ['dulce_de_leche', /\bdulce de leche\b/i],
  ].find(([, pattern]) => pattern.test(normalizedText))?.[0]
    || (family === 'milk' && form === 'liquid' ? 'plain' : '')

  return {
    family,
    form,
    productLine,
    style,
    measure,
    fatClass,
    fatPercent: fatMatch ? Number(fatMatch[1].replace(',', '.')) : null,
    lactose,
    additionalFeatures,
    flavor,
    container,
    packCount,
  }
}

function extractNameTokens(product) {
  const brand = normalizeText(product.brands?.name || product.brand)
  const stopWords = new Set(['la', 'el', 'de', 'del', 'con', 'x', 'un', 'una', 'lts', 'lt', 'ml', 'gr', 'kg'])
  return new Set(normalizeText(product.name).split(' ').filter((token) => token.length > 1
    && !stopWords.has(token)
    && !GENERIC_NAME_TOKENS.has(token)
    && !brand.split(' ').includes(token)))
}

function validateNameCompatibility(leftProduct, rightProduct) {
  const leftName = normalizeText(leftProduct?.name || '')
  const rightName = normalizeText(rightProduct?.name || '')
  if (!leftName || !rightName) return { status: 'weak', score: 0, reason: 'missing_name' }

  const leftBrand = normalizeText(leftProduct?.brands?.name || leftProduct?.brand || '')
  const rightBrand = normalizeText(rightProduct?.brands?.name || rightProduct?.brand || '')
  if (leftBrand && rightBrand && leftBrand !== rightBrand) {
    return { status: 'incompatible', score: 0, reason: 'brand_mismatch' }
  }

  const leftTokens = extractNameTokens(leftProduct)
  const rightTokens = extractNameTokens(rightProduct)
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token))
  const union = new Set([...leftTokens, ...rightTokens])

  if (!leftTokens.size && !rightTokens.size) {
    return { status: 'weak', score: 0, reason: 'generic_name_only' }
  }

  if (!overlap.length) {
    return { status: 'weak', score: 0, reason: 'name_tokens_do_not_overlap' }
  }

  const ratio = union.size ? overlap.length / union.size : 0
  if (leftTokens.size === 1 && rightTokens.size === 1 && overlap.length === 1) {
    return { status: 'weak', score: ratio, reason: 'single_generic_overlap' }
  }
  if (overlap.length >= 2 || ratio >= 0.45) {
    return { status: 'strong', score: ratio, reason: 'sufficient_name_overlap' }
  }
  if (ratio >= 0.2) {
    return { status: 'review', score: ratio, reason: 'partial_name_overlap' }
  }
  return { status: 'weak', score: ratio, reason: 'insufficient_name_overlap' }
}

function calculateNameSimilarity(left, right) {
  const leftTokens = extractNameTokens(left)
  const rightTokens = extractNameTokens(right)
  const union = new Set([...leftTokens, ...rightTokens])
  if (!union.size) return 0
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return intersection / union.size
}

function getOffers(product) {
  return (product.offers || []).map((offer) => ({
    supermarket: offer.supermarket || '',
    price: Number(offer.cash_price ?? offer.cashPrice ?? offer.price) || 0,
  })).filter((offer) => offer.price > 0)
}

function summarizeProduct(product) {
  return {
    id: product.id,
    source: product.source || '',
    sourceProductId: product.source_product_id || product.sourceProductId || '',
    sourceSku: product.source_sku || product.sourceSku || '',
    ean: product.ean || '',
    validGtin: extractGtin(product),
    name: product.name || '',
    brand: product.brands?.name || product.brand || '',
    category: getCatalogName(product, 'category'),
    subcategory: getCatalogName(product, 'subcategory'),
    image: product.image || '',
    attributes: extractAttributes(product),
    offers: getOffers(product),
  }
}

function compareAttribute(left, right, field, conflicts, matches) {
  const leftValue = left[field]
  const rightValue = right[field]
  if (leftValue !== null && leftValue !== '' && rightValue !== null && rightValue !== '') {
    const valuesMatch = Array.isArray(leftValue) && Array.isArray(rightValue)
      ? leftValue.length === rightValue.length && leftValue.every((value) => rightValue.includes(value))
      : leftValue === rightValue
    if (valuesMatch) matches.push(field)
    else conflicts.push({ field, left: leftValue, right: rightValue })
  }
}

function evaluateIdentityPair(leftProduct, rightProduct) {
  if (!leftProduct || !rightProduct || leftProduct.source === rightProduct.source) return null

  const left = summarizeProduct(leftProduct)
  const right = summarizeProduct(rightProduct)
  const brandKey = normalizeText(left.brand)
  const sameBrand = Boolean(brandKey && brandKey === normalizeText(right.brand))
  const sameFamily = Boolean(left.attributes.family && left.attributes.family === right.attributes.family)
  if (!sameBrand || !sameFamily) return null

  const conflicts = []
  const matches = ['brand', 'family']
  const uncertain = []
  const nameCompatibility = validateNameCompatibility(leftProduct, rightProduct)
  if (nameCompatibility.status === 'incompatible') {
    return {
      decision: 'separate',
      automaticAction: 'none',
      score: 0,
      nameSimilarity: 0,
      matchedSignals: ['brand', 'family'],
      conflicts: [{ field: 'name', left: leftProduct.name, right: rightProduct.name, reason: nameCompatibility.reason }],
      uncertainSignals: ['name'],
      identifierNotes: [],
      imageReview: {
        left: left.image,
        right: right.image,
        visuallyCompared: false,
      },
      products: [left, right],
    }
  }
  if (nameCompatibility.status === 'weak') {
    conflicts.push({ field: 'name', left: leftProduct.name, right: rightProduct.name, reason: nameCompatibility.reason })
    uncertain.push('name')
  }
  if (nameCompatibility.status === 'review') {
    uncertain.push('name')
  }

  const leftMeasure = left.attributes.measure
  const rightMeasure = right.attributes.measure
  if (leftMeasure && rightMeasure) {
    if (leftMeasure.baseUnit === rightMeasure.baseUnit
      && Math.abs(leftMeasure.normalizedAmount - rightMeasure.normalizedAmount) < 0.000001) matches.push('measure')
    else conflicts.push({ field: 'measure', left: leftMeasure, right: rightMeasure })
  } else uncertain.push('measure')

  const leftCategory = normalizeText(left.category)
  const rightCategory = normalizeText(right.category)
  const leftSubcategory = normalizeText(left.subcategory)
  const rightSubcategory = normalizeText(right.subcategory)
  if (leftCategory && rightCategory && leftCategory === rightCategory) matches.push('category')
  if (leftSubcategory && rightSubcategory && leftSubcategory === rightSubcategory) matches.push('subcategory')

  for (const field of ['form', 'productLine', 'style', 'fatClass', 'fatPercent', 'lactose', 'additionalFeatures', 'flavor', 'container', 'packCount']) {
    compareAttribute(left.attributes, right.attributes, field, conflicts, matches)
    if (left.attributes[field] === '' || right.attributes[field] === ''
      || left.attributes[field] === null || right.attributes[field] === null
      || (Array.isArray(left.attributes[field]) && Array.isArray(right.attributes[field])
        && left.attributes[field].length === 0 && right.attributes[field].length === 0)) uncertain.push(field)
  }

  const leftGtin = left.validGtin
  const rightGtin = right.validGtin
  const identifiers = []
  if (leftGtin && rightGtin && leftGtin === rightGtin) matches.push('gtin')
  if (leftGtin && rightGtin && leftGtin !== rightGtin) {
    conflicts.push({ field: 'gtin', left: leftGtin, right: rightGtin })
    identifiers.push('different_valid_gtins')
  }

  for (const [summary, product] of [[left, leftProduct], [right, rightProduct]]) {
    const sourceSku = String(summary.sourceSku || '').replace(/\D/g, '')
    const otherGtin = summary === left ? rightGtin : leftGtin
    if (sourceSku && isValidGtin(sourceSku) && otherGtin) {
      if (sourceSku === otherGtin) {
        matches.push('source_sku_matches_gtin')
        identifiers.push(`${summary.source}_source_sku_matches_valid_gtin`)
      } else {
        identifiers.push(`${summary.source}_source_sku_is_gtin_like`)
      }
    }
  }

  const hardConflicts = new Set(['measure', 'form', 'productLine', 'style', 'fatClass', 'fatPercent', 'lactose', 'flavor', 'container', 'packCount'])
  const incompatible = conflicts.some((conflict) => hardConflicts.has(conflict.field))
  const hasStrongIdentifierMatch = matches.includes('gtin') || matches.includes('source_sku_matches_gtin')
  const nameSimilarity = calculateNameSimilarity(leftProduct, rightProduct)
  const score = Math.min(100,
    25
    + 15
    + (nameCompatibility.status === 'strong' ? 10 : 0)
    + (nameCompatibility.status === 'review' ? -10 : 0)
    + (nameCompatibility.status === 'weak' ? -20 : 0)
    + (matches.includes('category') ? 5 : 0)
    + (matches.includes('subcategory') ? 5 : 0)
    + (matches.includes('measure') ? 20 : 0)
    + (matches.includes('form') ? 10 : 0)
    + (matches.includes('productLine') || matches.includes('style') ? 5 : 0)
    + (matches.includes('fatClass') || matches.includes('fatPercent') ? 10 : 0)
    + (matches.includes('container') ? 5 : 0)
    + (matches.includes('packCount') ? 5 : 0)
    + (matches.includes('gtin') || matches.includes('source_sku_matches_gtin') ? 15 : 0)
    + Math.round(nameSimilarity * 5)
  )
  const decision = nameCompatibility.status === 'weak' && !hasStrongIdentifierMatch
    ? 'separate'
    : incompatible && !hasStrongIdentifierMatch
      ? 'separate'
      : conflicts.some((conflict) => conflict.field === 'gtin' || conflict.field === 'additionalFeatures')
        || identifiers.length || (incompatible && hasStrongIdentifierMatch)
        ? 'review'
        : score >= 75
          ? 'candidate'
          : 'weak_candidate'

  return {
    decision,
    automaticAction: 'none',
    score,
    nameCompatibility: nameCompatibility.status,
    nameSimilarity: Number(nameSimilarity.toFixed(3)),
    matchedSignals: matches,
    conflicts,
    uncertainSignals: [...new Set(uncertain)],
    identifierNotes: [...new Set(identifiers)],
    imageReview: {
      left: left.image,
      right: right.image,
      visuallyCompared: false,
    },
    products: [left, right],
  }
}

function auditProductIdentities(products = [], { includePairIds = null } = {}) {
  const productsByBrandFamily = new Map()
  for (const product of products) {
    const brand = normalizeText(product.brands?.name || product.brand)
    const family = extractAttributes(product).family
    if (!brand || !family) continue
    const key = `${brand}|${family}`
    const group = productsByBrandFamily.get(key) || []
    group.push(product)
    productsByBrandFamily.set(key, group)
  }

  const pairFilter = includePairIds ? new Set(includePairIds.map(String)) : null
  const candidates = []
  const decisionCounts = {}
  for (const group of productsByBrandFamily.values()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]
        const right = group[rightIndex]
        if (pairFilter && (![left.id, right.id].every((id) => pairFilter.has(String(id))))) continue
        const result = evaluateIdentityPair(left, right)
        if (!result) continue
        decisionCounts[result.decision] = (decisionCounts[result.decision] || 0) + 1
        if (result.decision !== 'separate') candidates.push(result)
      }
    }
  }

  candidates.sort((left, right) => right.score - left.score || left.nameSimilarity - right.nameSimilarity)
  const identifierMatches = candidates.filter((candidate) => candidate.matchedSignals.some(
    (signal) => signal === 'gtin' || signal === 'source_sku_matches_gtin',
  ))
  const identifierMatchCounts = new Map()
  for (const candidate of identifierMatches) {
    for (const product of candidate.products) {
      const id = String(product.id)
      identifierMatchCounts.set(id, (identifierMatchCounts.get(id) || 0) + 1)
    }
  }
  const uniqueIdentifierMatches = new Set(identifierMatches.filter((candidate) => candidate.products.every(
    (product) => identifierMatchCounts.get(String(product.id)) === 1,
  )))
  const uniquelyMatchedProductIds = new Set([...uniqueIdentifierMatches].flatMap(
    (candidate) => candidate.products.map((product) => String(product.id)),
  ))
  for (const candidate of candidates) {
    candidate.evidenceTier = uniqueIdentifierMatches.has(candidate)
      ? 'unique_identifier_match'
      : candidate.products.some((product) => uniquelyMatchedProductIds.has(String(product.id)))
        ? 'alternative_to_identifier_match'
        : 'unresolved_candidate'
  }

  const candidateCountsByProduct = new Map()
  for (const candidate of candidates) {
    for (const product of candidate.products) {
      const entry = candidateCountsByProduct.get(String(product.id)) || { ...product, candidateCount: 0 }
      entry.candidateCount += 1
      candidateCountsByProduct.set(String(product.id), entry)
    }
  }
  const ambiguousProducts = [...candidateCountsByProduct.values()]
    .filter((product) => product.candidateCount > 1)
    .sort((left, right) => right.candidateCount - left.candidateCount)
  const identifierResolvedAmbiguousProductCount = ambiguousProducts.filter(
    (product) => uniquelyMatchedProductIds.has(String(product.id)),
  ).length

  return {
    summary: {
      scannedProducts: products.length,
      candidatePairs: candidates.length,
      decisionCounts,
      ambiguousProductCount: ambiguousProducts.length,
      identifierResolvedAmbiguousProductCount,
      unresolvedAmbiguousProductCount: ambiguousProducts.length - identifierResolvedAmbiguousProductCount,
      ambiguousProductSamples: ambiguousProducts.slice(0, 20).map(({ id, source, name, candidateCount }) => ({
        id,
        source,
        name,
        candidateCount,
        resolution: uniquelyMatchedProductIds.has(String(id)) ? 'unique_identifier_match' : 'unresolved',
      })),
      automaticMerges: 0,
    },
    candidates,
  }
}

module.exports = {
  auditProductIdentities,
  evaluateIdentityPair,
  extractAttributes,
  extractGtin,
  isValidGtin,
  summarizeProduct,
  validateNameCompatibility,
}