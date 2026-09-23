export function isValidCatalogProduct(product = {}) {
  if (!product || typeof product !== 'object') return false

  const name = String(product.name || '').trim()
  if (!name) return false

  const offers = Array.isArray(product.offers) ? product.offers : []
  if (!offers.length) return false

  return offers.some((offer) => {
    const price = Number(offer?.cash_price ?? offer?.cashPrice ?? offer?.price ?? 0)
    const supermarket = String(offer?.supermarket || offer?.supermarket_name || offer?.storeName || '').trim()
    return Number.isFinite(price) && price > 0 && supermarket.length > 0
  })
}
