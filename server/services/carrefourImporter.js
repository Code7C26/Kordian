const { createCommonProduct, getCommonInvalidReason } = require('./importerContract')

const CARREFOUR_BASE_URL = 'https://www.carrefour.com.ar'
const CARREFOUR_SEARCH_URL = `${CARREFOUR_BASE_URL}/api/catalog_system/pub/products/search`
const CARREFOUR_REGIONS_URL = `${CARREFOUR_BASE_URL}/api/checkout/pub/regions`
const CARREFOUR_MAX_RESULTS = 20
const CARREFOUR_MAX_POSTAL_CODE_LENGTH = 8
const CARREFOUR_REQUEST_TIMEOUT_MS = 15000
const REGION_CACHE_TTL_MS = 60 * 60 * 1000

function normalizePostalCode(value) {
  const postalCode = String(value || '').trim().toUpperCase()
  return postalCode.length >= 4
    && postalCode.length <= CARREFOUR_MAX_POSTAL_CODE_LENGTH
    && /^[A-Z0-9]+$/.test(postalCode)
    ? postalCode
    : ''
}

function isValidGtin(value) {
  const gtin = String(value || '').trim()
  if (!/^(?:\d{8}|\d{12,14})$/.test(gtin)) return false

  const digits = gtin.split('').map(Number)
  const checkDigit = digits.pop()
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === checkDigit
}

function getCarrefourOffer(product) {
  const items = Array.isArray(product?.items) ? product.items : []
  if (items.length !== 1) return { item: null, offer: null, seller: null, variantCount: items.length }

  const item = items[0]
  const sellers = Array.isArray(item?.sellers) ? item.sellers : []
  const seller = sellers.find((candidate) => (
    String(candidate?.sellerName || '').trim().toLowerCase() === 'carrefour'
  )) || null
  return {
    item,
    offer: seller?.commertialOffer || null,
    seller,
    variantCount: items.length,
  }
}

function normalizeCarrefourProduct(raw = {}) {
  const product = raw || {}
  const { item, offer, seller, variantCount } = getCarrefourOffer(product)
  const categories = Array.isArray(product.categories) ? product.categories : []
  const sourceCategory = String(categories[0] || '').split('/').filter(Boolean).at(-1) || ''
  const image = item?.images?.find((candidate) => candidate?.imageUrl)?.imageUrl || ''
  const rawUrl = String(product.link || '')
  let sourceUrl = ''
  try {
    const url = new URL(rawUrl, CARREFOUR_BASE_URL)
    if (url.origin === CARREFOUR_BASE_URL && url.pathname.endsWith('/p')) sourceUrl = url.toString()
  } catch {
    sourceUrl = ''
  }

  return {
    ...createCommonProduct({
      source: 'carrefour',
      sourceProductId: String(product.productId || ''),
      sourceSku: String(item?.itemId || ''),
      ean: item?.ean || null,
      name: product.productName || '',
      brand: product.brand || '',
      image,
      price: offer?.Price,
      listPrice: offer?.ListPrice,
      available: offer?.IsAvailable === true && Number(offer?.AvailableQuantity) > 0,
      stock: offer?.AvailableQuantity,
      sourceCategory,
      sourceCategories: categories,
      sourceUrl,
      seller: seller?.sellerName || '',
    }, 'carrefour'),
    variantCount,
    sellerName: String(seller?.sellerName || ''),
  }
}

function getCarrefourProductInvalidReason(product = {}) {
  if (!product.sourceProductId) return 'Sin identificador de Carrefour'
  if (product.variantCount !== 1) return 'Producto con variantes múltiples; requiere revisión manual'
  if (String(product.sellerName || '').trim().toLowerCase() !== 'carrefour') return 'Vendedor de Carrefour no verificado'
  if (!product.sourceSku) return 'Sin SKU identificable'
  if (!isValidGtin(product.ean)) return 'Sin EAN/GTIN válido'
  if (!product.sourceUrl) return 'Sin URL de producto verificable'
  if (!product.name.trim()) return 'Sin nombre'
  if (!Number.isFinite(Number(product.price)) || Number(product.price) <= 0) return 'Sin precio vigente'
  if (product.available !== true || Number(product.stock) <= 0) return 'Sin stock disponible para la zona consultada'
  return getCommonInvalidReason(product)
}

function isValidCarrefourProduct(product = {}) {
  return getCarrefourProductInvalidReason(product) === null
}

