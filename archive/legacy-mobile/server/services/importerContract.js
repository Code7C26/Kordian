const COMMON_IMPORTER_FIELDS = {
  source: 'source',
  sourceProductId: 'sourceProductId',
  sourceSku: 'sourceSku',
  ean: 'ean',
  name: 'name',
  brand: 'brand',
  image: 'image',
  price: 'price',
  listPrice: 'listPrice',
  available: 'available',
  stock: 'stock',
  sourceCategory: 'sourceCategory',
  sourceCategories: 'sourceCategories',
  sourceUrl: 'sourceUrl',
  proposedCategory: 'proposedCategory',
  proposedSubcategory: 'proposedSubcategory',
  mappingStatus: 'mappingStatus',
  onlineOnly: 'onlineOnly',
  seller: 'seller',
}

const DEFAULT_PRODUCT_MEASURE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilo(?:s)?|g|gr|gramo(?:s)?|mg|l|lt|lts|litro(?:s)?|ml|cc|cl|unidad(?:es)?|un|uds?|u)\b/i
const INVALID_PRODUCT_NAME_PATTERN = /\b(envio|envios|entrega|delivery|shipping|oferta|promo|promocion|promociones)\b/i

function numeric(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function createCommonProduct(raw = {}, source = 'unknown') {
  const item = raw || {}
  const product = {
    source: String(item.source || source),
    sourceProductId: String(item.sourceProductId || item.productId || item.source_product_id || item.id || ''),
    sourceSku: String(item.sourceSku || item.sourceSku || item.sku || item.itemId || item.item_id || ''),
    ean: item.ean || item.eanCode || item.barcode || null,
    name: String(item.name || item.productName || item.title || ''),
    brand: String(item.brand || item.brandName || item.marca || ''),
    image: String(item.image || item.images?.[0]?.imageUrl || ''),
    price: numeric(item.price),
    listPrice: numeric(item.listPrice || item.ListPrice || item.list_price),
    available: typeof item.available === 'boolean' ? item.available : normalizeBoolean(item.available),
    stock: numeric(item.stock || item.quantity || item.AvailableQuantity),
    sourceCategory: item.sourceCategory || item.category || item.source_categories?.at(-1) || null,
    sourceCategories: Array.isArray(item.sourceCategories) ? item.sourceCategories : Array.isArray(item.categories) ? item.categories : [],
    sourceUrl: item.sourceUrl || item.link || item.url || null,
    proposedCategory: item.proposedCategory || null,
    proposedSubcategory: item.proposedSubcategory || null,
    mappingStatus: item.mappingStatus || 'pendiente',
    onlineOnly: Boolean(item.onlineOnly),
    seller: item.seller || item.sellerName || 'unknown',
  }

  if (!product.image && item.imageUrl) product.image = String(item.imageUrl)
  return product
}

function getCommonInvalidReason(product = {}, {
  productMeasurePattern = DEFAULT_PRODUCT_MEASURE_PATTERN,
  invalidProductNamePattern = INVALID_PRODUCT_NAME_PATTERN,
} = {}) {
  const name = String(product.name || '').trim()
  const price = numeric(product.price)
  if (!product.sourceProductId) return 'Sin identificador'
  if (!name) return 'Sin nombre'
  if (invalidProductNamePattern.test(name)) return 'Promoción, envío u oferta no válida'
  if (price <= 0) return 'Sin precio válido'
  if (product.available === false) return 'Sin stock disponible'
  if (product.onlineOnly) return 'Exclusivo online'

  const hasImage = typeof product.image === 'string' && product.image.trim().length > 0
  const text = [name, product.description, product.presentation, product.unit].filter(Boolean).join(' ')
  const hasMeasure = productMeasurePattern.test(text)
  if (!hasImage && !hasMeasure) return 'Sin imagen ni cantidad identificable'

  return null
}

function isValidCommonProduct(product = {}, options = {}) {
  return !getCommonInvalidReason(product, options)
}

function createImporterContract({
  source,
  normalizeProduct,
  getInvalidReason = getCommonInvalidReason,
  isValidProduct = isValidCommonProduct,
  fetchPreview,
  fetchProductById,
  findMatches,
}) {
  return {
    source,
    normalizeProduct,
    getInvalidReason,
    isValidProduct,
    fetchPreview,
    fetchProductById,
    findMatches,
  }
}

function validateImporterContract(contract = {}) {
  const required = ['source', 'normalizeProduct', 'getInvalidReason', 'isValidProduct', 'fetchPreview', 'fetchProductById', 'findMatches']
  const missingFields = required.filter((field) => {
    if (field === 'source') return !contract.source || typeof contract.source !== 'string'
    return typeof contract[field] !== 'function'
  })

  return {
    valid: missingFields.length === 0,
    source: contract.source || null,
    missingFields,
    normalizedExample: contract.normalizeProduct ? contract.normalizeProduct({ source: contract.source || 'unknown', name: 'Example', price: 100, available: true }) : null,
  }
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function extractOfferPrice(localProduct = {}) {
  const offers = Array.isArray(localProduct.offers) ? localProduct.offers : []
  const offer = offers.find((candidate) => safeNumber(candidate?.cash_price ?? candidate?.cashPrice ?? candidate?.price) > 0)
  if (offer) return safeNumber(offer.cash_price ?? offer.cashPrice ?? offer.price)
  const fallback = safeNumber(localProduct.price ?? localProduct.cash_price ?? localProduct.cashPrice)
  return Number.isFinite(fallback) ? fallback : null
}

function compareSimulationReport(contract = {}, preview = { products: [], discarded: [] }, localProducts = []) {
  const products = Array.isArray(preview.products) ? preview.products : []
  const discarded = Array.isArray(preview.discarded) ? preview.discarded : []
  const valid = products.filter((product) => contract.isValidProduct ? contract.isValidProduct(product) : true)
  const invalid = discarded.map((item) => ({
    sourceProductId: item.sourceProductId || item.source_product_id || item.id || null,
    name: item.name || item.productName || null,
    reason: item.reason || 'discared_by_contract',
  }))
  const matches = contract.findMatches ? contract.findMatches(products, localProducts) : []

  const localBySourceId = new Map()
  const localByEan = new Map()
  for (const localProduct of localProducts || []) {
    const sourceId = String(localProduct.source_product_id || localProduct.sourceProductId || localProduct.external_id || '')
    if (sourceId) localBySourceId.set(sourceId, localProduct)
    const ean = String(localProduct.ean || '')
    if (ean) localByEan.set(ean, localProduct)
  }

  const priceComparison = products.map((product) => {
    const sourceId = String(product.sourceProductId || '')
    const ean = String(product.ean || '')
    const reference = localBySourceId.get(sourceId)
      || (ean ? localByEan.get(ean) : null)
      || null
    const sourcePrice = safeNumber(product.price)
    const localPrice = reference ? extractOfferPrice(reference) : null
    const delta = sourcePrice && localPrice ? ((sourcePrice - localPrice) / Math.max(localPrice, 1)) * 100 : null
    return {
      sourceProductId: product.sourceProductId || null,
      name: product.name || null,
      sourcePrice,
      localPrice,
      deltaPercent: delta,
      hasLocalReference: Boolean(reference),
      referenceMatchedBy: reference && sourceId && reference.source_product_id === sourceId ? 'source_product_id' : reference && ean && String(reference.ean || '') === ean ? 'ean' : 'name_brand_or_fallback',
    }
  })

  return {
    source: contract.source || 'unknown',
    productCount: products.length,
    validCount: valid.length,
    discardedCount: discarded.length,
    duplicateCount: matches.filter((item) => item.possibleDuplicate).length,
    priceComparison,
    dryRun: true,
    writeSafety: {
      productWritesAllowed: false,
      priceHistoryWritesAllowed: false,
      mutationSurface: 'preview_only',
      reason: 'simulation comparison contract is dry-run and writes are intentionally suppressed',
    },
    accepted: products.map((product) => ({
      sourceProductId: product.sourceProductId,
      name: product.name,
      available: product.available,
      price: product.price,
      sourceCategory: product.sourceCategory || null,
      proposedCategory: product.proposedCategory || null,
      proposedSubcategory: product.proposedSubcategory || null,
    })),
    invalid,
    matches,
  }
}

function normalizeTaxonomyText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bde\b|\by\b|\bel\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildTaxonomyComparison(product = {}, localCategories = [], localSubcategories = []) {
  const sourceCategory = String(product.sourceCategory || product.source_category || '').trim()
  const proposedCategory = String(product.proposedCategory || product.category || '').trim()
  const proposedSubcategory = String(product.proposedSubcategory || product.subcategory || '').trim()

  let inferredCategory = proposedCategory
  let inferredSubcategory = proposedSubcategory

  if (!inferredCategory) {
    const sourceNorm = normalizeTaxonomyText(sourceCategory)
    const category = localCategories.find((candidate) => normalizeTaxonomyText(candidate.name) === sourceNorm)
    if (category) {
      inferredCategory = category.name
    }
  }

  if (!inferredSubcategory && inferredCategory) {
    const sourceNorm = normalizeTaxonomyText(sourceCategory)
    const category = localCategories.find((candidate) => candidate.name === inferredCategory)
    const subcategory = localSubcategories.find((candidate) => {
      const sameName = normalizeTaxonomyText(candidate.name) === sourceNorm
      const sameCategory = String(candidate.category_id) === String(category?.id)
      return sameName && sameCategory
    })
    if (subcategory) {
      inferredSubcategory = subcategory.name
    }
  }

  const category = localCategories.find((candidate) => candidate.name === inferredCategory || normalizeTaxonomyText(candidate.name) === normalizeTaxonomyText(inferredCategory))
  const subcategory = localSubcategories.find((candidate) => {
    const sameName = candidate.name === inferredSubcategory || normalizeTaxonomyText(candidate.name) === normalizeTaxonomyText(inferredSubcategory)
    const sameCategory = String(candidate.category_id) === String(category?.id)
    return sameName && sameCategory
  })

  return {
    sourceCategory,
    proposedCategory: inferredCategory,
    proposedSubcategory: inferredSubcategory,
    mappingStatus: product.mappingStatus || (inferredCategory && inferredSubcategory ? 'propuesta_automatica' : 'pendiente'),
    categoryExists: Boolean(category),
    subcategoryExists: Boolean(subcategory),
    compatible: Boolean(category && subcategory),
  }
}

module.exports = {
  COMMON_IMPORTER_FIELDS,
  DEFAULT_PRODUCT_MEASURE_PATTERN,
  INVALID_PRODUCT_NAME_PATTERN,
  createCommonProduct,
  getCommonInvalidReason,
  isValidCommonProduct,
  createImporterContract,
  validateImporterContract,
  compareSimulationReport,
  buildTaxonomyComparison,
}
