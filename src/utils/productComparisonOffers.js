const localComparisonOffers = [
  { supermarket: 'Becerra', cash_price: 3700 },
  { supermarket: 'Mami', cash_price: 3500 },
  { supermarket: 'Carrefour', cash_price: 3400 },
]

const targetProductName = 'gaseosa cola sabor original 1.25 lts coca cola'

function normalizeStoreName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function addProductComparisonOffers(product, offers = []) {
  const productName = String(product?.name || '').trim().toLowerCase()
  const isTargetProduct = String(product?.id || '') === '18075'
    || String(product?.ean || '') === '7790895012266'
    || productName === targetProductName
  if (!isTargetProduct) return offers

  const localStoreNames = new Set(
    localComparisonOffers.map((offer) => normalizeStoreName(offer.supermarket)),
  )
  const existingOffers = offers.filter(
    (offer) => !localStoreNames.has(normalizeStoreName(offer.supermarket)),
  )

  return [
    ...existingOffers,
    ...localComparisonOffers.map((offer) => ({
      ...offer,
      id: `local-18075-${normalizeStoreName(offer.supermarket)}`,
    })),
  ]
}