function findCarrefourLocalMatch(item = {}, products = []) {
  const sourceProductId = String(item.sourceProductId || '')
  const ean = String(item.ean || '')
  const sourceMatches = (products || []).filter((product) => (
    product?.source === 'carrefour'
    && String(product.source_product_id || '') === sourceProductId
  ))
  const eanMatches = (products || []).filter((product) => String(product?.ean || '') === ean)

  if (sourceMatches.length > 1 || eanMatches.length > 1) {
    return { product: null, matchedBy: null, ambiguous: true, reason: 'El identificador coincide con varios productos del catálogo' }
  }

  const bySourceId = sourceMatches[0] || null
  const byEan = eanMatches[0] || null
  if (bySourceId && String(bySourceId.ean || '') !== ean) {
    return { product: null, matchedBy: null, ambiguous: true, reason: 'El ID de Carrefour ya existe con otro EAN' }
  }
  if (bySourceId && byEan && String(bySourceId.id) !== String(byEan.id)) {
    return { product: null, matchedBy: null, ambiguous: true, reason: 'El ID y el EAN apuntan a productos distintos' }
  }

  const product = bySourceId || byEan
  return {
    product,
    matchedBy: bySourceId ? 'source_product_id' : byEan ? 'ean' : null,
    ambiguous: false,
    reason: null,
  }
}

function createCarrefourImporter({ fetchImpl = fetch, now = Date.now } = {}) {
  const regionCache = new Map()

  async function requestJson(url) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CARREFOUR_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Carrefour respondió HTTP ${response.status}`)
      }
      const contentType = response.headers?.get?.('content-type') || ''
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('Carrefour no devolvió una respuesta JSON del catálogo')
      }
      return await response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  async function getRegionId(postalCodeValue) {
    const postalCode = normalizePostalCode(postalCodeValue)
    if (!postalCode) throw new TypeError('Ingresá un código postal argentino válido')

    const cached = regionCache.get(postalCode)
    if (cached && now() - cached.cachedAt < REGION_CACHE_TTL_MS) return cached.regionId

    const url = new URL(CARREFOUR_REGIONS_URL)
    url.searchParams.set('country', 'ARG')
    url.searchParams.set('postalCode', postalCode)
    const regions = await requestJson(url)
    const regionId = Array.isArray(regions)
      ? String(regions.find((region) => region?.id)?.id || '')
      : String(regions?.id || '')
    if (!regionId) throw new Error(`Carrefour no informó una región de entrega para el CP ${postalCode}`)

    regionCache.set(postalCode, { regionId, cachedAt: now() })
    return regionId
  }

  async function fetchProducts({ query = '', postalCode, productId = '' } = {}) {
    const searchText = String(query || '').trim().slice(0, 100)
    if (!productId && searchText.length < 2) throw new TypeError('Ingresá al menos dos caracteres para buscar')
    if (productId && !/^\d{1,20}$/.test(String(productId))) throw new TypeError('Identificador de Carrefour inválido')

    const regionId = await getRegionId(postalCode)
    const url = new URL(CARREFOUR_SEARCH_URL)
    if (productId) {
      url.searchParams.set('fq', `productId:${productId}`)
      url.searchParams.set('_from', '0')
      url.searchParams.set('_to', '0')
    } else {
      url.searchParams.set('ft', searchText)
      url.searchParams.set('_from', '0')
      url.searchParams.set('_to', String(CARREFOUR_MAX_RESULTS - 1))
    }
    url.searchParams.set('regionId', regionId)

    const response = await requestJson(url)
    if (!Array.isArray(response)) throw new Error('Carrefour devolvió un formato de catálogo inesperado')
    if (productId && response.some((product) => String(product?.productId || '') !== String(productId))) {
      throw new Error('Carrefour devolvió un producto distinto al solicitado')
    }
    return response
  }

  async function fetchPreview({ query = '', postalCode } = {}) {
    const data = await fetchProducts({ query, postalCode })
    const products = []
    const discarded = []

    for (const rawProduct of data.slice(0, CARREFOUR_MAX_RESULTS)) {
      const product = normalizeCarrefourProduct(rawProduct)
      const reason = getCarrefourProductInvalidReason(product)
      if (reason) discarded.push({
        sourceProductId: product.sourceProductId || null,
        name: product.name || null,
        reason,
      })
      else products.push(product)
    }

    return { products, discarded, postalCode: normalizePostalCode(postalCode), resultLimit: CARREFOUR_MAX_RESULTS }
  }

  async function fetchProductById(productId, { postalCode } = {}) {
    const [rawProduct] = await fetchProducts({ productId, postalCode })
    return rawProduct ? normalizeCarrefourProduct(rawProduct) : null
  }

  return { fetchPreview, fetchProductById, getRegionId }
}

const carrefourImporter = createCarrefourImporter()

module.exports = {
  CARREFOUR_MAX_RESULTS,
  createCarrefourImporter,
  findCarrefourLocalMatch,
  getCarrefourProductInvalidReason,
  isValidCarrefourProduct,
  isValidGtin,
  normalizeCarrefourProduct,
  normalizePostalCode,
  ...carrefourImporter,
}
