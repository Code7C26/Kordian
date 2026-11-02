import { normalizeSearchText } from './searchTerms.js'

function normalizeProductName(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function findSharedListCatalogProduct(products, { productId, itemName }) {
  const candidates = Array.isArray(products) ? products : []
  if (productId) {
    const productById = candidates.find((product) => String(product?.id) === String(productId))
    if (productById) return productById
  }

  const normalizedItemName = normalizeProductName(itemName)
  if (!normalizedItemName) return null
  return candidates.find((product) => normalizeProductName(product?.name) === normalizedItemName) || null
}

export function normalizeSharedListSearchResults(products, query) {
  const terms = normalizeProductName(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const seenProductIds = new Set()

  return (Array.isArray(products) ? products : [])
    .filter((product) => {
      if (!product || product.id === null || product.id === undefined || !String(product.name || '').trim()) {
        return false
      }
      const productId = String(product.id)
      if (seenProductIds.has(productId)) return false
      const searchableText = normalizeProductName([
        product.name,
        product.brand,
        product.brands?.name,
        product.category,
        product.categories?.name,
        product.subcategory,
        product.subcategories?.name,
        ...(Array.isArray(product.offers)
          ? product.offers.map((offer) => offer?.supermarket || offer?.supermarket_name)
          : []),
      ].filter(Boolean).join(' '))
      if (!terms.every((term) => searchableText.includes(term))) return false
      seenProductIds.add(productId)
      return true
    })
    .map((product) => {
      const listedPrice = Number(
        product.currentPrice
        ?? product.current_price
        ?? product.price
        ?? product.cash_price
        ?? product.cashPrice,
      )
      const offerPrices = (Array.isArray(product.offers) ? product.offers : [])
        .map((offer) => Number(offer?.cash_price ?? offer?.cashPrice ?? offer?.price))
        .filter((price) => Number.isFinite(price) && price > 0)
      const currentPrice = Number.isFinite(listedPrice) && listedPrice > 0
        ? listedPrice
        : offerPrices.length ? Math.min(...offerPrices) : 0
      return { ...product, currentPrice }
    })
}

export function attachSharedListSearchSupermarkets(products, supermarkets) {
  const imageByName = new Map(
    (Array.isArray(supermarkets) ? supermarkets : [])
      .filter((supermarket) => supermarket?.name)
      .map((supermarket) => [
        normalizeSearchText(supermarket.name).trim(),
        supermarket.image || '',
      ]),
  )

  return products.map((product) => {
    const offers = (Array.isArray(product.offers) ? product.offers : [])
      .map((offer) => ({
        ...offer,
        price: Number(offer.cash_price ?? offer.cashPrice ?? offer.price ?? 0),
        supermarket: offer.supermarket
          || offer.supermarket_name
          || offer.storeName
          || offer.store_name
          || offer.store?.name
          || '',
      }))
      .filter((offer) => offer.supermarket)
      .sort((left, right) => (
        (left.price > 0 ? left.price : Number.POSITIVE_INFINITY)
        - (right.price > 0 ? right.price : Number.POSITIVE_INFINITY)
      ))
    const selectedOffer = offers.find((offer) => offer.price > 0) || offers[0]
    const supermarket = selectedOffer?.supermarket
      || product.supermarket
      || product.supermarket_name
      || product.storeName
      || product.store_name
      || ''
    const supermarketImage = product.supermarketImage
      || product.supermarket_image
      || selectedOffer?.image
      || imageByName.get(normalizeSearchText(supermarket).trim())
      || ''

    return { ...product, supermarket, supermarketImage }
  })
}

export function getSharedListFallbackSearchTerms(query, limit = 4) {
  const seen = new Set()
  return String(query || '')
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((term) => {
      const normalized = normalizeSearchText(term)
      if (normalized.length < 2 || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .sort((first, second) => second.length - first.length)
    .slice(0, limit)
}
