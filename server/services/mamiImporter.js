const { createCommonProduct, createImporterContract, getCommonInvalidReason, isValidCommonProduct } = require('./importerContract')
const { parseHtmlProductDetails } = require('./htmlProductParser')
const fs = require('fs')
const path = require('path')

const mamiDetailCache = new Map()
const mamiCookies = new Map()
let mamiHomeCache = null
const MAMI_DETAIL_CACHE_TTL_MS = Number(process.env.MAMI_DETAIL_CACHE_TTL_MS || 5 * 60 * 1000)
const MAMI_MAX_ATTEMPTS = Math.min(6, Math.max(2, Number(process.env.MAMI_MAX_ATTEMPTS || 4)))
const MAMI_REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.MAMI_REQUEST_TIMEOUT_MS || 15000))
const MAMI_RETRY_BASE_MS = Math.max(50, Number(process.env.MAMI_RETRY_BASE_MS || 500))
const MAMI_HOME_ATTEMPTS = Math.min(4, Math.max(1, Number(process.env.MAMI_HOME_ATTEMPTS || 2)))

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

function matchesMamiQuery(product = {}, query = '') {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const searchableText = normalizeText([
    product.name,
    product.brand,
    product.sourceCategory,
    ...(product.sourceCategories || []),
  ].join(' '))
  return terms.every((term) => searchableText.includes(term))
}

function getRetryAfterMs(value) {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0
}

function getMamiRetryDelay(attempt, retryAfter = 0) {
  const exponential = MAMI_RETRY_BASE_MS * (2 ** attempt)
  const jitter = Math.floor(Math.random() * Math.max(50, MAMI_RETRY_BASE_MS))
  return Math.max(retryAfter, exponential + jitter)
}

function isRetryableMamiStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cookieHeader() {
  return Array.from(mamiCookies.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
}

function rememberCookies(response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/)
  for (const setCookie of setCookies) {
    const pair = String(setCookie || '').split(';', 1)[0]
    const separator = pair.indexOf('=')
    if (separator > 0) mamiCookies.set(pair.slice(0, separator), pair.slice(separator + 1))
  }
}

async function fetchMamiHtml(url, attempts = MAMI_MAX_ATTEMPTS) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MAMI_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; arprice-local/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: 'https://www.dinoonline.com.ar/super/home',
          ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
        },
        redirect: 'follow',
        signal: controller.signal,
      })
      rememberCookies(response)
      const html = response.ok ? await response.text() : ''
      const retryable = isRetryableMamiStatus(response.status) || !html.trim()
      if (response.ok && html.trim()) return html
      if (!retryable || attempt + 1 >= attempts) return html
      await wait(getMamiRetryDelay(attempt, getRetryAfterMs(response.headers.get('retry-after'))))
    } catch {
      if (attempt + 1 >= attempts) return ''
      await wait(getMamiRetryDelay(attempt))
    } finally {
      clearTimeout(timeout)
    }
  }
  return ''
}

async function fetchMamiHomeHtml() {
  if (mamiHomeCache && Date.now() - mamiHomeCache.cachedAt < MAMI_DETAIL_CACHE_TTL_MS) return mamiHomeCache.html
  const url = 'https://www.dinoonline.com.ar/super/home'
  let html = ''
  for (let attempt = 0; attempt < MAMI_HOME_ATTEMPTS; attempt += 1) {
    html = await fetchMamiHtml(url)
    const hasRoutes = extractMamiCategoryRoutes(html).length > 0 || extractMamiProductRoutes(html).length > 0
    if (hasRoutes) {
      mamiHomeCache = { html, cachedAt: Date.now() }
      return html
    }
    if (attempt + 1 < MAMI_HOME_ATTEMPTS) await wait(getMamiRetryDelay(attempt))
  }
  if (process.env.MAMI_LOCAL_MANIFEST_FALLBACK !== 'false') {
    try {
      const localManifest = fs.readFileSync(path.resolve(__dirname, '../../mami_home.html'), 'utf8')
      if (extractMamiCategoryRoutes(localManifest).length > 0) return localManifest
    } catch {
      // The remote source remains authoritative when no local manifest exists.
    }
  }
  return html
}

async function fetchMamiProductHtml(productRoute = '') {
  if (!productRoute) return ''
  const route = productRoute.startsWith('http') ? productRoute : `https://www.supermami.com.ar${productRoute}`
  const cached = mamiDetailCache.get(route)
  if (cached && Date.now() - cached.cachedAt < MAMI_DETAIL_CACHE_TTL_MS) return cached.html
  const html = await fetchMamiHtml(route)
  if (html.trim()) mamiDetailCache.set(route, { html, cachedAt: Date.now() })
  return html
}

