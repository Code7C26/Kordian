const PRODUCT_MEASURE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilo(?:s)?|g|gr|gramo(?:s)?|mg|l|lt|lts|litro(?:s)?|ml|cc|cl|unidad(?:es)?|un|uds?|u)\b/i

export function hasProductQuantity(product = {}) {
  const text = [product.name, product.description, product.presentation, product.unit].filter(Boolean).join(' ')
  return PRODUCT_MEASURE_PATTERN.test(text)
}

export function hasProductImage(product = {}) {
  const image = String(product.image || '').trim().toLowerCase()
  if (!image || image === 'null' || image === 'undefined') return false
  return !/(?:no[-_ ]?product[-_ ]?image|placeholder|sin[-_ ]?imagen|default[-_ ]?product|hero\.(?:png|jpe?g|webp))/.test(image)
}

export function isValidCatalogProduct(product = {}) {
  if (!product || typeof product !== 'object') return false

  const name = String(product.name || '').trim()
  if (!name) return false

  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/\b(envio|envios|entrega|delivery|shipping|oferta|promo|promocion|promociones)\b/.test(normalizedName)) return false

  const offers = Array.isArray(product.offers) ? product.offers : []
  if (!offers.length) return false
  if (!hasProductQuantity(product) && !hasProductImage(product)) return false

  return offers.some((offer) => {
    const price = Number(offer?.cash_price ?? offer?.cashPrice ?? offer?.price ?? 0)
    const supermarket = String(offer?.supermarket || offer?.supermarket_name || offer?.storeName || '').trim()
    return Number.isFinite(price) && price > 0 && supermarket.length > 0
  })
}
