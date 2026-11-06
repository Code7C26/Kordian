import { calculateMedian } from './priceStatus.js'

const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const getCatalogValue = (product, field) => product[field]
  || product[`${field}_name`]
  || product[`${field}s`]?.name
  || product[field === 'subcategory' ? 'subcategories' : 'categories']?.name
  || null

const getCatalogId = (product, field) => product[`${field}_id`]
  || product[`${field}Id`]
  || product[field === 'subcategory' ? 'subcategories' : 'categories']?.id
  || null

const catalogGroupKey = (product, classification) => {
  const categoryId = getCatalogId(product, 'category')
  const subcategoryId = getCatalogId(product, 'subcategory')
  if (categoryId && subcategoryId) return JSON.stringify(['ids', String(categoryId), String(subcategoryId)])

  const category = getCatalogValue(product, 'category')
  const subcategory = getCatalogValue(product, 'subcategory')
  if (category && subcategory) return JSON.stringify(['names', normalize(category), normalize(subcategory)])

  if (classification?.categoryId && classification?.subcategoryId) {
    return JSON.stringify(['classification', classification.categoryId, classification.subcategoryId])
  }
  return null
}

export function createComparableProductIndex(products = [], classificationById = new Map()) {
  const byCatalogGroup = new Map()

  for (const product of products) {
    const key = catalogGroupKey(product, classificationById.get(String(product.id)))
    if (!key) continue
    const matches = byCatalogGroup.get(key) || []
    matches.push(product)
    byCatalogGroup.set(key, matches)
  }

  return { byCatalogGroup }
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
  const groupKey = catalogGroupKey(product, classification)
  if (!groupKey) {
    return { level: 'inflacion_general', references: [], referencePrice: 0, confidence: 'baja' }
  }

  const productMeasure = extractMeasure(product)
  let candidateProducts = products
  if (productIndex) {
    candidateProducts = productIndex.byCatalogGroup.get(groupKey) || []
  }
  const candidates = candidateProducts
    .filter((candidate) => String(candidate.id) !== String(product.id))
    .map((candidate) => {
      const candidateClassification = classificationById.get(String(candidate.id))
      if (catalogGroupKey(candidate, candidateClassification) !== groupKey) return null
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
    references: candidates.map(({ product: reference, priceData }) => ({
      id: reference.id,
      name: reference.name,
      brand: reference.brands?.name || reference.brand || null,
      price: priceData.price,
      unitPrice: priceData.unitPrice,
    })),
    referencePrice,
    normalized: Boolean(productMeasure && productPrices.length),
    confidence: candidates.length >= 3 ? 'alta' : 'media',
  }
}
