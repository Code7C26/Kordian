function extractJsonLdProductItems(html = '') {
  const text = String(html || '')
  const blocks = Array.from(text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
  const products = []

  for (const block of blocks) {
    try {
      const payload = JSON.parse(block[1])
      const graph = Array.isArray(payload) ? payload : Array.isArray(payload?.['@graph']) ? payload['@graph'] : [payload]
      for (const item of graph) {
        const type = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type'] || item?.type]
        if (!type.includes('Product')) continue
        const offers = Array.isArray(item.offers) ? item.offers : [item.offers]
        const offer = offers.find((candidate) => Number(candidate?.price) > 0) || {}
        const priceSpecifications = [
          ...(Array.isArray(offer.priceSpecification) ? offer.priceSpecification : [offer.priceSpecification]),
          ...(Array.isArray(item.priceSpecification) ? item.priceSpecification : [item.priceSpecification]),
        ]
        const listPriceSpecification = priceSpecifications.find((specification) => (
          /listprice/i.test(String(specification?.priceType || ''))
          && Number(specification?.price) > 0
        ))
        const listPrice = Number(
          listPriceSpecification?.price
          || offer.listPrice
          || item.listPrice
          || item.list_price
          || 0,
        ) || null
        products.push({
          sourceProductId: String(item.productID || item.productId || item.sku || item.id || item.product_id || ''),
          sourceSku: String(item.sku || item.productID || item.productId || ''),
          ean: item.ean || item.gtin13 || item.gtin || null,
          name: item.name || item.productName || '',
          brand: String(item.brand?.name || item.brand || item.brandName || ''),
          image: String(item.image || item.imageUrl || (Array.isArray(item.images) ? item.images[0] : '') || ''),
          price: Number(offer.price || item.price || item.lowPrice || item.priceSpecification?.price || 0) || 0,
          listPrice,
          priceValidUntil: offer.priceValidUntil || null,
          available: offer.availability ?? item.availability ?? true,
          sourceCategory: String(item.category || item.itemCategory || item.item_type || ''),
          sourceUrl: item.url || item.sourceUrl || item.link || offer.url || '',
        })
      }
    } catch {
      continue
    }
  }

  return products
}

function extractGenericProductProfile(html = '', { source = 'unknown' } = {}) {
  const text = String(html || '')
  const profile = { source }
  const title = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  if (title) profile.name = title.replace(/\s*\|\s*[^|]+$/, '').trim()

  const productUrl = text.match(/https?:\/\/[^"'\s<>]+(?:\/producto\/|\/product\/)[^"'\s<>]+/i)?.[0]
  if (productUrl) profile.sourceUrl = productUrl

  const price = text.match(/(?:"price"|data-price)\s*[:=]\s*["']?([0-9.,]+)/i)?.[1]
  if (price) profile.price = Number(String(price).replace(/,/g, '')) || 0

  return profile
}

function parseHtmlProductDetails(html = '', {
  source = 'unknown',
  normalizeProduct,
  isValidProduct,
  isSerializableProduct = () => true,
  extractProfile = extractGenericProductProfile,
  normalizeSourceUrl = (value) => String(value || '').trim(),
  enrichProduct = (item) => item,
  fallbackCategory = source,
} = {}) {
  if (typeof normalizeProduct !== 'function') throw new TypeError('normalizeProduct is required')
  if (typeof isValidProduct !== 'function') throw new TypeError('isValidProduct is required')

  const jsonLdProducts = extractJsonLdProductItems(html)
  const profile = extractProfile(html, { source }) || { source }
  const candidates = jsonLdProducts.length ? jsonLdProducts : [profile]
  const products = []
  const discarded = []
  const seen = new Set()

  for (const item of candidates) {
    const enriched = enrichProduct({
      ...item,
      ...profile,
      source,
      available: item.available ?? profile.available ?? true,
      sourceCategory: item.sourceCategory || profile.sourceCategory || fallbackCategory,
      sourceCategories: item.sourceCategories || [item.sourceCategory || profile.sourceCategory || fallbackCategory],
      sourceUrl: normalizeSourceUrl(item.sourceUrl || profile.sourceUrl || ''),
      seller: item.seller || profile.seller || source,
    })
    const product = normalizeProduct(enriched)
    const key = `${product.sourceProductId}|${product.sourceUrl}|${product.name}`

    if (seen.has(key)) continue
    seen.add(key)

    const invalidReason = !isSerializableProduct(product)
      ? 'invalid_product_detail_payload'
      : (!isValidProduct(product) ? 'invalid_product_contract' : null)
    if (invalidReason) {
      discarded.push({ sourceProductId: product.sourceProductId || '', name: product.name || '', reason: invalidReason })
      continue
    }

    products.push(product)
  }

  return {
    products,
    discarded,
    jsonLdProductCount: jsonLdProducts.length,
    profileDetected: Object.keys(profile).length > 1,
  }
}

module.exports = {
  extractJsonLdProductItems,
  extractGenericProductProfile,
  parseHtmlProductDetails,
}
