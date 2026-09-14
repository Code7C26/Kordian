const https = require('https')
const { createCommonProduct, createImporterContract, getCommonInvalidReason, isValidCommonProduct } = require('./importerContract')

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normalizeMamiSourceUrl(url = '') {
  const text = String(url || '').trim()
  if (!text) return ''
  return text
    .replace(/^http:\/\/www\.supermami\.com\.ar\//i, 'https://www.supermami.com.ar/')
    .replace(/^http:\/\//i, 'https://')
}

function normalizeMamiProduct(item = {}) {
  const source = 'mami'
  const raw = { ...item, source }
  if (raw.sourceUrl) raw.sourceUrl = normalizeMamiSourceUrl(raw.sourceUrl)
  if (raw.url) raw.sourceUrl = normalizeMamiSourceUrl(raw.url)
  return createCommonProduct(raw, source)
}

function getMamiInvalidReason(product = {}) {
  return getCommonInvalidReason(product)
}

function isValidMamiProduct(product = {}) {
  return isValidCommonProduct(product)
}

async function fetchMamiHomeHtml() {
  return await new Promise((resolve) => {
    try {
      const req = https.get('https://www.dinoonline.com.ar/super/home', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; arprice-local/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve('')
          return
        }
        let html = ''
        res.on('data', (chunk) => { html += String(chunk) })
        res.on('end', () => resolve(html))
      })
      req.on('error', () => resolve(''))
    } catch {
      resolve('')
    }
  })
}

async function fetchMamiProductHtml(productRoute = '') {
  if (!productRoute) return ''
  return await new Promise((resolve) => {
    try {
      const route = productRoute.startsWith('http') ? productRoute : `https://www.supermami.com.ar${productRoute}`
      const req = https.get(route, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; arprice-local/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve('')
          return
        }
        let html = ''
        res.on('data', (chunk) => { html += String(chunk) })
        res.on('end', () => resolve(html))
      })
      req.on('error', () => resolve(''))
    } catch {
      resolve('')
    }
  })
}

function extractMamiCategoryHints(html = '') {
  if (!html) return []
  const seen = new Set()
  const raw = String(html).match(/supermami-[a-z0-9-]+/g) || []
  for (const token of raw) {
    const clean = token.replace(/supermami-/, '').replace(/[_/\-.]+/g, ' ').trim()
    if (clean.length >= 3) seen.add(clean)
  }
  return Array.from(seen).slice(0, 12)
}

