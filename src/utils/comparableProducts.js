import { calculateMedian } from './priceStatus.js'

const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const getCatalogValue = (product, field) => product[field]
  || product[`${field}_name`]
  || product[`${field}s`]?.name
  || product[field === 'subcategory' ? 'subcategories' : 'categories']?.name
  || null

export function extractMeasure(product) {
  const text = [product.name, product.description, product.presentation, product.unit].join(' ')
  const matches = [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo(?:s)?|g|gr|grs|gramo(?:s)?|mg|l|lt|lts|litro(?:s)?|ml|cc|cl|un(?:idad(?:es)?)?|uds?|u)\b/gi)]
    .filter((match) => !/^u|un|ud/i.test(match[2]))
  const match = matches.at(-1)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  const unit = match[2].toLowerCase()
  if (!amount || unit === 'u' || unit.startsWith('un')) return null
  if (/^kg|^kilo/.test(unit)) return { amount, baseUnit: 'kg', normalizedAmount: amount }
  if (/^g|^gr|^gramo/.test(unit)) return { amount, baseUnit: 'kg', normalizedAmount: amount / 1000 }
  if (unit === 'mg') return { amount, baseUnit: 'kg', normalizedAmount: amount / 1000000 }
  if (/^l|^lt|^litro/.test(unit)) return { amount, baseUnit: 'l', normalizedAmount: amount }
  if (unit === 'ml' || unit === 'cc' || unit === 'cl') return { amount, baseUnit: 'l', normalizedAmount: amount / (unit === 'cl' ? 100 : 1000) }
  return null
}

export function normalizePrice(product, price) {
  const measure = extractMeasure(product)
  if (!measure || !price) return { price, unitPrice: null, measure }
  return { price, unitPrice: price / measure.normalizedAmount, measure }
}

const comparableLevelConfig = [
  { id: 'same_brand_subcategory', weight: 30 },
  { id: 'same_subcategory', weight: 15 },
  { id: 'same_category', weight: 7 },
]

function getComparableKey(product, field, classification) {
  return normalize(getCatalogValue(product, field) || classification?.[`${field}Id`])
}

export function createComparableIndex(products = [], classificationById = new Map()) {
  const records = products.map((candidate) => {
    const candidateClassification = classificationById.get(String(candidate.id))
    const candidateMeasure = extractMeasure(candidate)
    const offerPrices = (candidate.offers || [])
      .map((offer) => Number(offer.cash_price ?? offer.cashPrice))
      .filter((price) => price > 0)
    if (!offerPrices.length) return null
    return {
      product: candidate,
      brand: normalize(candidate.brands?.name || candidate.brand),
      type: normalize(candidateClassification?.type),
      variant: normalize(candidateClassification?.variant),
      subcategory: getComparableKey(candidate, 'subcategory', candidateClassification),
      category: getComparableKey(candidate, 'category', candidateClassification),
      baseUnit: candidateMeasure?.baseUnit || null,
      priceData: normalizePrice(candidate, calculateMedian(offerPrices)),
    }
  }).filter(Boolean)
  const byKey = (keySelector) => {
    const index = new Map()
    for (const record of records) {
      const key = keySelector(record)
      if (!key) continue
      const group = index.get(key) || []
      group.push(record)
      index.set(key, group)
    }
    return index
  }
  return {
    byBrandSubcategory: byKey((record) => `${record.brand}|${record.subcategory}|${record.baseUnit || 'unit'}`),
    bySubcategory: byKey((record) => `${record.subcategory}|${record.baseUnit || 'unit'}`),
    byCategory: byKey((record) => `${record.category}|${record.baseUnit || 'unit'}`),
  }
}

