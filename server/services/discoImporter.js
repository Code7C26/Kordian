const DISCO_API_URL = 'https://www.disco.com.ar/api/catalog_system/pub/products/search'

const numeric = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const normalizeName = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const durableProductTerms = ['microondas', 'horno', 'televisor', 'televisores', 'heladera', 'lavarropas', 'aire acondicionado', 'notebook', 'celular', 'computadora']
const beverageTerms = ['cerveza', 'gaseosa', 'jugo', 'agua', 'vino', 'licor', 'vodka', 'soda', 'bebida']

function normalizeDiscoPrice(value, productName, categories = []) {
  const price = numeric(value)
  const searchableText = normalizeName([productName, ...categories].join(' '))
  const isDurableProduct = durableProductTerms.some((term) => searchableText.includes(normalizeName(term)))
  const isBeverage = beverageTerms.some((term) => searchableText.includes(normalizeName(term)))

  // Disco occasionally returns prices one hundred times too small.
  if (price > 0 && price < 100) return price * 100
  if (isBeverage && price > 0 && price < 1000) return price * 100
  return isDurableProduct && price > 0 && price < 1000 ? price * 100 : price
}

function getTokenPrice(token) {
  if (typeof token !== 'string') return null
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString())
    const price = Number(payload?.data?.price)
    return Number.isFinite(price) && price > 0 ? price : null
  } catch {
    return null
  }
}

const categoryMapping = [
  { matches: ['bebidas', 'gaseosas', 'aguas', 'jugos', 'cervezas', 'vinos', 'soda', 'energizante'], category: 'Almacén y Alimentos', subcategory: 'Bebidas' },
  { matches: ['azucar', 'edulcorante', 'miel', 'endulzante'], category: 'Almacén y Alimentos', subcategory: 'Azúcares y dulces' },
  { matches: ['yerba', 'yerbas', 'mate', 'tes', 'infusiones', 'cafes', 'mate cocido', 'te'], category: 'Almacén y Alimentos', subcategory: 'Infusiones' },
  { matches: ['leche', 'leches', 'yogur', 'yogures', 'queso', 'quesos', 'lacteo', 'lacteos', 'dulce de leche', 'crema', 'manteca'], category: 'Alimentos Frescos y Refrigerados', subcategory: 'Lácteos' },
  { matches: ['limpieza', 'lavandina', 'detergente', 'desinfectante', 'papel higienico', 'escoba'], category: 'Limpieza e Higiene', subcategory: 'Limpieza del hogar' },
  { matches: ['perfumeria', 'cuidado oral', 'cuidado capilar', 'shampoo', 'jabones', 'higiene personal'], category: 'Limpieza e Higiene', subcategory: 'Higiene personal' },
  { matches: ['electro', 'televisores', 'informatica', 'audio', 'notebook', 'celular'], category: 'Electrónica y Electrodomésticos', subcategory: 'Computación' },
]

function matchesNormalizedTerm(text, match) {
  const normalizedText = normalizeName(text)
  const normalizedMatch = normalizeName(match)
  if (!normalizedMatch) return false
  if (normalizedMatch.length <= 2) return false
  const textTokens = normalizedText.split(/\s+/).filter(Boolean)
  const matchTokens = normalizedMatch.split(/\s+/).filter(Boolean)
  return matchTokens.every((token) => token.length > 2 ? textTokens.includes(token) : normalizedText.includes(token))
}

function suggestMapping(categories = [], product = {}) {
  const text = [...categories, product.productName, product.brand].map(normalizeName).join(' ')
  return categoryMapping.find(({ matches }) => matches.some((match) => matchesNormalizedTerm(text, match))) || null
}

function isOnlineOnly(item) {
  const text = JSON.stringify(item).toLowerCase()
  return /(exclusiv[oa]|solo|únicamente|unicamente)[^"\n]{0,30}(online|web|internet)|(online|web|internet)[^"\n]{0,30}(exclusiv[oa]|solo)/i.test(text)
}

function isLikelyProductImage(image, productName) {
  if (!image || !productName) return false
  const imageText = normalizeName(image)
  const productTokens = normalizeName(productName).split(/\s+/).filter((token) => token.length >= 5)
  return productTokens.some((token) => imageText.includes(token))
}

