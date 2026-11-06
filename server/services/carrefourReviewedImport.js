function sameMoneyValue(first, second) {
  const firstPrice = Number(first)
  const secondPrice = Number(second)
  if (!Number.isFinite(firstPrice) || !Number.isFinite(secondPrice)) return first === second
  return Number(firstPrice.toFixed(2)) === Number(secondPrice.toFixed(2))
}

function getExistingCarrefourOfferConflict(item, product) {
  const carrefourOffers = (product?.offers || [])
    .filter((offer) => offer.supermarket === 'Carrefour')
  if (carrefourOffers.length > 1) return 'El producto local tiene varias ofertas Carrefour'

  const existingOffer = carrefourOffers[0]
  if (!existingOffer) return null

  const expectedListPrice = Number(item.listPrice) > Number(item.price) ? Number(item.listPrice) : null
  const sameOffer = sameMoneyValue(existingOffer.cash_price, item.price)
    && (Number(existingOffer.list_price) || null) === expectedListPrice
    && String(existingOffer.source_product_id || '') === String(item.sourceProductId || '')
    && String(existingOffer.source_sku || '') === String(item.sourceSku || '')
    && String(existingOffer.source_url || '') === String(item.sourceUrl || '')

  return sameOffer
    ? null
    : 'Ya existe una oferta Carrefour con precio o identidad diferente; no se actualizará automáticamente'
}

module.exports = { getExistingCarrefourOfferConflict }