export function findComparableReferenceLevels(product, products = [], classificationById = new Map(), preparedIndex = null) {
  const classification = classificationById.get(String(product.id))
  const productMeasure = extractMeasure(product)
  const productBaseUnit = productMeasure?.baseUnit || null
  const productBrand = normalize(product.brands?.name || product.brand)
  const productType = normalize(classification?.type)
  const productVariant = normalize(classification?.variant)
  const productSubcategory = getComparableKey(product, 'subcategory', classification)
  const productCategory = getComparableKey(product, 'category', classification)
  const index = preparedIndex || createComparableIndex(products, classificationById)
  const unitKey = productBaseUnit || 'unit'
  const withoutSelf = (records) => records.filter((candidate) => String(candidate.product.id) !== String(product.id))
  const groups = {
    same_brand_subcategory: productBrand
      ? withoutSelf(index.byBrandSubcategory.get(`${productBrand}|${productSubcategory}|${unitKey}`) || [])
      : [],
    same_subcategory: withoutSelf(index.bySubcategory.get(`${productSubcategory}|${unitKey}`) || [])
      .filter((candidate) => !productBrand || candidate.brand !== productBrand),
    same_category: withoutSelf(index.byCategory.get(`${productCategory}|${unitKey}`) || [])
      .filter((candidate) => candidate.subcategory !== productSubcategory),
  }
  const sameType = (records) => productType ? records.filter((candidate) => candidate.type === productType) : records
  const sameIdentity = (records) => productVariant
    ? records.filter((candidate) => candidate.variant === productVariant)
    : records
  const typedSubcategory = sameType(groups.same_subcategory)
  const typedBrand = sameType(groups.same_brand_subcategory)
  const identityBrand = sameIdentity(typedBrand)
  if (productType) groups.same_brand_subcategory = identityBrand.length ? identityBrand : typedBrand
  if (productType && typedSubcategory.length) groups.same_subcategory = typedSubcategory
  const currentComparablePrice = productBaseUnit
    ? productMeasure && product.offers?.length
      ? normalizePrice(product, calculateMedian(product.offers.map((offer) => Number(offer.cash_price)).filter((price) => price > 0))).unitPrice
      : 0
    : product.offers?.length
      ? calculateMedian(product.offers.map((offer) => Number(offer.cash_price)).filter((price) => price > 0))
      : 0
  const coherentCandidates = (records) => currentComparablePrice > 0
    ? records.filter((candidate) => {
      const candidatePrice = productBaseUnit ? candidate.priceData.unitPrice : candidate.priceData.price
      return candidatePrice > 0 && candidatePrice / currentComparablePrice <= 5 && currentComparablePrice / candidatePrice <= 5
    })
    : records

  return comparableLevelConfig.map((level) => {
    const references = coherentCandidates(groups[level.id])
    const values = references.map(({ priceData }) => productBaseUnit ? priceData.unitPrice : priceData.price).filter((price) => price > 0)
    return {
      ...level,
      count: references.length,
      referencePrice: calculateMedian(values),
      references: references.slice(0, 8).map(({ product: reference, priceData }) => ({
        id: reference.id,
        name: reference.name,
        brand: reference.brands?.name || reference.brand || null,
        price: priceData.price,
        unitPrice: priceData.unitPrice,
      })),
    }
  })
}

export function findComparableReferences(product, products = [], classificationById = new Map(), preparedIndex = null) {
  const levels = findComparableReferenceLevels(product, products, classificationById, preparedIndex)
  const specificLevels = levels.filter((level) => level.id !== 'same_category' && level.count > 0)
  const availableLevels = specificLevels.length ? specificLevels : levels.filter((level) => level.count > 0)
  if (!availableLevels.length) {
    return { level: 'inflacion_general', references: [], referencePrice: 0, confidence: 'baja' }
  }
  const totalWeight = availableLevels.reduce((sum, level) => sum + level.weight, 0)
  const referencePrice = availableLevels.reduce((sum, level) => sum + (level.referencePrice * level.weight), 0) / totalWeight
  const strongestLevel = availableLevels[0]
  const visibleLevels = availableLevels.filter((level) => level.id !== 'same_category')
  const visibleReferenceCount = visibleLevels.reduce((sum, level) => sum + level.count, 0)
  return {
    level: visibleReferenceCount >= 3 ? 'grupo_comparable' : 'subcategoria',
    references: visibleLevels.flatMap((level) => level.references.map((reference) => ({ ...reference, level: level.id }))),
    levels: availableLevels,
    referencePrice,
    normalized: Boolean(extractMeasure(product)),
    confidence: strongestLevel.count >= 3 ? 'alta' : 'media',
  }
}
