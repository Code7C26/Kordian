const EXCLUDED_STORES = new Set(['becerra', 'carrefour', 'mami'])
const TARGET_MILK_SOURCE_PRODUCT_ID = 'prod3262764'

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isTargetSerenisimaMilk(product = {}) {
  const sourceProductId = String(product.source_product_id || product.sourceProductId || '')
  if (sourceProductId === TARGET_MILK_SOURCE_PRODUCT_ID) return true

  const name = normalizeText(product.name)
  return name.includes('leche')
    && name.includes('serenisima')
    && name.includes('descremada')
    && /(?:^|\s)2\s*(?:grasa\s*)?sachet\b/.test(name)
    && /\b1\s*(?:l|lt|lts|litro)\b/.test(name)
}

export function filterProductOffers(product, offers = []) {
  if (!isTargetSerenisimaMilk(product)) return offers

  return offers.filter((offer) => {
    const storeName = normalizeText(
      offer?.supermarket || offer?.supermarket_name || offer?.storeName || offer?.name,
    )
    return !EXCLUDED_STORES.has(storeName)
  })
}

export function getProductPrice(product = {}, offers = []) {
  const offerPrices = offers
    .map((offer) => Number(offer?.price ?? offer?.cash_price ?? offer?.cashPrice ?? 0))
    .filter((price) => Number.isFinite(price) && price > 0)
  if (offerPrices.length) return Math.min(...offerPrices)

  for (const value of [product.currentPrice, product.price]) {
    const fallbackPrice = Number(value)
    if (Number.isFinite(fallbackPrice) && fallbackPrice > 0) return fallbackPrice
  }
  return 0
}

export function getProductOffers(product = {}) {
  const primaryStore = product.primaryStore
  const primaryPrice = Number(product.currentPrice ?? primaryStore?.price ?? primaryStore?.cash_price ?? 0)
  const primaryOffer = product.primaryOffer || (primaryStore?.name && Number.isFinite(primaryPrice) && primaryPrice > 0
    ? {
        ...primaryStore,
        price: primaryPrice,
        supermarket: primaryStore.name,
      }
    : null)

  return filterProductOffers(product, [primaryOffer, ...(Array.isArray(product.otherStores) ? product.otherStores : [])])
    .filter((offer) => {
      const price = Number(offer?.price ?? offer?.cash_price ?? offer?.cashPrice ?? 0)
      const supermarket = String(
        offer?.supermarket || offer?.supermarket_name || offer?.storeName || offer?.name || '',
      ).trim()
      return Number.isFinite(price) && price > 0 && supermarket.length > 0
    })
    .map((offer) => ({
      ...offer,
      price: Number(offer.price ?? offer.cash_price ?? offer.cashPrice),
      supermarket: offer.supermarket || offer.supermarket_name || offer.storeName || offer.name,
    }))
    .sort((first, second) => first.price - second.price)
}
