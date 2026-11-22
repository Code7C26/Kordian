import { getProductOffers } from './productOffers.js'

export function applyDiscoPromotionToOffers(offers, promotion) {
  const promotionPrice = Number(promotion?.promotionPrice)
  const referencePrice = Number(promotion?.referencePrice)
  if (
    !Array.isArray(offers)
    || !Number.isFinite(promotionPrice)
    || promotionPrice <= 0
    || !Number.isFinite(referencePrice)
    || referencePrice <= promotionPrice
  ) {
    return offers
  }

  return offers
    .map((offer) => (
      String(offer.supermarket || offer.storeName || '').trim().toLowerCase() === 'disco'
        ? { ...offer, price: promotionPrice, listPrice: referencePrice }
        : offer
    ))
    .sort((first, second) => first.price - second.price)
}

export function applyDiscoPromotionToProduct(product, promotion) {
  const promotionPrice = Number(promotion?.promotionPrice)
  const referencePrice = Number(promotion?.referencePrice)
  if (
    !Number.isFinite(promotionPrice)
    || promotionPrice <= 0
    || !Number.isFinite(referencePrice)
    || referencePrice <= promotionPrice
  ) {
    return product
  }

  const offers = getProductOffers(product)
  if (!offers.some((offer) => (
    String(offer.supermarket || offer.storeName || '').trim().toLowerCase() === 'disco'
  ))) {
    return product
  }

  const promotedOffers = applyDiscoPromotionToOffers(offers, promotion)
  const primaryOffer = promotedOffers[0]
  if (!primaryOffer) return product

  const avgMarketPrice = promotedOffers.reduce((sum, offer) => sum + offer.price, 0) / promotedOffers.length
  return {
    ...product,
    currentPrice: primaryOffer.price,
    primaryStore: {
      ...product.primaryStore,
      id: primaryOffer.id,
      name: primaryOffer.supermarket,
      listPrice: primaryOffer.listPrice,
      image: primaryOffer.image || product.primaryStore?.image || '',
    },
    primaryOffer,
    otherStores: promotedOffers.slice(1),
    avgMarketPrice,
    percentageDiff: avgMarketPrice
      ? ((avgMarketPrice - primaryOffer.price) / avgMarketPrice) * 100
      : 0,
  }
}