function extractMamiCategoryRoutes(html = '') {
  if (!html) return []
  const routes = new Set()
  const regex = /\/super\/categoria\/supermami-[^"'\s<>]+/g
  for (const match of String(html).match(regex) || []) {
    const route = match.replace(/;jsessionid=[^?&\s<>]*/g, '')
    routes.add(route)
  }
  return Array.from(routes).slice(0, 20)
}

function extractMamiProductRoutes(html = '') {
  if (!html) return []
  const routes = new Set()
  const regex = /\/super\/producto\/[^"'\s<>]+/g
  for (const match of String(html).match(regex) || []) {
    const route = match.replace(/;jsessionid=[^?&\s<>]*/g, '')
    routes.add(route)
  }
  return Array.from(routes).slice(0, 40)
}

function extractMamiProductJsonLd(html = '') {
  const text = String(html || '')
  const blocks = Array.from(text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))
  const products = []
  for (const block of blocks) {
    try {
      const payload = JSON.parse(block[1])
      const graph = Array.isArray(payload) ? payload : Array.isArray(payload['@graph']) ? payload['@graph'] : [payload]
      for (const item of graph) {
        if (!item || item['@type'] !== 'Product' && item.type !== 'Product') continue
        const name = item.name || item.productName || ''
        if (!name) continue
        const price = item.offers?.price || item.price || item.lowPrice || item.priceSpecification?.price || 0
        const rawProductId = String(item.productID || item.sku || item.id || item.product_id || '')
        const cleanedProductId = String(rawProductId).replace(/[^0-9]/g, '')
        const looksLikeEAN = cleanedProductId.length >= 12 && cleanedProductId.startsWith('7')
        const safeProductId = looksLikeEAN ? '' : rawProductId
        products.push({
          sourceProductId: safeProductId,
          sourceSku: String(item.sku || item.productID || ''),
          ean: item.ean || item.gtin13 || item.gtin || null,
          name,
          brand: String(item.brand?.name || item.brand || item.brandName || ''),
          image: String(item.image || item.imageUrl || (Array.isArray(item.images) ? item.images[0] : '') || ''),
          price: Number(price) || 0,
          available: Boolean(item.availability || item.offers?.availability || true),
          sourceCategory: String(item.category || item.itemCategory || item.item_type || ''),
          sourceUrl: normalizeMamiSourceUrl(item.url || item.sourceUrl || item.link || null),
        })
      }
    } catch {
      continue
    }
  }
  return products
}

function extractMamiDetailProductsFromHtml(html = '') {
  const text = String(html || '')
  const routeMatch = text.match(/https?:\/\/[^"'\s<>]+\/super\/producto\/[^"'\s<>]+/i)?.[0]
  const productUrl = normalizeMamiSourceUrl(routeMatch || '')

  const productJsonLd = extractMamiProductJsonLd(text)
  const productProfile = extractMamiProductProfile(text)

  const products = []
  for (const item of productJsonLd) {
    const normalized = normalizeMamiProduct({
      ...item,
      sourceProductId: productProfile.sourceProductId || item.sourceProductId || stableSourceProductId(item.sourceProductId || ''),
      sourceSku: item.sourceSku || productProfile.sourceSku || '',
      ean: item.ean || productProfile.ean || null,
      name: productProfile.name || item.name || '',
      brand: productProfile.brand || item.brand || '',
      price: Number(productProfile.price || item.price || 0),
      image: item.image || productProfile.image || '',
      sourceCategory: sanitizeSourceCategory(item.sourceCategory || productProfile.sourceCategory || 'Mami'),
      sourceCategories: sanitizeSourceCategories(item.sourceCategories || [item.sourceCategory || productProfile.sourceCategory || 'Mami']),
      seller: 'Mami',
      sourceUrl: normalizeMamiSourceUrl(productUrl || item.sourceUrl || productProfile.sourceUrl || ''),
      available: Boolean(item.available || productProfile.available || true),
    })

    if (!isSerializableMamiProduct(normalized)) {
      continue
    }

    if (!normalized.name || normalized.price <= 0 || !normalized.sourceProductId || !normalized.sourceCategory || !normalized.sourceCategories.length || !isValidCommonProduct(normalized)) {
      continue
    }

    products.push(normalized)
  }

  if (!products.length && Object.keys(productProfile).length > 1) {
    const fallback = normalizeMamiProduct({
      ...productProfile,
      sourceProductId: productProfile.sourceProductId || stableSourceProductId(productProfile.sourceProductId || ''),
      sourceSku: productProfile.sourceSku || '',
      ean: productProfile.ean || null,
      name: productProfile.name || '',
      brand: productProfile.brand || '',
      price: Number(productProfile.price || 0),
      image: productProfile.image || '',
      sourceCategory: sanitizeSourceCategory(productProfile.sourceCategory || 'Mami'),
      sourceCategories: sanitizeSourceCategories([productProfile.sourceCategory || 'Mami']),
      seller: 'Mami',
      sourceUrl: normalizeMamiSourceUrl(productUrl || productProfile.sourceUrl || ''),
      available: true,
    })

    if (isSerializableMamiProduct(fallback) && isValidCommonProduct(fallback)) {
      products.push(fallback)
    }
  }

  return products
}

function sanitizeSourceCategory(value = '') {
  const raw = String(value || '').trim()
  const cleaned = raw.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s\-&/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'Mami'
}

function sanitizeSourceCategories(value = []) {
  const list = Array.isArray(value) ? value : []
  const cleaned = list
    .map((entry) => sanitizeSourceCategory(entry))
    .filter((entry) => entry && entry !== 'Mami')
  return cleaned.length ? cleaned : ['Mami']
}

function stableSourceProductId(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('prod')) return raw
  const numeric = raw.replace(/[^0-9]/g, '')
  if (numeric.length >= 1) return `prod${numeric}`
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
}

function isSerializableMamiProduct(product = {}) {
  const hasSourceProductId = Boolean(String(product.sourceProductId || '').trim())
  const hasName = Boolean(String(product.name || '').trim())
  const hasPrice = Number(product.price) > 0
  const hasSourceUrl = Boolean(String(product.sourceUrl || '').trim().startsWith('https://www.supermami.com.ar/'))
  return hasSourceProductId && hasName && hasPrice && hasSourceUrl
}

function extractMamiProductProfile(html = '') {
  const text = String(html || '')
  const profile = { source: 'mami' }
  const title = text.match(/<title>([^<]+)<\/title>/i)?.[1]
  const cleanTitle = title ? title.replace(/\s*\|\s*Super MaMi/i, '').trim() : ''
  if (cleanTitle) profile.name = cleanTitle

  const itemBrand = text.match(/"item_brand":"([^"]+)"/)?.[1] || text.match(/"brand":"([^"]+)"/)?.[1] || ''
  if (itemBrand) profile.brand = itemBrand

  const eventPrice = text.match(/"price":\s*([0-9.,]+)/)?.[1]
  if (eventPrice) profile.price = Number(String(eventPrice).replace(/[^0-9.]/g, ''))

  const productId = text.match(/productId\s*:\s*\"prod([0-9]+)\"|productId\s*=\s*\"prod([0-9]+)\"|idProductoSelected[^\n]*value=\"prod([0-9]+)\"/i)?.slice(1).find(Boolean)
  if (productId) profile.sourceProductId = `prod${productId}`

  const productUrl = text.match(/https?:\/\/[^\"'\s<>]+\/super\/producto\/[^\"'\s<>]+/i)?.[0]
  if (productUrl) profile.sourceUrl = normalizeMamiSourceUrl(productUrl)

  return profile
}

async function fetchMamiPreviewReport({ query = '', from = 0, to = 49 } = {}) {
  const html = await fetchMamiHomeHtml()
  const categoryHints = extractMamiCategoryHints(html)
  const categoryRoutes = extractMamiCategoryRoutes(html)
  const productRoutes = extractMamiProductRoutes(html)
  const routeWindow = productRoutes.slice(from, Math.min(productRoutes.length, to + 1))
  const products = []
  const discarded = []
  let detailJsonLdProductCount = 0
  let detailProfileCount = 0

  for (const route of routeWindow) {
    const detailHtml = await fetchMamiProductHtml(route)
    if (!detailHtml) continue

    const jsonLdProducts = extractMamiProductJsonLd(detailHtml)
    detailJsonLdProductCount += jsonLdProducts.length

    const productProfile = extractMamiProductProfile(detailHtml)
    if (Object.keys(productProfile).length > 1) detailProfileCount += 1

    const htmlDetailProducts = extractMamiDetailProductsFromHtml(detailHtml)

    for (const product of htmlDetailProducts) {
      const normalized = normalizeMamiProduct(product)
      if (!isSerializableMamiProduct(normalized)) {
        discarded.push({
          sourceProductId: normalized.sourceProductId || product.sourceProductId || '',
          name: normalized.name || product.name || '',
          reason: 'invalid_product_detail_payload',
        })
        continue
      }

      if (!normalized.name || normalized.price <= 0 || !normalized.sourceProductId || !normalized.sourceCategory || !normalized.sourceCategories.length || !isValidCommonProduct(normalized)) {
        discarded.push({
          sourceProductId: normalized.sourceProductId || product.sourceProductId || '',
          name: normalized.name || product.name || '',
          reason: 'invalid_product_detail_payload',
        })
        continue
      }

      products.push(normalized)
    }

    for (const item of jsonLdProducts) {
      const stableId = stableSourceProductId(productProfile.sourceProductId || item.sourceProductId || '')
      const stableName = String(productProfile.name || item.name || '').trim()
      const stablePrice = Number(productProfile.price || item.price || 0)
      const stableCategory = sanitizeSourceCategory(item.sourceCategory || 'Mami')
      const stableCategories = sanitizeSourceCategories(item.sourceCategory ? [item.sourceCategory] : [stableCategory])

      const rawNormalized = {
        ...item,
        sourceProductId: stableId,
        productName: stableName,
        name: stableName,
        brand: productProfile.brand || item.brand || '',
        price: stablePrice,
        sourceCategory: stableCategory,
        sourceCategories: stableCategories,
        seller: 'Mami',
        available: true,
        sourceUrl: normalizeMamiSourceUrl(productProfile.sourceUrl || item.sourceUrl || `https://www.supermami.com.ar${route}`),
      }

      const normalized = normalizeMamiProduct(rawNormalized)

      if (!isSerializableMamiProduct(normalized)) {
        discarded.push({
          sourceProductId: normalized.sourceProductId || item.sourceProductId || '',
          name: normalized.name || item.name || '',
          reason: 'invalid_product_detail_payload',
        })
        continue
      }

      if (!normalized.name || normalized.price <= 0 || !normalized.sourceProductId || !normalized.sourceCategory || !normalized.sourceCategories.length || !isValidCommonProduct(normalized)) {
        discarded.push({
          sourceProductId: normalized.sourceProductId || item.sourceProductId || '',
          name: normalized.name || item.name || '',
          reason: 'invalid_product_detail_payload',
        })
        continue
      }

      products.push(normalized)
    }
  }

  const serializableFeed = products.map((product) => ({
    source: product.source,
    sourceProductId: product.sourceProductId,
    sourceSku: product.sourceSku,
    ean: product.ean,
    name: product.name,
    brand: product.brand,
    image: product.image,
    price: product.price,
    listPrice: product.listPrice,
    available: product.available,
    stock: product.stock,
    sourceCategory: product.sourceCategory,
    sourceCategories: product.sourceCategories,
    sourceUrl: product.sourceUrl,
    proposedCategory: product.proposedCategory,
    proposedSubcategory: product.proposedSubcategory,
    mappingStatus: product.mappingStatus,
    onlineOnly: product.onlineOnly,
    seller: product.seller,
  }))

  const payloadType = detailJsonLdProductCount > 0
    ? 'json_ld_found'
    : (detailProfileCount > 0)
      ? 'profile_hint_found'
      : 'none'

  const contractDecision = serializableFeed.length > 0
    ? 'contractable_preview_feed'
    : 'feed_not_yet_contractable'

  const feedSerializable = products.length > 0 && products.every((product) => isSerializableMamiProduct(product))
  const feedReliability = feedSerializable
    ? 'detail_json_ld_and_profile_hint'
    : 'html_shell_only'

  return {
    products,
    discarded,
    sourceRead: {
      source: 'mami',
      mode: html ? 'html_category_shell_fallback' : 'html_fetch_failed',
      htmlFetched: Boolean(html),
      categoryHints,
      categoryRoutes,
      categoryRouteCount: categoryRoutes.length,
      productRoutes,
      productRouteCount: productRoutes.length,
      sampleUsed: false,
      scope: 'html_home_category_shell_only',
      payloadType,
      readStrategy: 'route_hints_from_html_home_shell',
      warning: 'No real product payload was found in the public HTML shell; preview remains dry-run and write-safe.',
      serializableFeed: feedSerializable,
      feedStructure: 'json_ld_detail_product_feed',
      feedClosed: true,
      feedSize: serializableFeed.length,
      feedSerializable,
      feedReliability,
      contractDecision,
      contractStatus: 'preview_only_write_disabled',
      query,
      from,
      to,
      detailJsonLdProductCount,
      detailProfileCount,
      detailProfileHint: products[0] || null,
      detailRouteAttempted: routeWindow[0] || '',
    },
  }
}

async function fetchMamiProductById(sourceProductId) {
  return null
}

function classifyMamiTaxonomy(product = {}) {
  const { buildTaxonomyComparison } = require('./importerContract')
  return buildTaxonomyComparison(product, [{ id: '1', name: 'Almacén y Alimentos' }], [{ id: '10', category_id: '1', name: 'Golosinas y snacks' }, { id: '11', category_id: '1', name: 'Bebidas' }, { id: '12', category_id: '1', name: 'Panificados' }])
}

function findMamiPreviewMatches(previewProducts, localProducts = []) {
  const byId = new Set(localProducts.map((product) => String(product.source_product_id || product.external_id || '')).filter(Boolean))
  const byEan = new Set(localProducts.map((product) => String(product.ean || '')).filter(Boolean))
  const localNameTokens = new Map()
  for (const product of localProducts || []) {
    const key = normalizeText(product.name || '').slice(0, 80)
    if (!key) continue
    const brandHint = normalizeText(product.brand || product.marca || '').slice(0, 40)
    localNameTokens.set(`${key}|${brandHint}`, true)
  }

  return previewProducts.map((product) => {
    const normalizedName = normalizeText(product.name)
    const normalizedBrand = normalizeText(product.brand)
    const sameNameBrand = localNameTokens.has(`${normalizedName}|${normalizedBrand}`)
    const sameNameOnly = localNameTokens.has(`${normalizedName}|`)

    return {
      ...product,
      possibleDuplicate: byId.has(String(product.sourceProductId || ''))
        || (product.ean && byEan.has(String(product.ean)))
        || sameNameBrand
        || sameNameOnly,
      duplicateReasons: [
        byId.has(String(product.sourceProductId || '')) ? 'source_product_id' : null,
        product.ean && byEan.has(String(product.ean)) ? 'ean' : null,
        sameNameBrand ? 'name_brand' : null,
        sameNameOnly ? 'name_only' : null,
      ].filter(Boolean),
    }
  })
}

module.exports = {
  ...createImporterContract({
    source: 'mami',
    normalizeProduct: normalizeMamiProduct,
    getInvalidReason: getMamiInvalidReason,
    isValidProduct: isValidMamiProduct,
    fetchPreview: fetchMamiPreviewReport,
    fetchProductById: fetchMamiProductById,
    findMatches: findMamiPreviewMatches,
  }),
  extractMamiDetailProductsFromHtml,
  classifyTaxonomy: classifyMamiTaxonomy,
}
