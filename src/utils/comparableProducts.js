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

export function extractMeasure(product) {
  const text = [product.name, product.description, product.presentation, product.unit].join(' ')
  const match = text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|mg|l|ml|cc|un(?:idad(?:es)?)?|u)\b/i)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  const unit = match[2].toLowerCase()
  if (!amount || unit === 'u' || unit.startsWith('un')) return null
  if (unit === 'kg') return { amount, baseUnit: 'kg', normalizedAmount: amount }
  if (unit === 'g' || unit === 'mg') return { amount, baseUnit: 'kg', normalizedAmount: unit === 'g' ? amount / 1000 : amount / 1000000 }
  if (unit === 'l') return { amount, baseUnit: 'l', normalizedAmount: amount }
  if (unit === 'ml' || unit === 'cc') return { amount, baseUnit: 'l', normalizedAmount: amount / 1000 }
  return null
}

export function normalizePrice(product, price) {
  const measure = extractMeasure(product)
  if (!measure || !price) return { price, unitPrice: null, measure }
  return { price, unitPrice: price / measure.normalizedAmount, measure }
}

export function findComparableReferences(product, products = [], classificationById = new Map()) {
  const classification = classificationById.get(String(product.id))
  const productSubcategory = getCatalogValue(product, 'subcategory')
  if ((!classification?.categoryId || !classification?.subcategoryId) && !productSubcategory) {
    return { level: 'inflacion_general', references: [], referencePrice: 0, confidence: 'baja' }
  }

  const productMeasure = extractMeasure(product)
  const candidates = products
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
    .filter(Boolean)
    .sort((first, second) => second.score - first.score)
    .slice(0, 8)

  if (!candidates.length) return { level: 'subcategoria', references: [], referencePrice: 0, confidence: 'baja' }
  const normalizedCandidates = productMeasure
    ? candidates.filter(({ priceData }) => priceData.measure?.baseUnit === productMeasure.baseUnit)
    : []
  const productPrices = normalizedCandidates.length === candidates.length && productMeasure
    ? candidates.map(({ priceData }) => priceData.unitPrice).filter(Boolean)
    : candidates.map(({ priceData }) => priceData.price).filter(Boolean)
  const referencePrice = calculateMedian(productPrices)
  return {
    level: candidates.length >= 3 ? 'grupo_comparable' : 'subcategoria',
    references: candidates.map(({ product, priceData }) => ({
      id: product.id,
      name: product.name,
      brand: product.brands?.name || product.brand || null,
      price: priceData.price,
      unitPrice: priceData.unitPrice,
    })),
    referencePrice,
    normalized: Boolean(productMeasure && productPrices.length),
    confidence: candidates.length >= 3 ? 'alta' : 'media',
  }
}
