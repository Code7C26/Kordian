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

  return [primaryOffer, ...(Array.isArray(product.otherStores) ? product.otherStores : [])]
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
