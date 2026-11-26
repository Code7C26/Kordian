const PRICE_SCALE_FACTORS = [100, 1000]

function isPriceScaleArtifact(historicalPrice, currentPrice) {
  const ratio = historicalPrice / currentPrice
  return PRICE_SCALE_FACTORS.some((factor) => (
    (ratio >= factor * 0.95 && ratio <= factor * 1.05)
    || (ratio >= 1 / (factor * 1.05) && ratio <= 1 / (factor * 0.95))
  ))
}

function isDiscoScaleArtifact(historicalPrice, currentPrice) {
  const ratio = historicalPrice / currentPrice
  return ratio >= 85 && ratio <= 110
}

export function filterDisplayPriceHistory(history = [], offers = []) {
  const currentPricesByOfferId = new Map((offers || [])
    .filter((offer) => offer?.id !== null && offer?.id !== undefined)
    .map((offer) => [
      String(offer.id),
      Number(offer.price ?? offer.cash_price ?? offer.cashPrice),
    ]))
  const discoOfferIds = new Set((offers || [])
    .filter((offer) => String(
      offer?.supermarket || offer?.supermarket_name || offer?.storeName || offer?.name || '',
    ).trim().toLowerCase() === 'disco')
    .map((offer) => String(offer.id)))

  return history.filter((point) => {
    if (point?.source === 'price_token_normalization') return false

    const offerId = point?.offerId ?? point?.offer_id
    const currentPrice = currentPricesByOfferId.get(String(offerId))
    const historicalPrice = Number(point?.avgPrice ?? point?.minPrice ?? point?.cash_price ?? point?.price)
    if (!Number.isFinite(currentPrice) || currentPrice <= 0
      || !Number.isFinite(historicalPrice) || historicalPrice <= 0) return true

    if (discoOfferIds.has(String(offerId))
      && historicalPrice > currentPrice
      && isDiscoScaleArtifact(historicalPrice, currentPrice)) return false

    return !isPriceScaleArtifact(historicalPrice, currentPrice)
  })
}