function getOffer(item) {
  const sellers = (item.items || []).flatMap((catalogItem) => catalogItem.sellers || [])
  const seller = sellers.find((candidate) => candidate.commertialOffer?.IsAvailable && numeric(candidate.commertialOffer?.Price) > 0)
    || sellers.find((candidate) => numeric(candidate.commertialOffer?.Price) > 0)
  const offer = seller?.commertialOffer || {}
  const rawPrice = offer.Price || offer.PriceWithoutDiscount || offer.FullSellingPrice
  const tokenPrice = getTokenPrice(offer.PriceToken)
  const normalizedPrice = normalizeDiscoPrice(rawPrice, item.productName, item.categories)
  const tokenMatchesScaledPrice = tokenPrice && Number(rawPrice) > 0 && Math.abs(tokenPrice - Number(rawPrice) * 100) < 0.01
  return {
    price: tokenMatchesScaledPrice && Number(rawPrice) < 1000 ? tokenPrice : normalizedPrice,
    listPrice: normalizeDiscoPrice(offer.ListPrice || offer.PriceWithoutDiscount, item.productName, item.categories),
    available: Boolean(offer.IsAvailable),
    quantity: numeric(offer.AvailableQuantity),
    seller: seller?.sellerName || 'Disco',
  }
}

export function normalizeDiscoProduct(item) {
  const firstItem = item.items?.[0] || {}
  const categories = Array.isArray(item.categories) ? item.categories : []
  const mapping = suggestMapping(categories, item)
  const offer = getOffer(item)
  return {
    source: 'disco',
    sourceProductId: String(item.productId || ''),
    sourceSku: String(firstItem.itemId || ''),
    ean: firstItem.ean || null,
    name: item.productName || firstItem.name || '',
    brand: item.brand || '',
    image: isLikelyProductImage(firstItem.images?.[0]?.imageUrl, item.productName) ? firstItem.images[0].imageUrl : '',
    price: offer.price,
    listPrice: offer.listPrice,
    available: offer.available,
    stock: offer.quantity,
    sourceCategory: categories.at(-1) || categories[0] || null,
    sourceCategories: categories,
    sourceUrl: item.link || null,
    proposedCategory: mapping?.category || null,
    proposedSubcategory: mapping?.subcategory || null,
    mappingStatus: mapping ? 'propuesta_automatica' : 'pendiente',
    onlineOnly: isOnlineOnly(item),
    seller: offer.seller,
  }
}

async function fetchDiscoPage({ query = '', from = 0, to = 49 } = {}) {
  const safeFrom = Math.max(0, Number(from) || 0)
  const safeTo = Math.max(safeFrom, Number(to) || safeFrom)
  const pageSize = Math.min(50, Math.max(1, safeTo - safeFrom + 1))
  const params = new URLSearchParams({ _from: String(safeFrom), _to: String(safeFrom + pageSize - 1) })

  if (query.trim()) params.set('ft', query.trim())

  const response = await fetch(`${DISCO_API_URL}?${params}`)
  if (!response.ok) throw new Error(`Disco respondió con HTTP ${response.status}`)

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function fetchDiscoPreview({ query = '', from = 0, to = 49 } = {}) {
  const safeFrom = Math.max(0, Number(from) || 0)
  const safeTo = Math.max(safeFrom, Number(to) || safeFrom)

  const products = []
  for (let pageFrom = safeFrom; pageFrom <= safeTo; pageFrom += 50) {
    const pageTo = Math.min(pageFrom + 49, safeTo)
    const data = await fetchDiscoPage({ query, from: pageFrom, to: pageTo })
    if (!data.length) break

    products.push(...data
      .map(normalizeDiscoProduct)
      .filter((product) => product.sourceProductId && product.price > 0 && !product.onlineOnly))

    if (data.length < pageTo - pageFrom + 1) break
  }

  return products
}

export async function fetchDiscoProductById(sourceProductId) {
  const params = new URLSearchParams({ fq: `productId:${sourceProductId}`, _from: '0', _to: '0' })
  const response = await fetch(`${DISCO_API_URL}?${params}`)
  if (!response.ok) throw new Error(`Disco respondió con HTTP ${response.status}`)
  const data = await response.json()
  const item = Array.isArray(data) ? data[0] : null
  return item ? normalizeDiscoProduct(item) : null
}

export function findPreviewMatches(previewProducts, localProducts = []) {
  const byId = new Set(localProducts.map((product) => String(product.source_product_id || product.external_id || '')))
  const byEan = new Set(localProducts.map((product) => String(product.ean || '')).filter(Boolean))

  return previewProducts.map((product) => ({
    ...product,
    possibleDuplicate: byId.has(product.sourceProductId)
      || (product.ean && byEan.has(String(product.ean))),
  }))
}
