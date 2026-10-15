import { calculateMedian } from './priceStatus.js'

const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const getCatalogValue = (product, field) => product[field]
  || product[`${field}_name`]
  || product[`${field}s`]?.name
  || product[field === 'subcategory' ? 'subcategories' : 'categories']?.name
  || null

const sameCatalogGroup = (firstProduct, secondProduct, firstClassification, secondClassification) => {
  const firstSubcategory = getCatalogValue(firstProduct, 'subcategory')
  const secondSubcategory = getCatalogValue(secondProduct, 'subcategory')
  if (firstSubcategory && secondSubcategory) return normalize(firstSubcategory) === normalize(secondSubcategory)
  return firstClassification?.categoryId === secondClassification?.categoryId
    && firstClassification?.subcategoryId === secondClassification?.subcategoryId
}

const classificationGroupKey = (classification) => JSON.stringify([
  classification?.categoryId,
  classification?.subcategoryId,
])

export function createComparableProductIndex(products = [], classificationById = new Map()) {
  const bySubcategory = new Map()
  const byClassification = new Map()

  for (const product of products) {
    const subcategory = getCatalogValue(product, 'subcategory')
    if (subcategory) {
      const key = normalize(subcategory)
      const matches = bySubcategory.get(key) || []
      matches.push(product)
      bySubcategory.set(key, matches)
    }

    const key = classificationGroupKey(classificationById.get(String(product.id)))
    const matches = byClassification.get(key) || []
    matches.push(product)
    byClassification.set(key, matches)
  }

  return { bySubcategory, byClassification }
}

export function extractMeasure(product) {
  const text = [product.name, product.description, product.presentation, product.unit].join(' ')
  const matches = [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo(?:s)?|g|gr|grs|gramo(?:s)?|mg|l|lt|lts|litro(?:s)?|ml|cc|cl|unidad(?:es)?|un|u|uds?|ud)\b/gi)]
  const match = matches.at(-1)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  const unit = match[2].toLowerCase()
  if (!amount) return null
  if (/^u$|^un$|^uds?$|^ud$|^unidad(?:es)?$/.test(unit)) return { amount, baseUnit: 'unit', normalizedAmount: amount }
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

export function findComparableReferences(product, products = [], classificationById = new Map(), productIndex = null) {
  const classification = classificationById.get(String(product.id))
  const productSubcategory = getCatalogValue(product, 'subcategory')
  if ((!classification?.categoryId || !classification?.subcategoryId) && !productSubcategory) {
    return { level: 'inflacion_general', references: [], referencePrice: 0, confidence: 'baja' }
  }
}

export function findComparableReferenceLevels(product, products = [], classificationById = new Map(), preparedIndex = null) {
  const classification = classificationById.get(String(product.id))
  const productMeasure = extractMeasure(product)
  let candidateProducts = products
  if (productIndex) {
    const candidatesById = new Map()
    const groupCandidates = productIndex.byClassification.get(classificationGroupKey(classification)) || []
    for (const candidate of groupCandidates) candidatesById.set(String(candidate.id), candidate)
    if (productSubcategory) {
      const subcategoryCandidates = productIndex.bySubcategory.get(normalize(productSubcategory)) || []
      for (const candidate of subcategoryCandidates) candidatesById.set(String(candidate.id), candidate)
    }
    candidateProducts = [...candidatesById.values()]
  }
  const candidates = candidateProducts
    .filter((candidate) => String(candidate.id) !== String(product.id))
    .map((candidate) => {
      const candidateClassification = classificationById.get(String(candidate.id))
      if (!sameCatalogGroup(product, candidate, classification, candidateClassification)) return null
      const sameType = candidateClassification?.type && candidateClassification.type === classification?.type
      const sameVariant = classification?.variant && candidateClassification?.variant && normalize(classification.variant) === normalize(candidateClassification.variant)
      const candidateMeasure = extractMeasure(candidate)
      const sameBaseUnit = productMeasure && candidateMeasure && productMeasure.baseUnit === candidateMeasure.baseUnit
      const offerPrices = (candidate.offers || []).map((offer) => Number(offer.cash_price ?? offer.cashPrice)).filter((price) => price > 0)
      if (!offerPrices.length) return null
      const priceData = normalizePrice(candidate, calculateMedian(offerPrices))
      return {
        product: candidate,
        score: (sameVariant ? 3 : 0) + (sameType ? 2 : 0) + (sameBaseUnit ? 1 : 0),
        priceData,
      }
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