async function fetchMamiCategoryHtml(categoryRoute = '') {
  return fetchMamiProductHtml(categoryRoute)
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

function extractMamiCategoryRoutes(html = '', limit = Number(process.env.MAMI_MAX_CATEGORY_ROUTES || 1000)) {
  if (!html) return []
  const routes = new Set()
  const regex = /\/super\/categoria\/supermami-[^"'\s<>]+/g
  for (const match of String(html).match(regex) || []) {
    const route = match.replace(/;jsessionid=[^?&\s<>]*/g, '')
    routes.add(route)
  }
  return Array.from(routes).slice(0, limit)
}

function extractMamiProductRoutes(html = '', limit = 200) {
  if (!html) return []
  const routes = new Set()
  const regex = /\/super\/producto\/[^"'\s<>]+/g
  for (const match of String(html).match(regex) || []) {
    const route = match.replace(/;jsessionid=[^?&\s<>]*/g, '')
    routes.add(route)
  }
  return Array.from(routes).slice(0, limit)
}

function prioritizeMamiQueryRoutes(routes = [], query = '') {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return routes
  const matchingRoutes = routes.filter((route) => {
    const searchableRoute = normalizeText(route)
    return terms.every((term) => searchableRoute.includes(term))
  })
  return matchingRoutes.length ? matchingRoutes : routes
}

async function fetchMamiHtmlInBatches(routes = [], batchSize = 8) {
  const htmlResults = []
  for (let index = 0; index < routes.length; index += batchSize) {
    const batch = routes.slice(index, index + batchSize)
    htmlResults.push(...await Promise.all(batch.map((route) => fetchMamiCategoryHtml(route))))
  }
  return htmlResults
}

function getMamiBatchSize(value, fallback = 16) {
  const configured = Number(value)
  if (!Number.isFinite(configured) || configured < 1) return fallback
  return Math.min(32, Math.floor(configured))
}

async function readMamiDetailRoute(route = '', query = '') {
  const detailHtml = await fetchMamiProductHtml(route)
  if (!detailHtml) return { products: [], discarded: [], jsonLdCount: 0, profileCount: 0, htmlFetched: false }

  const jsonLdProducts = extractMamiProductJsonLd(detailHtml)
  const productProfile = extractMamiProductProfile(detailHtml)
  const routeUrl = route.startsWith('http') ? route : `https://www.supermami.com.ar${route}`
  const htmlDetailProducts = extractMamiDetailProductsFromHtml(detailHtml, routeUrl)
  const products = []
  const discarded = []

  for (const product of htmlDetailProducts) {
    const normalized = normalizeMamiProduct(product)
    if (!isSerializableMamiProduct(normalized) || !normalized.name || normalized.price <= 0 || !normalized.sourceProductId || !normalized.sourceCategory || !normalized.sourceCategories.length || !isValidCommonProduct(normalized)) {
      discarded.push({ sourceProductId: normalized.sourceProductId || product.sourceProductId || '', name: normalized.name || product.name || '', reason: 'invalid_product_detail_payload' })
      continue
    }
    if (matchesMamiQuery(normalized, query)) products.push(normalized)
  }

  return {
    products,
    discarded,
    jsonLdCount: jsonLdProducts.length,
    profileCount: Object.keys(productProfile).length > 1,
    htmlFetched: true,
  }
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

function extractMamiDetailProductsFromHtml(html = '', fallbackSourceUrl = '') {
  return parseHtmlProductDetails(html, {
    source: 'mami',
    normalizeProduct: normalizeMamiProduct,
    isValidProduct: isValidMamiProduct,
    isSerializableProduct: isSerializableMamiProduct,
    extractProfile: extractMamiProductProfile,
    normalizeSourceUrl: normalizeMamiSourceUrl,
    fallbackCategory: 'Mami',
    enrichProduct: (item) => ({
      ...item,
      sourceProductId: stableSourceProductId(item.sourceProductId || ''),
      sourceSku: item.sourceSku || '',
      sourceCategory: sanitizeSourceCategory(item.sourceCategory || 'Mami'),
      sourceCategories: sanitizeSourceCategories(item.sourceCategories || [item.sourceCategory || 'Mami']),
      sourceUrl: normalizeMamiSourceUrl(item.sourceUrl || fallbackSourceUrl || ''),
      seller: 'Mami',
      available: item.available !== false,
    }),
  }).products
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
  const profile = { source: 'mami', available: true }
  const title = text.match(/<title>([^<]+)<\/title>/i)?.[1]
  const cleanTitle = title ? title.replace(/\s*\|\s*Super MaMi/i, '').trim() : ''
  if (cleanTitle) profile.name = cleanTitle

  const itemBrand = text.match(/"item_brand":"([^"]+)"/)?.[1] || text.match(/"brand":"([^"]+)"/)?.[1] || ''
  if (itemBrand) profile.brand = itemBrand

  const eventPrice = text.match(/"price":\s*([0-9.,]+)/)?.[1]
  if (eventPrice) profile.price = Number(String(eventPrice).replace(/[^0-9.]/g, ''))

  const productId = text.match(/productId\s*:\s*"prod([0-9]+)"|productId\s*=\s*"prod([0-9]+)"|idProductoSelected[^\n]*value="prod([0-9]+)"/i)?.slice(1).find(Boolean)
  if (productId) profile.sourceProductId = `prod${productId}`

  const productUrl = text.match(/https?:\/\/[^"'\s<>]+\/super\/producto\/[^"'\s<>]+/i)?.[0]
  if (productUrl) profile.sourceUrl = normalizeMamiSourceUrl(productUrl)

  return profile
}

async function fetchMamiCategoryReport(route = '', { query = '' } = {}) {
  const html = route ? await fetchMamiCategoryHtml(route) : await fetchMamiHomeHtml()
  const maxCategoryRoutes = Math.max(1, Number(process.env.MAMI_MAX_CATEGORY_ROUTES || 1000))
  const maxProductRoutes = Math.max(1, Number(process.env.MAMI_MAX_PRODUCT_ROUTES || 5000))
  const categoryCandidates = extractMamiCategoryRoutes(html, maxCategoryRoutes + 1)
  const productCandidates = extractMamiProductRoutes(html, maxProductRoutes + 1)
  const categoryRouteLimitReached = categoryCandidates.length > maxCategoryRoutes
  const productRouteLimitReached = productCandidates.length > maxProductRoutes
  const categoryRoutes = categoryCandidates.slice(0, maxCategoryRoutes)
  const productRoutes = productCandidates.slice(0, maxProductRoutes)
  const routeWindow = !route
    ? []
    : query.trim()
      ? prioritizeMamiQueryRoutes(productRoutes, query)
      : productRoutes
  const detailBatchSize = getMamiBatchSize(process.env.MAMI_DETAIL_BATCH_SIZE)
  const products = []
  const discarded = []

  for (let index = 0; index < routeWindow.length; index += detailBatchSize) {
    const results = await Promise.all(routeWindow.slice(index, index + detailBatchSize).map((productRoute) => readMamiDetailRoute(productRoute, query)))
    if (results.some((result) => !result.htmlFetched)) {
      throw new Error(`Mami no entrego todos los detalles de producto para la categoria ${route || '@home'}`)
    }
    for (const result of results) {
      products.push(...result.products)
      discarded.push(...result.discarded)
    }
  }

  return {
    products,
    discarded,
    categoryRoutes,
    productRoutes,
    sourceRead: {
      source: 'mami',
      route: route || '@home',
      htmlFetched: Boolean(html.trim()),
      categoryRouteCount: categoryRoutes.length,
      productRouteCount: productRoutes.length,
      detailRouteCount: routeWindow.length,
      categoryRouteLimitReached,
      productRouteLimitReached,
      categoryRouteLimit: maxCategoryRoutes,
      productRouteLimit: maxProductRoutes,
    },
  }
}

async function fetchMamiPreviewReport({ query = '', from = 0, to = 49 } = {}) {
  const html = await fetchMamiHomeHtml()
  const categoryHints = extractMamiCategoryHints(html)
  const maxCategoryRoutes = Math.max(1, Number(process.env.MAMI_MAX_CATEGORY_ROUTES || 1000))
  const maxProductRoutes = Math.max(1, Number(process.env.MAMI_MAX_PRODUCT_ROUTES || 5000))
  const discoveredCategoryRoutes = new Set(extractMamiCategoryRoutes(html).slice(0, maxCategoryRoutes))
  const discoveredProductRoutes = new Set(extractMamiProductRoutes(html, maxProductRoutes))
  const fetchBatchSize = getMamiBatchSize(process.env.MAMI_FETCH_BATCH_SIZE)
  const detailBatchSize = getMamiBatchSize(process.env.MAMI_DETAIL_BATCH_SIZE)
  const processedCategoryRoutes = new Set()
  let pendingCategoryRoutes = Array.from(discoveredCategoryRoutes)
  while (pendingCategoryRoutes.length && processedCategoryRoutes.size < maxCategoryRoutes) {
    const batch = pendingCategoryRoutes
      .filter((route) => !processedCategoryRoutes.has(route))
      .slice(0, fetchBatchSize)
    if (!batch.length) break
    const categoryHtmlResults = await fetchMamiHtmlInBatches(batch, fetchBatchSize)
    batch.forEach((route) => processedCategoryRoutes.add(route))
    for (const categoryHtml of categoryHtmlResults) {
      for (const route of extractMamiProductRoutes(categoryHtml, maxProductRoutes)) {
        if (discoveredProductRoutes.size >= maxProductRoutes) break
        discoveredProductRoutes.add(route)
      }
      for (const route of extractMamiCategoryRoutes(categoryHtml)) {
        if (discoveredCategoryRoutes.size >= maxCategoryRoutes) break
        if (!discoveredCategoryRoutes.has(route)) {
          discoveredCategoryRoutes.add(route)
          pendingCategoryRoutes.push(route)
        }
      }
    }
  }
  const categoryRoutes = Array.from(discoveredCategoryRoutes)
  const productRoutes = Array.from(discoveredProductRoutes)
  const routeWindow = query.trim()
    ? prioritizeMamiQueryRoutes(productRoutes, query)
    : productRoutes.slice(from, Math.min(productRoutes.length, to + 1))
  const products = []
  const discarded = []
  let detailJsonLdProductCount = 0
  let detailProfileCount = 0

  for (let index = 0; index < routeWindow.length; index += detailBatchSize) {
    const results = await Promise.all(routeWindow.slice(index, index + detailBatchSize).map((route) => readMamiDetailRoute(route, query)))
    for (const result of results) {
      products.push(...result.products)
      discarded.push(...result.discarded)
      detailJsonLdProductCount += result.jsonLdCount
      if (result.profileCount) detailProfileCount += 1
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

async function fetchMamiProductById() {
  return null
}

function classifyMamiTaxonomy(product = {}) {
  const { buildTaxonomyComparison } = require('./importerContract')
  return buildTaxonomyComparison(product, [{ id: '1', name: 'Almacén y Alimentos' }], [{ id: '10', category_id: '1', name: 'Golosinas y snacks' }, { id: '11', category_id: '1', name: 'Bebidas' }, { id: '12', category_id: '1', name: 'Panificados' }])
}

function findMamiPreviewMatches(previewProducts, localProducts = []) {
  const byId = new Map(localProducts.map((product) => [String(product.source_product_id || product.external_id || ''), product]).filter(([key]) => key))
  const byEan = new Map(localProducts.map((product) => [String(product.ean || ''), product]).filter(([key]) => key))
  const localNameTokens = new Map()
  for (const product of localProducts || []) {
    const key = normalizeText(product.name || '').slice(0, 80)
    if (!key) continue
    const brandHint = normalizeText(product.brand || product.marca || product.brands?.name || '').slice(0, 40)
    localNameTokens.set(`${key}|${brandHint}`, product)
  }

  return previewProducts.map((product) => {
    const normalizedName = normalizeText(product.name)
    const normalizedBrand = normalizeText(product.brand)
    const sameNameBrand = localNameTokens.get(`${normalizedName}|${normalizedBrand}`) || null
    const sameNameOnly = localNameTokens.get(`${normalizedName}|`) || null
    const existing = byId.get(String(product.sourceProductId || ''))
      || (product.ean ? byEan.get(String(product.ean)) : null)
      || sameNameBrand
      || sameNameOnly

    return {
      ...product,
      possibleDuplicate: Boolean(existing),
      existingProduct: existing ? {
        id: existing.id,
        name: existing.name,
        brand: existing.brand || existing.brands?.name || '',
        offers: existing.offers || [],
      } : null,
      duplicateReasons: [
        byId.has(String(product.sourceProductId || '')) ? 'source_product_id' : null,
        product.ean && byEan.has(String(product.ean)) ? 'ean' : null,
        sameNameBrand ? 'name_brand' : null,
        sameNameOnly ? 'name_only' : null,
      ].filter(Boolean),
      priceOptions: existing?.offers?.map((offer) => ({
        supermarket: offer.supermarket,
        price: Number(offer.cash_price ?? offer.cashPrice) || 0,
      })).filter((offer) => offer.price > 0) || [],
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
  extractMamiCategoryRoutes,
  extractMamiProductRoutes,
  fetchMamiCategoryReport,
  classifyTaxonomy: classifyMamiTaxonomy,
}
