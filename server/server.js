const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { createClient } = require('@supabase/supabase-js')
const app = express()
const { normalizeOptionalReference } = require('./productFields')

app.use(cors({ exposedHeaders: ['X-Catalog-Cache'] }))
app.use(express.json())

const supabase = require('./supabase')
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? require('./supabaseAdmin')
  : null
const { analyzeProduct, createAnalysisContext } = require('./services/priceAnalysisService')
const { fetchDiscoPreview, fetchDiscoProductById, findPreviewMatches } = require('./services/discoImporter')
const { syncMamiLowPrices } = require('./services/mamiPriceSync')
const {
  fetchPreview: fetchCarrefourPreview,
  fetchProductById: fetchCarrefourProductById,
  findCarrefourLocalMatch,
  getCarrefourProductInvalidReason,
  isValidCarrefourProduct,
  normalizePostalCode,
} = require('./services/carrefourImporter')
const CARREFOUR_IMPORT_BATCH_LIMIT = 5
const { syncDiscoPrices } = require('./services/discoPriceSync')
const { createCatalogPageCache } = require('./services/catalogPageCache')
const { auditCrossSourceProducts } = require('./services/crossSourceProductMatcher')
const { buildCatalogTaxonomyReview } = require('./services/catalogTaxonomyReview')
const { suggestCatalogMapping } = require('./services/catalogTaxonomy')
const {
  clearReviewDecisions,
  listReviewDecisions,
  normalizePairKey,
  summarizeReviewDecisions,
  upsertReviewDecision,
} = require('./services/reviewDecisionStore')
const {
  customerPasswordResetIpRateLimit,
  customerPriceReportIpRateLimit,
  productTranslationIpRateLimit,
} = require('./rateLimiters')
const { getPasswordRecoveryFailure } = require('./passwordRecoveryErrors')
const { getCustomerConfirmationRedirectUrl, getFrontendUrl } = require('./passwordRecoveryRedirect')
const { createProductTranslationService } = require('./services/productTranslation')
const {
  PRICE_STATUS_RULES_VERSION,
  createPriceStatusRefreshQueue,
  enqueueIncompletePriceStatuses,
  saveCurrentPriceStatuses,
} = require('./services/currentPriceStatus')
const priceStatusRulesVersion = PRICE_STATUS_RULES_VERSION
const catalogSortVersion = '2026-10-26-global-sort-v1'
const catalogPageCache = createCatalogPageCache()
const productTranslationService = createProductTranslationService({
  serviceUrl: process.env.TRANSLATION_SERVICE_URL,
  apiKey: process.env.TRANSLATION_SERVICE_API_KEY,
})
const publicDiscoSearchCache = new Map()
const publicDiscoSearchInFlight = new Set()
let catalogTaxonomyReviewCache = null
const publicDiscoSearchMaxResults = Math.min(500, Math.max(50, Number(process.env.DISCO_PUBLIC_SEARCH_MAX_RESULTS || 500)))
const analysisWriter = process.env.SUPABASE_SERVICE_ROLE_KEY ? require('./supabaseAdmin') : supabase
const priceStatusQueue = createPriceStatusRefreshQueue({
  refreshBatch: refreshCurrentPriceStatuses,
})
let analysisCatalogPromise
let priceUpdateLogsPromise
const sessionSecret = process.env.ADMIN_SESSION_SECRET || (
  process.env.NODE_ENV === 'production' ? null : 'arprice-local-dev-session-secret'
)

function encodeTokenPart(value) {
  return Buffer.from(value).toString('base64url')
}

function createAdminToken(username) {
  if (!sessionSecret) return null
  const payload = encodeTokenPart(JSON.stringify({ username, expiresAt: Date.now() + 8 * 60 * 60 * 1000 }))
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readAdminToken(token) {
  if (!sessionSecret || !token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return session.expiresAt > Date.now() ? session : null
  } catch {
    return null
  }
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const session = readAdminToken(token)
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  req.admin = session.username
  next()
}

const { parsePrice, normalizeNumericValue } = require('./priceNormalization')

function sameMoneyValue(first, second) {
  const firstPrice = Number(first)
  const secondPrice = Number(second)
  if (!Number.isFinite(firstPrice) || !Number.isFinite(secondPrice)) return first === second
  return Number(firstPrice.toFixed(2)) === Number(secondPrice.toFixed(2))
}

function normalizeBrandName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function normalizeProductName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function extractProductMeasure(value) {
  const match = String(value || '').match(/\b(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo(?:s)?|g|gr|gramo(?:s)?|mg|l|lt|lts|litro(?:s)?|ml|cc|cl|unidad(?:es)?|un|uds?|u)\b/i)
  if (!match) return null
  const amount = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit = match[2].toLowerCase()
  if (/^(?:kg|kgs|kilo)/.test(unit)) return { baseUnit: 'kg', amount }
  if (/^(?:g|gr|gramo)/.test(unit)) return { baseUnit: 'kg', amount: amount / 1000 }
  if (unit === 'mg') return { baseUnit: 'kg', amount: amount / 1000000 }
  if (/^(?:l|lt|lts|litro)/.test(unit)) return { baseUnit: 'l', amount }
  if (/^(?:ml|cc|cl)/.test(unit)) return { baseUnit: 'l', amount: amount / (unit === 'cl' ? 100 : 1000) }
  return { baseUnit: 'unit', amount }
}

function findCrossSourceProductMatch(item, products = [], source) {
  const name = normalizeProductName(item.name)
  const brand = normalizeBrandName(item.brand)
  if (!name || !brand) return null
  const itemEan = String(item.ean || '').trim()
  return (products || []).find((candidate) => {
    if (!candidate || candidate.source === source) return false
    if (normalizeProductName(candidate.name) !== name) return false
    if (normalizeBrandName(candidate.brand || candidate.brands?.name) !== brand) return false
    const candidateEan = String(candidate.ean || '').trim()
    if (itemEan && candidateEan && itemEan !== candidateEan) return false
    const itemMeasure = extractProductMeasure(item.name)
    const candidateMeasure = extractProductMeasure(candidate.name)
    return !itemMeasure || !candidateMeasure
      || (itemMeasure.baseUnit === candidateMeasure.baseUnit && Math.abs(itemMeasure.amount - candidateMeasure.amount) < 0.000001)
  }) || null
}

async function readAllProductsForImport(select) {
  return readAllRowsForImport('products', select)
}

async function readAllRowsForImport(table, select) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await analysisWriter.from(table).select(select).range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return { data: rows, error: null }
}

app.get('/taxonomy', async (req, res) => {
  try {
    const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] = await Promise.all([
      analysisWriter.from('categories').select('id, name').order('name'),
      analysisWriter.from('subcategories').select('id, category_id, name').order('name'),
    ])
    if (categoriesError || subcategoriesError) {
      console.error('Supabase taxonomy error:', categoriesError || subcategoriesError)
      return res.status(500).json({ error: 'Error fetching taxonomy' })
    }

    const { data: taxonomyCounts, error: countsError } = await analysisWriter.rpc('catalog_taxonomy_counts')
    if (countsError) {
      console.error('Supabase taxonomy counts error:', countsError)
      return res.status(500).json({ error: 'Error fetching taxonomy' })
    }

    const categoryCounts = new Map()
    const subcategoryCounts = new Map()
    for (const row of taxonomyCounts || []) {
      if (row.category_id) categoryCounts.set(String(row.category_id), (categoryCounts.get(String(row.category_id)) || 0) + Number(row.product_count || 0))
      if (row.subcategory_id) subcategoryCounts.set(String(row.subcategory_id), Number(row.product_count || 0))
    }
    const subcategoriesByCategory = new Map()
    for (const subcategory of subcategories || []) {
      const list = subcategoriesByCategory.get(String(subcategory.category_id)) || []
      list.push({ ...subcategory, productCount: subcategoryCounts.get(String(subcategory.id)) || 0 })
      subcategoriesByCategory.set(String(subcategory.category_id), list)
    }
    res.json((categories || []).map((category) => ({
      ...category,
      productCount: categoryCounts.get(String(category.id)) || 0,
      subcategories: subcategoriesByCategory.get(String(category.id)) || [],
    })))
  } catch (error) {
    console.error('Error fetching taxonomy', error)
    res.status(500).json({ error: 'Error fetching taxonomy' })
  }
})

app.get('/admin/import/disco/preview', requireAdmin, async (req, res) => {
  try {
    const query = String(req.query.query || '').slice(0, 100)
    const from = Math.max(0, Number(req.query.from || 0))
    const requestedTo = Number.isFinite(Number(req.query.to)) ? Number(req.query.to) : 99
    const to = Math.max(from, requestedTo)
    const [previewReport, { data: localProducts, error: productsError }] = await Promise.all([
      fetchDiscoPreviewReport({ query, from, to }),
      supabase.from('products').select('id, name, source_product_id, ean'),
    ])
    if (productsError) return res.status(500).json({ error: 'No se pudo consultar el inventario local' })
    res.json({ source: 'Disco', query, from, to, products: findPreviewMatches(previewReport.products, localProducts || []), discarded: previewReport.discarded })
  } catch (error) {
    console.error('Error fetching Disco preview', error)
    res.status(502).json({ error: error.message || 'No se pudo consultar Disco' })
  }
})

app.get('/admin/import/mami/preview', requireAdmin, async (req, res) => {
  try {
    const query = String(req.query.query || '').slice(0, 100)
    const from = Math.max(0, Number(req.query.from || 0))
    const requestedTo = Number.isFinite(Number(req.query.to)) ? Number(req.query.to) : 99
    const to = Math.max(from, requestedTo)
    const [previewReport, localProductsResult, { data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] = await Promise.all([
      fetchMamiPreview({ query, from, to }),
      readAllProductsForImport('id, name, source, source_product_id, ean, brands(name), offers(id, supermarket, cash_price)'),
      analysisWriter.from('categories').select('id, name'),
      analysisWriter.from('subcategories').select('id, name, category_id'),
    ])
    const { data: localProducts, error: productsError } = localProductsResult
    if (productsError || categoriesError || subcategoriesError) {
      const catalogError = productsError || categoriesError || subcategoriesError
      console.error('Error loading Mami preview catalog', catalogError)
      return res.status(500).json({ error: 'No se pudo consultar el inventario local o el catálogo de categorías', detail: catalogError?.message || 'Error desconocido del catálogo' })
    }
    const comparison = compareSimulationReport({
      source: mamiSource,
      isValidProduct: isValidMamiProduct,
      getInvalidReason: getMamiInvalidReason,
      findMatches: findMamiMatches,
    }, previewReport, localProducts || [])
    if (!previewReport.sourceRead?.htmlFetched || (!previewReport.sourceRead.categoryRouteCount && !previewReport.sourceRead.productRouteCount)) {
      return res.status(503).json({
        error: 'Mami no entregó un catálogo navegable',
        detail: previewReport.sourceRead || null,
        retryable: true,
      })
    }
    const taxonomyComparison = (previewReport.products || []).map((product) => ({
      ...buildTaxonomyComparison(product, categories || [], subcategories || []),
      sourceProductId: product.sourceProductId,
      name: product.name,
    }))
    const products = findMamiMatches(previewReport.products, localProducts || []).map((product) => {
      const mapping = suggestCatalogMapping({
        name: product.name,
        brand: product.brand,
        source_category: product.sourceCategory,
        source_subcategory: product.proposedSubcategory,
      })
      return {
        ...product,
        proposedCategory: product.proposedCategory || mapping?.category || null,
        proposedSubcategory: product.proposedSubcategory || mapping?.subcategory || null,
        mappingStatus: product.mappingStatus || (mapping ? 'propuesta_automatica' : 'pendiente'),
      }
    })
    res.json({
      source: mamiSource,
      query,
      from,
      to,
      products,
      discarded: previewReport.discarded,
      dryRun: true,
      writeSafety: {
        productWritesAllowed: false,
        priceHistoryWritesAllowed: false,
        mutationSurface: 'preview_only',
        reason: 'Mami preview is simulation-only and must not touch product or price_history tables',
      },
      comparison,
      taxonomyComparison,
    })
  } catch (error) {
    console.error('Error fetching Mami preview', error)
    res.status(502).json({ error: error.message || 'No se pudo consultar Mami' })
  }
})

app.get('/admin/import/carrefour/preview', requireAdmin, async (req, res) => {
  try {
    const query = String(req.query.query || '').trim().slice(0, 100)
    const postalCode = normalizePostalCode(req.query.postalCode)
    if (!postalCode) return res.status(400).json({ error: 'Ingresá un código postal argentino válido' })

    const [previewReport, localProductsResult, { data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] = await Promise.all([
      fetchCarrefourPreview({ query, postalCode }),
      readAllProductsForImport('id, name, source, source_product_id, ean, brands(name), offers(id, supermarket, cash_price, list_price)'),
      analysisWriter.from('categories').select('id, name'),
      analysisWriter.from('subcategories').select('id, name, category_id'),
    ])
    const { data: localProducts, error: productsError } = localProductsResult
    const catalogError = productsError || categoriesError || subcategoriesError
    if (catalogError) {
      console.error('Error loading catalog for Carrefour preview', catalogError)
      return res.status(500).json({
        error: 'No se pudo consultar el inventario local o el catálogo de categorías',
        detail: catalogError.code === 'PGRST204' || catalogError.code === '42703'
          ? 'Verifica las migraciones 20260826_external_catalog.sql y 20261023_carrefour_price_history.sql antes de consultar Carrefour.'
          : catalogError.message || 'Error desconocido del catálogo',
      })
    }

    const eanCounts = new Map()
    for (const product of previewReport.products) {
      const ean = String(product.ean || '')
      eanCounts.set(ean, (eanCounts.get(ean) || 0) + 1)
    }
    const products = previewReport.products.map((product) => {
      const match = findCarrefourLocalMatch(product, localProducts || [])
      const suggestion = suggestCatalogMapping({
        name: product.name,
        brand: product.brand,
        source_category: product.sourceCategory,
      })
      const proposedCategory = suggestion?.category || null
      const proposedSubcategory = suggestion?.subcategory || null
      const category = (categories || []).find((candidate) => candidate.name === proposedCategory)
      const subcategory = (subcategories || []).find((candidate) => (
        candidate.name === proposedSubcategory
        && String(candidate.category_id) === String(category?.id)
      ))
      const existingOffer = match.product?.offers?.find((offer) => offer.supermarket === 'Carrefour') || null
      const mappingReady = Boolean(category && subcategory)
      return {
        ...product,
        proposedCategory,
        proposedSubcategory,
        mappingStatus: mappingReady ? 'propuesta_automatica' : 'pendiente',
        existingProduct: match.product
          ? { id: match.product.id, name: match.product.name, matchedBy: match.matchedBy }
          : null,
        existingOffer: existingOffer
          ? {
            id: existingOffer.id,
            cashPrice: Number(existingOffer.cash_price),
            listPrice: Number(existingOffer.list_price) || null,
          }
          : null,
        importBlockedReason: match.ambiguous
          ? match.reason
          : eanCounts.get(String(product.ean || '')) > 1
            ? 'El GTIN aparece en más de un resultado de Carrefour'
            : (!match.product && !mappingReady ? 'Falta mapeo de categoría y subcategoría' : null),
      }
    })

    res.json({
      source: 'carrefour',
      query,
      postalCode,
      products,
      discarded: previewReport.discarded,
      resultLimit: previewReport.resultLimit,
      dryRun: true,
      writeSafety: {
        productWritesAllowed: false,
        priceHistoryWritesAllowed: false,
        mutationSurface: 'preview_only',
        reason: 'Carrefour preview only reads the regional catalog and local references; it does not write products or offers.',
      },
    })
  } catch (error) {
    console.error('Error fetching Carrefour preview', error)
    res.status(502).json({ error: error.message || 'No se pudo consultar el catálogo de Carrefour' })
  }
})

app.post('/admin/import/carrefour/execute', requireAdmin, async (req, res) => {
  const createdProductIds = []
  const createdOfferIds = []
  const createdHistoryIds = []
  const createdBrandIds = []
  const updatedOfferPrices = []
  try {
    const postalCode = normalizePostalCode(req.body?.postalCode)
    const requestedIds = Array.isArray(req.body?.productIds) ? req.body.productIds : []
    const productIds = [...new Set(requestedIds.map((id) => String(id || '').trim()))]
    if (!postalCode) return res.status(400).json({ error: 'Ingresá un código postal argentino válido' })
    if (!productIds.length) return res.status(400).json({ error: 'Seleccioná al menos un producto de Carrefour' })
    if (productIds.length > CARREFOUR_IMPORT_BATCH_LIMIT) {
      return res.status(400).json({ error: `La importación controlada permite hasta ${CARREFOUR_IMPORT_BATCH_LIMIT} productos por lote` })
    }
    if (productIds.some((id) => !/^\d{1,20}$/.test(id))) {
      return res.status(400).json({ error: 'La selección contiene identificadores de Carrefour inválidos' })
    }

    const currentProducts = []
    for (const productId of productIds) {
      const product = await fetchCarrefourProductById(productId, { postalCode })
      if (!product) {
        return res.status(502).json({ error: `Carrefour no devolvió el producto ${productId}; no se realizaron escrituras` })
      }
      if (String(product.sourceProductId) !== productId || !isValidCarrefourProduct(product)) {
        return res.status(409).json({
          error: `El producto ${productId} dejó de cumplir las validaciones de importación`,
          reason: getCarrefourProductInvalidReason(product) || 'Producto no válido',
          noWrites: true,
        })
      }
      currentProducts.push(product)
    }

    const selectedEanCounts = new Map()
    for (const product of currentProducts) {
      selectedEanCounts.set(product.ean, (selectedEanCounts.get(product.ean) || 0) + 1)
    }
    const repeatedGtins = [...selectedEanCounts]
      .filter(([, count]) => count > 1)
      .map(([ean]) => ean)
    if (repeatedGtins.length) {
      return res.status(409).json({
        error: 'La selección incluye varios productos de Carrefour con el mismo GTIN; no se realizaron escrituras.',
        repeatedGtins,
        noWrites: true,
      })
    }

    const [
      { data: categories, error: categoriesError },
      { data: subcategories, error: subcategoriesError },
      { data: brands, error: brandsError },
      existingProductsResult,
    ] = await Promise.all([
      analysisWriter.from('categories').select('id, name'),
      analysisWriter.from('subcategories').select('id, name, category_id'),
      readAllRowsForImport('brands', 'id, name'),
      readAllProductsForImport('id, name, source, source_product_id, ean, brands(name), offers(id, supermarket, cash_price, list_price)'),
    ])
    const { data: existingProducts, error: productsError } = existingProductsResult
    const catalogError = categoriesError || subcategoriesError || brandsError || productsError
    if (catalogError) {
      console.error('Error loading catalog for Carrefour import', catalogError)
      return res.status(500).json({
        error: 'No se pudo consultar el catálogo local',
        detail: catalogError.code === 'PGRST204' || catalogError.code === '42703'
          ? 'Verifica las migraciones 20260826_external_catalog.sql y 20261023_carrefour_price_history.sql antes de importar Carrefour.'
          : catalogError.message,
      })
    }

    const imported = []
    const updated = []
    const unchanged = []
    const skipped = []
    const brandCache = new Map()
    const productCache = [...(existingProducts || [])]
    const failImport = (message, detail) => {
      const error = new Error(detail || message)
      error.importFailure = true
      error.publicMessage = message
      throw error
    }

    for (const item of currentProducts) {
      const sourceProductId = String(item.sourceProductId)
      const match = findCarrefourLocalMatch(item, productCache)
      if (match.ambiguous) {
        skipped.push({ sourceProductId, reason: match.reason })
        continue
      }

      const suggestion = suggestCatalogMapping({
        name: item.name,
        brand: item.brand,
        source_category: item.sourceCategory,
      })
      const category = (categories || []).find((candidate) => candidate.name === suggestion?.category)
      const subcategory = (subcategories || []).find((candidate) => (
        candidate.name === suggestion?.subcategory
        && String(candidate.category_id) === String(category?.id)
      ))
      if (!match.product && (!category || !subcategory)) {
        skipped.push({ sourceProductId, reason: 'Falta mapeo de categoría y subcategoría' })
        continue
      }

      if (match.product) {
        const existingOffer = match.product.offers?.find((offer) => offer.supermarket === 'Carrefour')
        if (existingOffer) {
          const nextListPrice = Number(item.listPrice) > Number(item.price) ? Number(item.listPrice) : null
          const priceChanged = !sameMoneyValue(existingOffer.cash_price, item.price)
          const listPriceChanged = (Number(existingOffer.list_price) || null) !== nextListPrice
          if (priceChanged || listPriceChanged) {
            const { error } = await analysisWriter.from('offers')
              .update({ cash_price: item.price, list_price: nextListPrice })
              .eq('id', existingOffer.id)
            if (error) failImport('No se pudo actualizar la oferta de Carrefour', error.message)
            updatedOfferPrices.push({
              id: existingOffer.id,
              cashPrice: existingOffer.cash_price,
              listPrice: existingOffer.list_price,
            })
            if (priceChanged) {
              const historyId = await recordPriceHistory({
                productId: match.product.id,
                offerId: existingOffer.id,
                cashPrice: item.price,
                source: 'carrefour_import',
                scheduleStatusRefresh: false,
                throwOnError: true,
              })
              if (historyId) createdHistoryIds.push(historyId)
            } else {
              invalidateCatalogPageCache()
            }
            existingOffer.cash_price = item.price
            existingOffer.list_price = nextListPrice
            updated.push({ productId: match.product.id, sourceProductId })
          } else {
            unchanged.push({ productId: match.product.id, sourceProductId })
          }
        } else {
          const { data: offer, error } = await analysisWriter.from('offers')
            .insert({
              product_id: match.product.id,
              supermarket: 'Carrefour',
              cash_price: item.price,
              list_price: Number(item.listPrice) > Number(item.price) ? Number(item.listPrice) : null,
            })
            .select('id, supermarket, cash_price, list_price')
            .single()
          if (error) failImport('No se pudo crear la oferta de Carrefour', error.message)
          createdOfferIds.push(offer.id)
          match.product.offers = [...(match.product.offers || []), offer]
          const historyId = await recordPriceHistory({
            productId: match.product.id,
            offerId: offer.id,
            cashPrice: item.price,
            source: 'carrefour_import',
            scheduleStatusRefresh: false,
            throwOnError: true,
          })
          if (historyId) createdHistoryIds.push(historyId)
          updated.push({ productId: match.product.id, sourceProductId })
        }
        continue
      }

      const normalizedBrandName = normalizeBrandName(item.brand)
      let brand = normalizedBrandName ? brandCache.get(normalizedBrandName) : null
      if (!brand && normalizedBrandName) {
        brand = (brands || []).find((candidate) => normalizeBrandName(candidate.name) === normalizedBrandName)
      }
      if (!brand && normalizedBrandName) {
        const { data: createdBrand, error: brandError } = await analysisWriter.from('brands')
          .insert({ name: normalizedBrandName })
          .select('id, name')
          .single()
        if (brandError) {
          if (brandError.code !== '23505') failImport('No se pudo crear la marca de Carrefour', brandError.message)
          const { data: existingBrand, error: existingBrandError } = await analysisWriter.from('brands')
            .select('id, name')
            .eq('name', normalizedBrandName)
            .maybeSingle()
          if (existingBrandError || !existingBrand) {
            failImport('No se pudo resolver la marca de Carrefour', existingBrandError?.message || brandError.message)
          }
          brand = existingBrand
        } else {
          brand = createdBrand
          createdBrandIds.push(createdBrand.id)
        }
        brandCache.set(normalizedBrandName, brand)
      }

      const productPayload = {
        name: item.name,
        brand_id: brand?.id || null,
        category_id: category.id,
        subcategory_id: subcategory.id,
        image: item.image,
        classification_source: 'manual',
        classification_confidence: 'manual',
        source: 'carrefour',
        source_product_id: sourceProductId,
        source_sku: item.sourceSku,
        ean: item.ean,
        source_url: item.sourceUrl,
        source_category: item.sourceCategory,
        source_subcategory: suggestion.subcategory,
      }
      const { data: product, error: productError } = await analysisWriter.from('products')
        .insert(productPayload)
        .select('id, name, source, source_product_id, ean')
        .single()
      if (productError) {
        if (productError.code === '42703' || productError.code === 'PGRST204') {
          failImport('Falta aplicar la migración de metadatos del catálogo externo', productError.message)
        }
        failImport('No se pudo crear el producto de Carrefour', productError.message)
      }
      createdProductIds.push(product.id)

      const { data: offer, error: offerError } = await analysisWriter.from('offers')
        .insert({
          product_id: product.id,
          supermarket: 'Carrefour',
          cash_price: item.price,
          list_price: Number(item.listPrice) > Number(item.price) ? Number(item.listPrice) : null,
        })
        .select('id, supermarket, cash_price, list_price')
        .single()
      if (offerError) failImport('No se pudo crear la oferta de Carrefour', offerError.message)
      createdOfferIds.push(offer.id)
      const historyId = await recordPriceHistory({
        productId: product.id,
        offerId: offer.id,
        cashPrice: item.price,
        source: 'carrefour_import',
        scheduleStatusRefresh: false,
        throwOnError: true,
      })
      if (historyId) createdHistoryIds.push(historyId)
      imported.push({ productId: product.id, sourceProductId })
      productCache.push({ ...product, offers: [offer] })
    }

    if (imported.length || updated.length || unchanged.length) {
      const { error: supermarketError } = await analysisWriter.from('supermarkets')
        .upsert({ name: 'Carrefour' }, { onConflict: 'name', ignoreDuplicates: true })
      if (supermarketError) failImport('No se pudo habilitar Carrefour en los filtros del catálogo', supermarketError.message)
    }

    const { error: logError } = await analysisWriter.from('price_update_log').insert({
      admin_username: req.admin,
      filters: { source: 'carrefour_import', postal_code: postalCode },
      percentage: 0,
      products_updated: imported.length + updated.length,
      changes: [
        ...imported.map((entry) => ({ type: 'carrefour_import', status: 'imported', ...entry })),
        ...updated.map((entry) => ({ type: 'carrefour_import', status: 'updated', ...entry })),
        ...unchanged.map((entry) => ({ type: 'carrefour_import', status: 'unchanged', ...entry })),
        ...skipped.map((entry) => ({ type: 'carrefour_import', status: 'skipped', ...entry })),
      ],
    })
    if (logError) failImport('No se pudo registrar el lote de importación de Carrefour', logError.message)

    invalidateAnalysisCache()
    for (const productId of new Set([...imported, ...updated].map((entry) => String(entry.productId)))) {
      scheduleRelatedPriceStatusRefresh(productId)
    }

    res.json({
      source: 'carrefour',
      postalCode,
      imported,
      updated,
      unchanged,
      skipped,
      dryRun: false,
      writeSafety: {
        productWritesAllowed: true,
        priceHistoryWritesAllowed: true,
        mutationSurface: 'carrefour_manual_import',
      },
    })
  } catch (error) {
    if (error.importFailure) {
      const rollbackResults = []
      const runRollbackStage = async (operations) => {
        rollbackResults.push(...await Promise.all(operations))
      }
      await runRollbackStage(
        createdHistoryIds.map((id) => analysisWriter.from('price_history').delete().eq('id', id)),
      )
      await runRollbackStage(
        updatedOfferPrices.map((offer) => analysisWriter.from('offers')
          .update({ cash_price: offer.cashPrice, list_price: offer.listPrice })
          .eq('id', offer.id)),
      )
      await runRollbackStage(
        createdOfferIds.map((id) => analysisWriter.from('offers').delete().eq('id', id)),
      )
      await runRollbackStage(
        createdProductIds.map((id) => analysisWriter.from('products').delete().eq('id', id)),
      )
      await runRollbackStage(
        createdBrandIds.map((id) => analysisWriter.from('brands').delete().eq('id', id)),
      )
      const rollbackErrors = rollbackResults.filter((result) => result.error).map((result) => result.error.message)
      if (rollbackErrors.length) {
        console.error('Carrefour import rollback was incomplete', rollbackErrors)
        return res.status(500).json({
          error: error.publicMessage || 'No se pudo completar la importación de Carrefour',
          detail: error.message,
          rolledBack: false,
          rollbackErrors,
        })
      }
      return res.status(500).json({
        error: error.publicMessage || 'No se pudo completar la importación de Carrefour',
        detail: error.message,
        rolledBack: true,
      })
    }
    console.error('Error importing Carrefour products', error)
    res.status(502).json({ error: error.message || 'No se pudo importar Carrefour' })
  }
})

app.get('/admin/import/compare/preview', requireAdmin, async (req, res) => {
  try {
    const query = String(req.query.query || '').slice(0, 100)
    const from = Math.max(0, Number(req.query.from || 0))
    const requestedTo = Number.isFinite(Number(req.query.to)) ? Number(req.query.to) : 49
    const to = Math.max(from, requestedTo)
    const [mamiPreview, discoPreview, { data: localProducts, error: productsError }] = await Promise.all([
      fetchMamiPreview({ query, from, to }),
      fetchDiscoPreviewReport({ query, from, to }),
      supabase.from('products').select('id, name, source_product_id, ean, brands(name), offers(id, supermarket, cash_price)'),
    ])
    if (productsError) return res.status(500).json({ error: 'No se pudo consultar el inventario local' })
    const mamiProducts = findMamiMatches(mamiPreview.products, localProducts || [])
    const comparison = compareCrossSourceProducts(mamiProducts, discoPreview.products)

    res.json({
      sources: ['mami', 'disco'],
      query,
      from,
      to,
      mami: {
        products: mamiProducts,
        discarded: mamiPreview.discarded,
        sourceRead: mamiPreview.sourceRead,
      },
      disco: {
        products: discoPreview.products,
        discarded: discoPreview.discarded,
      },
      comparison,
      dryRun: true,
      writeSafety: comparison.writeSafety,
    })
  } catch (error) {
    console.error('Error fetching cross-source preview', error)
    res.status(502).json({ error: error.message || 'No se pudo comparar Mami y Disco' })
  }
})

app.post('/admin/import/mami/execute', requireAdmin, async (req, res) => {
  const createdProductIds = []
  const createdOfferIds = []
  const createdHistoryIds = []
  const createdBrandIds = []
  const updatedOfferPrices = []
  try {
    const items = Array.isArray(req.body?.products) ? req.body.products : []
    if (!items.length) return res.status(400).json({ error: 'Seleccioná al menos un producto' })
    const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }, { data: brands, error: brandsError }, existingProductsResult] = await Promise.all([
      analysisWriter.from('categories').select('id, name'),
      analysisWriter.from('subcategories').select('id, name, category_id'),
      readAllRowsForImport('brands', 'id, name'),
      readAllProductsForImport('id, name, source, source_product_id, ean, brands(name), offers(id, supermarket, cash_price)'),
    ])
    const { data: existingProducts, error: productsError } = existingProductsResult
    const catalogError = categoriesError || subcategoriesError || brandsError || productsError
    if (catalogError) return res.status(500).json({ error: 'No se pudo consultar el catálogo local', detail: catalogError.message })

    const imported = []
    const updated = []
    const unchanged = []
    const skipped = []
    const brandCache = new Map()
    const seenSourceProductIds = new Set()
    const failImport = (message, detail) => {
      const error = new Error(detail || message)
      error.importFailure = true
      error.publicMessage = message
      throw error
    }
    for (const item of items) {
      if (!isValidMamiProduct(item)) {
        skipped.push({ sourceProductId: item.sourceProductId, reason: getMamiInvalidReason(item) || 'Producto inválido' })
        continue
      }
      const catalogMapping = suggestCatalogMapping({ name: item.name, brand: item.brand, source_category: item.sourceCategory, source_subcategory: item.proposedSubcategory })
      const proposedCategory = catalogMapping?.category || item.proposedCategory
      const proposedSubcategory = catalogMapping?.subcategory || item.proposedSubcategory
      const category = (categories || []).find((candidate) => candidate.name === proposedCategory)
      const subcategory = (subcategories || []).find((candidate) => candidate.name === proposedSubcategory && String(candidate.category_id) === String(category?.id))
      const sourceProductId = String(item.sourceProductId || '').trim()
      if (sourceProductId && seenSourceProductIds.has(sourceProductId)) {
        skipped.push({ sourceProductId, reason: 'Producto repetido en la selección' })
        continue
      }
      const existingBySourceId = sourceProductId ? (existingProducts || []).find((candidate) => String(candidate.source_product_id || '') === sourceProductId) : null
      const existingByEan = item.ean ? (existingProducts || []).find((candidate) => String(candidate.ean || '') === String(item.ean)) : null
      const existingByCrossSourceName = findCrossSourceProductMatch(item, existingProducts, 'mami')
      const existing = existingBySourceId || existingByEan || existingByCrossSourceName
      if (existing) {
        if (sourceProductId) seenSourceProductIds.add(sourceProductId)
        const existingOffer = existing.offers?.find((offer) => offer.supermarket === 'Mami')
        if (existingOffer) {
          if (!sameMoneyValue(existingOffer.cash_price, item.price)) {
            const { error } = await analysisWriter.from('offers').update({ cash_price: item.price }).eq('id', existingOffer.id)
            if (error) failImport('No se pudo actualizar el precio de Mami', error.message)
            updatedOfferPrices.push({ id: existingOffer.id, cashPrice: existingOffer.cash_price })
            const historyId = await recordPriceHistory({ productId: existing.id, offerId: existingOffer.id, cashPrice: item.price, source: 'mami_import', throwOnError: true })
            if (historyId) createdHistoryIds.push(historyId)
            updated.push({ productId: existing.id, sourceProductId })
          } else {
            unchanged.push({ productId: existing.id, sourceProductId })
          }
        } else {
          const { data: offer, error } = await analysisWriter.from('offers').insert({ product_id: existing.id, supermarket: 'Mami', cash_price: item.price }).select('id, supermarket, cash_price').single()
          if (error) failImport('No se pudo crear la oferta de Mami', error.message)
          createdOfferIds.push(offer.id)
          existing.offers = [...(existing.offers || []), offer]
          const historyId = await recordPriceHistory({ productId: existing.id, offerId: offer.id, cashPrice: item.price, source: 'mami_import', throwOnError: true })
          if (historyId) createdHistoryIds.push(historyId)
          updated.push({ productId: existing.id, sourceProductId })
        }
        continue
      }
      if (!category || !subcategory || seenSourceProductIds.has(sourceProductId)) {
        skipped.push({ sourceProductId, reason: !category || !subcategory ? 'Falta mapeo de categoría' : 'Producto repetido en la selección' })
        continue
      }
      seenSourceProductIds.add(sourceProductId)
      const normalizedBrandName = normalizeBrandName(item.brand)
      let brand = normalizedBrandName ? brandCache.get(normalizedBrandName) : null
      if (!brand && normalizedBrandName) brand = (brands || []).find((candidate) => normalizeBrandName(candidate.name) === normalizedBrandName)
      if (!brand && normalizedBrandName) {
        const { data: createdBrand, error: brandError } = await analysisWriter.from('brands').insert({ name: normalizedBrandName }).select('id, name').single()
        if (brandError) {
          if (brandError.code !== '23505') failImport('No se pudo crear la marca', brandError.message)
          const { data: existingBrand, error: existingBrandError } = await analysisWriter.from('brands').select('id, name').eq('name', normalizedBrandName).maybeSingle()
          if (existingBrandError || !existingBrand) failImport('No se pudo resolver la marca de Mami', existingBrandError?.message || brandError.message)
          brand = existingBrand
        } else {
          brand = createdBrand
          createdBrandIds.push(createdBrand.id)
        }
        brandCache.set(normalizedBrandName, brand)
      }
      const productPayload = {
        name: item.name,
        brand_id: brand?.id || null,
        category_id: category.id,
        subcategory_id: subcategory.id,
        image: item.image || null,
        classification_source: 'manual',
        classification_confidence: 'manual',
        source: 'mami',
        source_product_id: sourceProductId,
        source_sku: item.sourceSku || null,
        ean: item.ean || null,
        source_url: item.sourceUrl || null,
        source_category: item.sourceCategory || null,
        source_subcategory: proposedSubcategory || null,
      }
      let { data: product, error: productError } = await analysisWriter.from('products').insert(productPayload).select().single()
      if (productError?.code === '42703' || productError?.code === 'PGRST204') {
        ({ data: product, error: productError } = await analysisWriter.from('products').insert({ ...productPayload, source: undefined, source_product_id: undefined, source_sku: undefined, ean: undefined, source_url: undefined, source_category: undefined, source_subcategory: undefined }).select().single())
      }
      if (productError) failImport('No se pudo crear el producto de Mami', productError.message)
      createdProductIds.push(product.id)
      const { data: offer, error: offerError } = await analysisWriter.from('offers').insert({ product_id: product.id, supermarket: 'Mami', cash_price: item.price }).select('id, supermarket, cash_price').single()
      if (offerError) failImport('Producto creado, pero no se pudo crear su oferta', offerError.message)
      createdOfferIds.push(offer.id)
      const historyId = await recordPriceHistory({ productId: product.id, offerId: offer.id, cashPrice: item.price, source: 'mami_import', throwOnError: true })
      if (historyId) createdHistoryIds.push(historyId)
      imported.push({ productId: product.id, sourceProductId })
      existingProducts.push({ ...product, offers: [offer] })
    }
    const { error: logError } = await analysisWriter.from('price_update_log').insert({
      admin_username: req.admin,
      filters: { source: 'mami_import', query: String(req.body?.query || '').trim() || null },
      percentage: 0,
      products_updated: imported.length + updated.length,
      changes: [
        ...imported.map((entry) => ({ type: 'mami_import', status: 'imported', ...entry })),
        ...updated.map((entry) => ({ type: 'mami_import', status: 'updated', ...entry })),
        ...unchanged.map((entry) => ({ type: 'mami_import', status: 'unchanged', ...entry })),
        ...skipped.map((entry) => ({ type: 'mami_import', status: 'skipped', ...entry })),
      ],
    })

    app.post('/admin/import/mami/update-prices', requireAdmin, async (req, res) => {
      try {
        const result = await syncMamiLowPrices({
          database: analysisWriter,
          historyRecorder: recordPriceHistory,
        })

        if (result.updated.length) {
          const firstChange = result.updated[0]
          const percentage = firstChange.previousCashPrice > 0
            ? ((firstChange.updatedCashPrice - firstChange.previousCashPrice) / firstChange.previousCashPrice) * 100
            : 0
          const { error: logError } = await analysisWriter.from('price_update_log').insert({
            admin_username: req.admin,
            filters: { source: 'mami_price_repair' },
            percentage,
            products_updated: result.updated.length,
            changes: result.updated,
          })
          if (logError) throw logError
        }

        invalidateCatalogPageCache()
        res.json({
          checked: result.checked,
          updated: result.updated,
          unchanged: result.unchanged.length,
          skipped: result.skipped,
        })
      } catch (error) {
        console.error('Error repairing low Mami prices', error)
        res.status(502).json({ error: 'No se pudieron verificar los precios bajos de Mami', detail: error.message })
      }
    })

    if (logError) console.error('Error recording Mami import update', logError)
    res.json({ source: 'mami', imported, updated, unchanged, skipped, dryRun: false, writeSafety: { productWritesAllowed: true, priceHistoryWritesAllowed: true, mutationSurface: 'mami_import' } })
  } catch (error) {
    if (error.importFailure) {
      await Promise.all(createdHistoryIds.map((id) => analysisWriter.from('price_history').delete().eq('id', id)))
      await Promise.all(createdOfferIds.map((id) => analysisWriter.from('offers').delete().eq('id', id)))
      await Promise.all(updatedOfferPrices.map((offer) => analysisWriter.from('offers').update({ cash_price: offer.cashPrice }).eq('id', offer.id)))
      await Promise.all(createdProductIds.map((id) => analysisWriter.from('products').delete().eq('id', id)))
      await Promise.all(createdBrandIds.map((id) => analysisWriter.from('brands').delete().eq('id', id)))
      return res.status(500).json({ error: error.publicMessage || 'No se pudieron importar los productos de Mami', detail: error.message, rolledBack: true })
    }
    console.error('Error importing Mami products', error)
    return res.status(500).json({ error: 'No se pudieron importar los productos de Mami', detail: error.message })
  }
})

app.post('/admin/import/mami', requireAdmin, (req, res) => {
  res.status(403).json({
    source: mamiSource,
    dryRun: true,
    writeSafety: {
      productWritesAllowed: false,
      priceHistoryWritesAllowed: false,
      mutationSurface: 'preview_only',
      reason: 'Mami import is locked to simulation-only preview and must never perform product or price_history writes',
    },
    error: 'La importación de Mami está bloqueada en modo simulación. Usa /admin/import/mami/preview para comparar sin escribir.',
  })
})

app.post('/admin/import/disco', requireAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.products) ? req.body.products : []
    if (!items.length) return res.status(400).json({ error: 'Seleccioná al menos un producto' })
    const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }, { data: brands, error: brandsError }, { data: existingProducts, error: productsError }] = await Promise.all([
      supabase.from('categories').select('id, name'),
      supabase.from('subcategories').select('id, name, category_id'),
      supabase.from('brands').select('id, name'),
      supabase.from('products').select('id, name, source_product_id, ean, offers(id, supermarket, cash_price)'),
    ])
    const catalogError = categoriesError || subcategoriesError || brandsError || productsError
    if (catalogError) {
      console.error('Error loading catalog for Disco import', catalogError)
      return res.status(500).json({ error: 'No se pudo consultar el catálogo local', detail: catalogError.message })
    }
    const imported = []
    const skipped = []
    const brandCache = new Map()
    const seenSourceProductIds = new Set()
    for (const item of items) {
      if (!isValidDiscoProduct(item)) {
        skipped.push({ sourceProductId: item.sourceProductId, reason: 'Producto inválido o sin precio válido' })
        continue
      }
      const catalogMapping = suggestCatalogMapping({
        name: item.name,
        brand: item.brand,
        source_category: item.sourceCategory,
        source_subcategory: item.proposedSubcategory,
      })
      const proposedCategory = catalogMapping?.category || item.proposedCategory
      const updated = []
      const unchanged = []
      const proposedSubcategory = catalogMapping?.subcategory || item.proposedSubcategory
      const sourceProductId = String(item.sourceProductId ?? '').trim()
      const category = (categories || []).find((candidate) => candidate.name === proposedCategory)
      const subcategory = (subcategories || []).find((candidate) => candidate.name === proposedSubcategory && String(candidate.category_id) === String(category?.id))
      const existingBySourceId = sourceProductId
        ? (existingProducts || []).find((candidate) => String(candidate.source_product_id || '') === sourceProductId)
        : null
      const existingByEan = item.ean
        ? (existingProducts || []).find((candidate) => String(candidate.ean || '') === String(item.ean))
        : null
      const existingByCrossSourceName = findCrossSourceProductMatch(item, existingProducts, 'disco')
      const existing = existingBySourceId || existingByEan || existingByCrossSourceName
      if (existing) {
        if (seenSourceProductIds.has(sourceProductId)) {
          skipped.push({ sourceProductId: item.sourceProductId, reason: 'Producto repetido en la selección' })
          continue
        }
        seenSourceProductIds.add(sourceProductId)
        const existingOffer = existing.offers?.find((offer) => offer.supermarket === 'Disco')
        if (existingOffer) {
          if (!sameMoneyValue(existingOffer.cash_price, item.price)) {
            const { error: offerUpdateError } = await analysisWriter.from('offers').update({ cash_price: item.price }).eq('id', existingOffer.id)
            if (offerUpdateError) {
              return res.status(500).json({ error: 'No se pudo actualizar la oferta de Disco', detail: offerUpdateError.message, code: offerUpdateError.code })
            }
            await recordPriceHistory({ productId: existing.id, offerId: existingOffer.id, cashPrice: item.price, source: 'disco_import' })
            updated.push({ productId: existing.id, sourceProductId, offerId: existingOffer.id })
          } else {
            unchanged.push({ productId: existing.id, sourceProductId, offerId: existingOffer.id })
          }
        } else {
          const { data: offer, error: offerError } = await analysisWriter.from('offers').insert({ product_id: existing.id, supermarket: 'Disco', cash_price: item.price }).select().single()
          if (offerError) {
            return res.status(500).json({ error: 'No se pudo crear la oferta de Disco', detail: offerError.message, code: offerError.code })
          }
          await recordPriceHistory({ productId: existing.id, offerId: offer.id, cashPrice: item.price, source: 'disco_import' })
          existing.offers = [...(existing.offers || []), offer]
          updated.push({ productId: existing.id, sourceProductId, offerId: offer.id })
        }
        continue
      }
      if (!category || !subcategory || seenSourceProductIds.has(sourceProductId)) {
        skipped.push({ sourceProductId: item.sourceProductId, reason: !category || !subcategory ? 'Falta precio o mapeo de categoría' : 'Producto repetido en la selección' })
        continue
      }
      if (sourceProductId) {
        seenSourceProductIds.add(sourceProductId)
      }
      const normalizedBrandName = normalizeBrandName(item.brand)
      let brand = normalizedBrandName ? brandCache.get(normalizedBrandName) : null
      if (!brand) {
        brand = (brands || []).find((candidate) => normalizeBrandName(candidate.name) === normalizedBrandName)
      }
      if (!brand && normalizedBrandName) {
        try {
          const { data: createdBrand, error: brandError } = await analysisWriter.from('brands').insert({ name: normalizedBrandName }).select('id, name').single()
          if (brandError) {
            if (brandError.code === '23505' || brandError.code === '23503') {
              const { data: refreshedBrands, error: refreshError } = await analysisWriter.from('brands').select('id, name')
              if (refreshError) throw refreshError
              brand = (refreshedBrands || []).find((candidate) => normalizeBrandName(candidate.name) === normalizedBrandName)
              if (!brand) {
                throw brandError
              }
            } else {
              throw brandError
            }
          } else {
            brand = createdBrand
            brands.push(brand)
            brandCache.set(normalizedBrandName, brand)
          }
        } catch (error) {
          console.error('Error creating/updating brand during Disco import', error)
          return res.status(500).json({ error: 'No se pudo crear la marca', detail: error.message, code: error.code || 'unknown' })
        }
      }
      if (brand && normalizedBrandName) {
        brandCache.set(normalizedBrandName, brand)
      }
      const productPayload = {
        name: item.name,
        brand_id: brand?.id || null,
        category_id: category.id,
        subcategory_id: subcategory.id,
        image: item.image || null,
        classification_source: 'manual',
        classification_confidence: 'manual',
      }
      const externalProductFields = {
        source: 'disco',
        source_product_id: String(item.sourceProductId),
        source_sku: item.sourceSku || null,
        ean: item.ean || null,
        source_url: item.sourceUrl || null,
        source_category: item.sourceCategory || null,
        source_subcategory: item.proposedSubcategory || null,
      }
      let { data: product, error: productError } = await analysisWriter
        .from('products')
        .insert({ ...productPayload, ...externalProductFields })
        .select()
        .single()
      if (productError?.code === '42703' || productError?.code === 'PGRST204') {
        ({ data: product, error: productError } = await analysisWriter
          .from('products')
          .insert(productPayload)
          .select()
          .single())
      }
      if (productError) {
        console.error('Error creating imported Disco product', productError)
        return res.status(500).json({ error: 'No se pudo crear el producto', detail: productError.message, code: productError.code })
      }
      const { data: offer, error: offerError } = await analysisWriter.from('offers').insert({ product_id: product.id, supermarket: 'Disco', cash_price: item.price }).select().single()
      if (offerError) {
        console.error('Error creating imported Disco offer', offerError)
        return res.status(500).json({ error: 'Producto creado, pero no se pudo crear su oferta', detail: offerError.message, code: offerError.code })
      }
      await recordPriceHistory({ productId: product.id, offerId: offer.id, cashPrice: item.price, source: 'disco_import' })
      imported.push({ productId: product.id, sourceProductId: item.sourceProductId })
      existingProducts.push({ ...product, offers: [offer] })
    }
    res.json({ imported, updated, unchanged, skipped })
  } catch (error) {
    console.error('Error importing Disco products', error)
    res.status(500).json({ error: 'No se pudieron importar los productos seleccionados' })
  }
})

app.post('/admin/import/disco/update-prices', requireAdmin, async (req, res) => {
  try {
    const result = await syncDiscoPrices({
      database: analysisWriter,
      historyRecorder: recordPriceHistory,
      onCatalogChange: invalidateCatalogPageCache,
      adminUsername: req.admin,
      maxCurrentPrice: req.body?.onlyLowPrices ? 1000 : null,
      minCurrentPrice: req.body?.onlyHighPrices ? 50000 : null,
    })
    res.json({
      updated: result.updated.length,
      unchanged: result.unchanged.length,
      unavailable: result.unavailable,
      suspicious: result.suspicious,
    })
  } catch (error) {
    console.error('Error updating Disco prices', error)
    res.status(502).json({ error: 'No se pudieron actualizar los precios de Disco', detail: error.message })
  }
})

app.get('/admin/import/disco/sync-status', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_update_log')
      .select('updated_at, products_updated, changes, filters')
      .eq('filters->>source', 'disco_sync')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    res.json({
      lastSyncAt: data?.updated_at || null,
      updated: data?.products_updated || 0,
      changes: Array.isArray(data?.changes) ? data.changes.length : 0,
      suspicious: Array.isArray(data?.filters?.suspicious) ? data.filters.suspicious : [],
    })
  } catch (error) {
    console.error('Error fetching Disco sync status', error)
    res.status(500).json({ error: 'No se pudo consultar el estado de sincronización' })
  }
})

app.get('/admin/import/disco/import-status', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_update_log')
      .select('updated_at, products_updated, filters, changes')
      .eq('filters->>source', 'disco_public_search')
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw error
    const logs = data || []
    const totals = logs.reduce((summary, log) => {
      const change = Array.isArray(log.changes) ? log.changes[0] || {} : {}
      summary.imported += Number(change.imported || 0)
      summary.updated += Number(change.updated || 0)
      summary.discarded += Number(change.discarded || 0)
      return summary
    }, { imported: 0, updated: 0, discarded: 0 })
    res.json({ searches: logs.length, lastSearchAt: logs[0]?.updated_at || null, totals, logs })
  } catch (error) {
    console.error('Error fetching Disco import status', error)
    res.status(500).json({ error: 'No se pudo consultar el estado de importación' })
  }
})

app.put('/products/:id/classification', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'La edición de productos requiere SUPABASE_SERVICE_ROLE_KEY configurada en el backend.' })
    }
    const { id } = req.params
    const { subcategory_id } = req.body || {}
    const priceHistoryRecorded = req.body?.priceHistoryRecorded === true
    if (!subcategory_id) return res.status(400).json({ error: 'subcategory_id is required' })
    const { data: previousProduct, error: previousError } = await analysisWriter
      .from('products')
      .select('category_id, subcategory_id')
      .eq('id', id)
      .maybeSingle()
    if (previousError) throw previousError
    const { data, error } = await analysisWriter.from('products').update({
      subcategory_id,
      classification_source: 'manual',
      classification_confidence: 'manual',
    }).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: 'Error updating product classification' })
    invalidateCatalogPageCache()
    scheduleRelatedPriceStatusRefresh(id, true, previousProduct)
    res.json(data)
  } catch (error) {
    console.error('Error updating product classification', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function invalidateAnalysisCache() {
  analysisCatalogPromise = undefined
  priceUpdateLogsPromise = undefined
}

function invalidateCatalogPageCache() {
  catalogPageCache.clear()
  catalogTaxonomyReviewCache = null
}

async function recordPriceHistory({
  productId,
  offerId,
  cashPrice,
  source = 'admin',
  scheduleStatusRefresh = true,
  throwOnError = false,
}) {
  const price = Number(cashPrice)
  if (!productId || !offerId || !Number.isFinite(price) || price <= 0) {
    const error = new TypeError('Price history requires a product, offer, and positive price')
    if (throwOnError) throw error
    console.error(error.message)
    return null
  }

  let historyInsert = analysisWriter.from('price_history').insert({
    product_id: productId,
    offer_id: offerId,
    cash_price: price,
    source,
  })
  if (throwOnError) historyInsert = historyInsert.select('id').single()
  const { data, error } = await historyInsert
  if (error) {
    console.error('Error recording price history', error)
    if (throwOnError) throw error
  }
  else {
    invalidateCatalogPageCache()
    invalidateAnalysisCache()
    if (scheduleStatusRefresh) scheduleRelatedPriceStatusRefresh(productId)
  }
  return data?.id || null
}

async function importDiscoSearchResults(search) {
  const normalizedSearch = String(search || '').trim().toLowerCase()
  if (!normalizedSearch) return { imported: 0, updated: 0 }
  const cachedAt = publicDiscoSearchCache.get(normalizedSearch)
  if (cachedAt && Date.now() - cachedAt < 5 * 60 * 1000) return { imported: 0, updated: 0 }

  publicDiscoSearchCache.set(normalizedSearch, Date.now())
  const previewReport = await fetchDiscoPreviewReport({ query: normalizedSearch, from: 0, to: publicDiscoSearchMaxResults - 1 })
  const preview = previewReport.products
  if (!preview.length && !previewReport.discarded.length) return { imported: 0, updated: 0 }

  const [{ data: categories }, { data: subcategories }, { data: brands }, { data: existingProducts }] = await Promise.all([
    analysisWriter.from('categories').select('id, name'),
    analysisWriter.from('subcategories').select('id, name, category_id'),
    analysisWriter.from('brands').select('id, name'),
    analysisWriter.from('products').select('id, name, source, source_product_id, ean, brands(name), offers(id, supermarket)'),
  ])
  const productsBySource = new Map((existingProducts || []).map((product) => [String(product.source_product_id || ''), product]))
  const productsByEan = new Map((existingProducts || []).filter((product) => product.ean).map((product) => [String(product.ean), product]))
  const brandCache = new Map((brands || []).map((brand) => [normalizeBrandName(brand.name), brand]))
  const existingOfferIds = (existingProducts || [])
    .flatMap((product) => (product.offers || []).map((offer) => offer.id))
    .filter(Boolean)
  const latestHistoryByOffer = new Map()
  if (existingOfferIds.length) {
    const { data: latestHistory, error: historyError } = await analysisWriter
      .from('price_history')
      .select('offer_id, source, observed_at')
      .in('offer_id', existingOfferIds)
      .order('observed_at', { ascending: false })
    if (historyError) console.error('Error reading Disco offer history', historyError.message)
    for (const point of latestHistory || []) {
      if (!latestHistoryByOffer.has(String(point.offer_id))) latestHistoryByOffer.set(String(point.offer_id), point)
    }
  }
  let imported = 0
  let updated = 0

  for (const item of preview) {
    const existing = productsBySource.get(String(item.sourceProductId))
      || (item.ean && productsByEan.get(String(item.ean)))
      || findCrossSourceProductMatch(item, existingProducts, 'disco')
    const existingOffer = existing?.offers?.find((offer) => offer.supermarket === 'Disco')
    if (existing && existingOffer) {
      if (!sameMoneyValue(existingOffer.cash_price, item.price)) {
        const latestHistory = latestHistoryByOffer.get(String(existingOffer.id))
        const hasManualOverride = ['admin', 'admin_edit', 'bulk_admin'].includes(latestHistory?.source)
        if (hasManualOverride) continue
        const { error } = await analysisWriter.from('offers').update({ cash_price: item.price }).eq('id', existingOffer.id)
        if (!error) {
          await recordPriceHistory({ productId: existing.id, offerId: existingOffer.id, cashPrice: item.price, source: 'disco_public_search' })
          updated++
        }
      }
      continue
    }
    if (existing && !existingOffer) {
      const { data: offer, error } = await analysisWriter.from('offers').insert({ product_id: existing.id, supermarket: 'Disco', cash_price: item.price }).select('id').single()
      if (!error) {
        await recordPriceHistory({ productId: existing.id, offerId: offer.id, cashPrice: item.price, source: 'disco_public_search' })
        updated++
      }
      continue
    }
    if (!item.proposedCategory || !item.proposedSubcategory) continue
    const category = (categories || []).find((candidate) => candidate.name === item.proposedCategory)
    const subcategory = (subcategories || []).find((candidate) => candidate.name === item.proposedSubcategory && String(candidate.category_id) === String(category?.id))
    if (!category || !subcategory) continue

    const brandName = normalizeBrandName(item.brand)
    let brand = brandName ? brandCache.get(brandName) : null
    if (!brand && brandName) {
      const { data: createdBrand, error: brandError } = await analysisWriter.from('brands').insert({ name: String(item.brand).trim() }).select('id, name').single()
      if (brandError) continue
      brand = createdBrand
      brandCache.set(brandName, brand)
    }
    const { data: product, error: productError } = await analysisWriter.from('products').insert({
      name: item.name,
      brand_id: brand?.id || null,
      category_id: category.id,
      subcategory_id: subcategory.id,
      image: item.image || null,
      source: 'disco',
      source_product_id: String(item.sourceProductId),
      source_sku: item.sourceSku || null,
      ean: item.ean || null,
      source_url: item.sourceUrl || null,
      source_category: item.sourceCategory || null,
      source_subcategory: item.proposedSubcategory || null,
    }).select('id').single()
    if (productError) continue
    const { data: offer, error: offerError } = await analysisWriter.from('offers').insert({ product_id: product.id, supermarket: 'Disco', cash_price: item.price }).select('id').single()
    if (!offerError) {
      await recordPriceHistory({ productId: product.id, offerId: offer.id, cashPrice: item.price, source: 'disco_public_search' })
      imported++
    }
  }
  const discardedByReason = previewReport.discarded.reduce((counts, product) => {
    counts[product.reason] = (counts[product.reason] || 0) + 1
    return counts
  }, {})
  const { error: logError } = await analysisWriter.from('price_update_log').insert({
    admin_username: 'public_search',
    filters: { source: 'disco_public_search', query: normalizedSearch, discarded: discardedByReason },
    percentage: 0,
    products_updated: imported + updated,
    changes: [{ imported, updated, discarded: previewReport.discarded.length }],
  })
  if (logError) console.error('Error recording public Disco search', logError.message)
  return { imported, updated, discarded: previewReport.discarded.length }
}

function scheduleDiscoSearchResults(search) {
  const normalizedSearch = String(search || '').trim().toLowerCase()
  const cachedAt = publicDiscoSearchCache.get(normalizedSearch)
  if (!normalizedSearch || (cachedAt && Date.now() - cachedAt < 5 * 60 * 1000) || publicDiscoSearchInFlight.has(normalizedSearch)) return

  publicDiscoSearchInFlight.add(normalizedSearch)
  setImmediate(() => {
    importDiscoSearchResults(normalizedSearch)
      .catch((error) => console.error('Disco search import failed', error.message))
      .finally(() => publicDiscoSearchInFlight.delete(normalizedSearch))
  })
}

// GET /products - fetch from Supabase with simple filters + pagination
app.get('/products', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim()
    const requestedPage = Number(req.query.page || 1)
    const requestedLimit = Number(req.query.limit || 20)
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 100)
      : 20
    const parsedMaxPrice = Number(req.query.maxPrice || 1000000)
    const favoriteIds = [...new Set(String(req.query.favorites || '')
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0))]
    const queryArgs = {
      p_search: search,
      p_category: String(req.query.category || ''),
      p_subcategory: String(req.query.subcategory || ''),
      p_brand: String(req.query.brand || ''),
      p_supermarket: String(req.query.supermarket || ''),
      p_price_status: String(req.query.status || 'todos'),
      p_sort: String(req.query.sort || 'id-asc'),
      p_max_price: Number.isFinite(parsedMaxPrice) ? parsedMaxPrice : 1000000,
      p_favorites_only: req.query.favoritesOnly === 'true',
      p_favorite_ids: favoriteIds,
      p_valid_only: req.query.catalogOnly === 'true',
      p_rules_version: priceStatusRulesVersion,
    }
    const cacheKey = JSON.stringify({
      ...queryArgs,
      p_favorite_ids: [...favoriteIds].sort((left, right) => left - right),
      catalogSortVersion,
    })
    const fetchCatalogPage = async (requestedPage, requestedPageLimit) => {
      const { data, error } = await analysisWriter.rpc('catalog_products_page', {
        ...queryArgs,
        p_page: requestedPage,
        p_limit: requestedPageLimit,
      })
      if (error) throw error
      if (!data || typeof data !== 'object' || !Array.isArray(data.data)) {
        throw new Error('Catalog pagination RPC returned an invalid response')
      }
      return data
    }
    const loadProductsByIds = async (productIds) => {
      const { data: productsPayload, error } = await analysisWriter.rpc('catalog_products_by_ids', {
        p_product_ids: productIds,
        p_rules_version: priceStatusRulesVersion,
      })
      if (error) throw error
      if (!Array.isArray(productsPayload?.data)) {
        throw new Error('Catalog hydration RPC returned an invalid response')
      }
      return productsPayload.data
    }
    let data
    try {
      data = await catalogPageCache.getPage({
        key: cacheKey,
        page,
        limit,
        loadIndex: fetchCatalogPage,
        loadProductsByIds,
        loadPage: () => fetchCatalogPage(page, limit),
      })
    } catch (error) {
      console.error('Supabase catalog pagination error:', error)
      return res.status(500).json({ error: 'Error fetching products' })
    }
    const cacheHit = data?.cacheHit === true
    const responseData = { ...data }
    delete responseData.cacheHit
    delete responseData.orderedIds
    res.set('X-Catalog-Cache', cacheHit ? 'HIT' : 'MISS')
    if (search && page === 1) res.once('finish', () => scheduleDiscoSearchResults(search))
    res.json(responseData)
    if (page * limit < data.total) {
      setImmediate(() => {
        catalogPageCache.prefetchPage({
          key: cacheKey,
          page: page + 1,
          limit,
          loadProductsByIds,
        }).catch((error) => console.error('Catalog next-page prefetch failed:', error))
      })
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function getProductAnalyses(productIds) {
  const { products, analysisContext } = await getAnalysisCatalog()
  const targetIds = productIds ? new Set(productIds.map(String)) : null
  const targetProducts = (products || []).filter((product) => !targetIds || targetIds.has(String(product.id)))
  if (!targetProducts.length) return []
  const targetProductIds = targetProducts.map((product) => product.id)
  const history = []
  const pageSize = 500
  for (let index = 0; index < targetProductIds.length; index += 100) {
    const ids = targetProductIds.slice(index, index + 100)
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .in('product_id', ids)
        .order('observed_at', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) {
        const historyError = new Error('Price history query failed', { cause: error })
        historyError.priceHistoryUnavailable = true
        throw historyError
      }
      history.push(...(data || []))
      if ((data || []).length < pageSize) break
    }
  }

  const updateLogs = await getPriceUpdateLogs()

  const historyByProduct = new Map()
  for (const point of history || []) {
    const points = historyByProduct.get(String(point.product_id)) || []
    points.push(point)
    historyByProduct.set(String(point.product_id), points)
  }
  for (const update of updateLogs || []) {
    for (const change of Array.isArray(update.changes) ? update.changes : []) {
      if (!change.productId || !change.updatedCashPrice
        || (targetIds && !targetIds.has(String(change.productId)))) continue
      const points = historyByProduct.get(String(change.productId)) || []
      const alreadyRecorded = points.some((point) => String(point.offer_id) === String(change.offerId)
        && Number(point.cash_price) === Number(change.updatedCashPrice))
      if (!alreadyRecorded) {
        points.push({
          product_id: change.productId,
          offer_id: change.offerId,
          observed_at: update.updated_at,
          cash_price: change.updatedCashPrice,
          source: 'bulk_admin_log',
        })
        historyByProduct.set(String(change.productId), points)
      }
    }
  }

  return Promise.all(targetProducts.map((product) => analyzeProduct(
    product,
    products,
    historyByProduct.get(String(product.id)) || [],
    product.categories?.name || '',
    analysisContext,
  )))
}

async function getAnalysisCatalog() {
  if (!analysisCatalogPromise) {
    analysisCatalogPromise = (async () => {
      const products = []
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('products')
          .select('*, offers(*), categories(name), subcategories(name), brands(name)')
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (error) throw error
        products.push(...(data || []))
        if ((data || []).length < pageSize) break
      }
      return { products, analysisContext: await createAnalysisContext(products) }
    })().catch((error) => {
      analysisCatalogPromise = undefined
      throw error
    })
  }
  return analysisCatalogPromise
}

async function getPriceUpdateLogs() {
  if (!priceUpdateLogsPromise) {
    priceUpdateLogsPromise = (async () => {
      const logs = []
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('price_update_log')
          .select('updated_at, changes')
          .order('updated_at', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (error) {
          console.error('Error fetching price update history', error)
          throw error
        }
        logs.push(...(data || []))
        if ((data || []).length < pageSize) break
      }
      return logs
    })().catch((error) => {
      priceUpdateLogsPromise = undefined
      throw error
    })
  }
  return priceUpdateLogsPromise
}

async function refreshCurrentPriceStatuses(productIds) {
  const analyses = await getProductAnalyses(productIds)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await saveCurrentPriceStatuses(analysisWriter, analyses)
  }
}

async function enqueueRelatedPriceStatuses(productId, includeScope = true, previousProduct = null) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const ids = new Set([String(productId)])
  const { data: dependents, error: dependencyError } = await analysisWriter
    .from('product_price_status')
    .select('product_id')
    .contains('comparable_product_ids', [productId])
  if (dependencyError) throw dependencyError
  for (const dependent of dependents || []) ids.add(String(dependent.product_id))

  if (includeScope) {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('category_id, subcategory_id')
      .eq('id', productId)
      .maybeSingle()
    if (productError) throw productError
    const scopes = [
      product && { category_id: product.category_id, subcategory_id: product.subcategory_id },
      previousProduct && { category_id: previousProduct.category_id, subcategory_id: previousProduct.subcategory_id },
    ].filter(Boolean)
    for (const scope of scopes) {
      if (!scope.subcategory_id && !scope.category_id) continue
      let query = supabase.from('products').select('id')
      query = scope.subcategory_id
        ? query.eq('subcategory_id', scope.subcategory_id)
        : query.eq('category_id', scope.category_id)
      const { data: relatedProducts, error: relatedError } = await query
      if (relatedError) throw relatedError
      for (const related of relatedProducts || []) ids.add(String(related.id))
    }
  }

  priceStatusQueue.enqueue([...ids])
}

function scheduleRelatedPriceStatusRefresh(productId, includeScope = true, previousProduct = null) {
  invalidateAnalysisCache()
  void enqueueRelatedPriceStatuses(productId, includeScope, previousProduct)
    .catch((error) => console.error('Unable to queue related current price statuses', error))
}

// GET /analysis/products - return the most recently persisted status for each product
function serializeCurrentPriceStatus(status) {
  const details = status.analysis_details || {}
  const nullableNumber = (value) => value === null || value === undefined || value === ''
    ? null
    : Number.isFinite(Number(value)) ? Number(value) : null
  return {
    product: { id: status.product_id },
    classification: status.classification,
    score: nullableNumber(status.anomaly_score),
    offerScore: nullableNumber(status.offer_score),
    confidence: status.confidence || null,
    confidencePercentage: nullableNumber(status.confidence_percentage),
    dataQuality: status.data_quality || null,
    analyzedAt: status.analyzed_at,
    indicators: details.indicators || null,
    references: details.references || null,
    priceHistory: details.priceHistory || null,
    pricePeriods: details.pricePeriods || null,
    populatedPeriods: nullableNumber(details.populatedPeriods),
    evolutionAvailable: details.evolutionAvailable ?? null,
    taxonomy: details.taxonomy || null,
  }
}

app.get('/analysis/products/:productId', async (req, res) => {
  try {
    const { data, error } = await analysisWriter
      .from('product_price_status')
      .select('product_id, classification, anomaly_score, offer_score, confidence, confidence_percentage, data_quality, analysis_details, analyzed_at')
      .eq('product_id', req.params.productId)
      .maybeSingle()

    if (error) {
      console.error('Error fetching persisted current price status', error)
      return res.status(503).json({
        error: 'Current price status is not available',
        detail: 'Verify the product_price_status migration and SUPABASE_SERVICE_ROLE_KEY configuration',
      })
    }
    if (!data) return res.status(404).json({ error: 'Current price status not found' })
    return res.json(serializeCurrentPriceStatus(data))
  } catch (error) {
    console.error('Error fetching persisted current price status', error)
    return res.status(500).json({ error: 'Error fetching current price status' })
  }
})

app.get('/analysis/products', async (req, res) => {
  try {
    const analyses = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await analysisWriter
        .from('product_price_status')
        .select('product_id, classification, anomaly_score, offer_score, confidence, confidence_percentage, data_quality, analysis_details, analyzed_at')
        .order('product_id', { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (error) {
        console.error('Error fetching persisted current price statuses', error)
        return res.status(503).json({
          error: 'Current price status is not available',
          detail: 'Verify the product_price_status migration and SUPABASE_SERVICE_ROLE_KEY configuration',
        })
      }
      analyses.push(...(data || []).map(serializeCurrentPriceStatus))
      if ((data || []).length < pageSize) break
    }
    res.json(analyses)
  } catch (error) {
    console.error('Error fetching persisted current price statuses', error)
    res.status(500).json({ error: 'Error fetching current price status' })
  }
})

app.get('/analysis/catalog-taxonomy-review', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({
        error: 'El relevamiento de categorías requiere SUPABASE_SERVICE_ROLE_KEY en el backend.',
      })
    }

    const requestedPage = Number(req.query.page || 1)
    const requestedLimit = Number(req.query.limit || 20)
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1
    const limit = Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 50)
      : 20
    const status = ['pending', 'resolved', 'dismissed', 'all'].includes(String(req.query.status || 'pending'))
      ? String(req.query.status || 'pending')
      : 'pending'

    if (req.query.refresh === 'true') catalogTaxonomyReviewCache = null

    if (!catalogTaxonomyReviewCache || catalogTaxonomyReviewCache.expiresAt <= Date.now()) {
      const [
        { count, error: countError },
        { data: categories, error: categoriesError },
        { data: subcategories, error: subcategoriesError },
        { data: decisions, error: decisionsError },
      ] = await Promise.all([
        analysisWriter.from('products').select('id', { count: 'exact', head: true }),
        analysisWriter.from('categories').select('id,name'),
        analysisWriter.from('subcategories').select('id,name,category_id'),
        analysisWriter.from('catalog_taxonomy_review_decisions').select('product_id,status,admin_username,updated_at'),
      ])
      if (countError) throw countError
      if (categoriesError) throw categoriesError
      if (subcategoriesError) throw subcategoriesError
      if (decisionsError) throw decisionsError

      const pageSize = 1000
      const pageCount = Math.ceil(Number(count || 0) / pageSize)
      const productPages = await Promise.all(
        Array.from({ length: pageCount }, (_, index) => {
          const start = index * pageSize
          return analysisWriter
            .from('products')
            .select('id,name,source,source_category,source_subcategory,category_id,subcategory_id,classification_source,brands(name),categories(id,name),subcategories(id,name)')
            .order('id', { ascending: true })
            .range(start, start + pageSize - 1)
        }),
      )
      for (const result of productPages) {
        if (result.error) throw result.error
      }

      const categoryIdsByName = new Map(
        (categories || []).map((category) => [String(category.name).toLowerCase(), category.id]),
      )
      const subcategoryIdsByCategoryAndName = new Map(
        (subcategories || []).map((subcategory) => [
          `${subcategory.category_id}:${String(subcategory.name).toLowerCase()}`,
          subcategory.id,
        ]),
      )
      const products = productPages.flatMap((result) => result.data || [])
      const items = buildCatalogTaxonomyReview(products, decisions || []).map((item) => {
        const suggestedCategoryId = categoryIdsByName.get(String(item.suggestedCategory).toLowerCase()) || null
        const suggestedSubcategoryId = suggestedCategoryId
          ? subcategoryIdsByCategoryAndName.get(`${suggestedCategoryId}:${String(item.suggestedSubcategory).toLowerCase()}`) || null
          : null
        return { ...item, suggestedCategoryId, suggestedSubcategoryId }
      })

      catalogTaxonomyReviewCache = {
        items,
        generatedAt: new Date().toISOString(),
        expiresAt: Date.now() + 60_000,
      }
    }

    const allItems = catalogTaxonomyReviewCache.items
    const summary = {
      pending: allItems.filter((item) => item.decision === 'pending').length,
      resolved: allItems.filter((item) => item.decision === 'resolved').length,
      dismissed: allItems.filter((item) => item.decision === 'dismissed').length,
      total: allItems.length,
    }
    const filteredItems = status === 'all'
      ? allItems
      : allItems.filter((item) => item.decision === status)
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / limit))
    const safePage = Math.min(page, totalPages)

    res.json({
      generatedAt: catalogTaxonomyReviewCache.generatedAt,
      status,
      summary,
      page: safePage,
      limit,
      total: filteredItems.length,
      totalPages,
      items: filteredItems.slice((safePage - 1) * limit, safePage * limit),
    })
  } catch (error) {
    console.error('Error generating catalog taxonomy review', error)
    res.status(500).json({
      error: 'No se pudo generar el relevamiento de categorías',
      detail: error.message || 'Unknown error',
    })
  }
})

app.post('/review/catalog-taxonomy-decisions', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({
        error: 'La revisión de categorías requiere SUPABASE_SERVICE_ROLE_KEY en el backend.',
      })
    }

    const productId = String(req.body?.productId || '').trim()
    const status = String(req.body?.status || '')
    if (!/^\d+$/.test(productId)) {
      return res.status(400).json({ error: 'productId must be a positive integer' })
    }
    if (!['resolved', 'dismissed', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'status must be resolved, dismissed, or pending' })
    }

    if (status === 'pending') {
      const { error } = await analysisWriter
        .from('catalog_taxonomy_review_decisions')
        .delete()
        .eq('product_id', productId)
      if (error) throw error
      catalogTaxonomyReviewCache = null
      return res.json({ success: true, status })
    }

    if (status === 'resolved') {
      const subcategoryId = String(req.body?.subcategoryId || '').trim()
      if (!subcategoryId) {
        return res.status(400).json({ error: 'subcategoryId is required to resolve a product' })
      }

      const [
        { data: subcategory, error: subcategoryError },
        { data: previousProduct, error: productError },
      ] = await Promise.all([
        analysisWriter.from('subcategories').select('id,category_id').eq('id', subcategoryId).maybeSingle(),
        analysisWriter.from('products').select('id,category_id,subcategory_id').eq('id', productId).maybeSingle(),
      ])
      if (subcategoryError) throw subcategoryError
      if (productError) throw productError
      if (!subcategory) return res.status(400).json({ error: 'La subcategoría seleccionada no existe' })
      if (!previousProduct) return res.status(404).json({ error: 'No se encontró el producto' })

      const { error: updateError } = await analysisWriter
        .from('products')
        .update({
          category_id: subcategory.category_id,
          subcategory_id: subcategory.id,
          classification_source: 'manual',
          classification_confidence: 'manual',
        })
        .eq('id', productId)
      if (updateError) throw updateError

      if (
        String(previousProduct.category_id || '') !== String(subcategory.category_id)
        || String(previousProduct.subcategory_id || '') !== String(subcategory.id)
      ) {
        invalidateCatalogPageCache()
        scheduleRelatedPriceStatusRefresh(productId, true, previousProduct)
      }
    }

    const { data: decision, error: decisionError } = await analysisWriter
      .from('catalog_taxonomy_review_decisions')
      .upsert({
        product_id: Number(productId),
        status,
        admin_username: req.admin,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id' })
      .select()
      .single()
    if (decisionError) throw decisionError

    catalogTaxonomyReviewCache = null
    res.json({ success: true, decision })
  } catch (error) {
    console.error('Error saving catalog taxonomy review decision', error)
    res.status(500).json({
      error: 'No se pudo guardar la decisión de revisión',
      detail: error.message || 'Unknown error',
    })
  }
})

app.get('/analysis/cross-source-matches', requireAdmin, async (req, res) => {
  try {
    const sourceFilter = String(req.query.source || '').trim().toLowerCase()
    const allowedSources = new Set(['mami', 'disco', 'all'])
    const selectedSources = allowedSources.has(sourceFilter) ? sourceFilter : 'all'

    const sourceQueries = []
    if (selectedSources === 'all' || selectedSources === 'mami') {
      sourceQueries.push(
        analysisWriter
          .from('products')
          .select('id,name,image,source,source_product_id,source_sku,ean,category_id,subcategory_id,brands(name),categories(name),subcategories(name),offers(supermarket,cash_price)')
          .eq('source', 'mami')
          .order('id', { ascending: true }),
      )
    }
    if (selectedSources === 'all' || selectedSources === 'disco') {
      sourceQueries.push(
        analysisWriter
          .from('products')
          .select('id,name,image,source,source_product_id,source_sku,ean,category_id,subcategory_id,brands(name),categories(name),subcategories(name),offers(supermarket,cash_price)')
          .eq('source', 'disco')
          .order('id', { ascending: true }),
      )
    }

    const productResults = await Promise.all(sourceQueries)
    const includesMami = selectedSources === 'all' || selectedSources === 'mami'
    const includesDisco = selectedSources === 'all' || selectedSources === 'disco'

    const mamiProducts = includesMami ? (productResults[0]?.data || []) : []
    const discoProducts = includesDisco ? (productResults[includesMami ? 1 : 0]?.data || []) : []

    const report = auditCrossSourceProducts(mamiProducts, discoProducts)
    const reviewDecisions = await listReviewDecisions()
    const decisionMap = Object.fromEntries(reviewDecisions.map((entry) => [entry.pairKey, entry]))
    const enrichedPairs = (report.pairs || []).map((pair) => {
      const leftId = pair.products?.mami?.id ?? null
      const rightId = pair.products?.disco?.id ?? null
      const key = normalizePairKey({ mamiProductId: leftId, discoProductId: rightId })
      const reviewDecision = decisionMap[key]
      return {
        ...pair,
        reviewDecision: reviewDecision || null,
        decisionStatus: reviewDecision?.status || pair.status || 'revisión',
      }
    })

    res.json({
      source: selectedSources,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      writeSafety: {
        ...report.writeSafety,
        databaseWrites: false,
        mutationSurface: 'read_only_cross_source_audit',
        reason: 'This endpoint only reads products and compares them in memory; it never inserts or updates rows.',
      },
      summary: report.summary,
      examples: report.examples,
      pairs: enrichedPairs.filter((pair) => !pair.reviewDecision),
    })
  } catch (error) {
    console.error('Error generating cross-source audit', error)
    res.status(500).json({ error: 'Error generating cross-source audit', detail: error.message || 'Unknown error' })
  }
})

app.get('/review/cross-source-decisions', requireAdmin, async (req, res) => {
  const decisions = await listReviewDecisions()
  res.json({
    source: 'cross_source',
    decisions,
    count: decisions.length,
    summary: summarizeReviewDecisions(decisions),
  })
})

app.post('/review/cross-source-decisions', requireAdmin, async (req, res) => {
  try {
    const { pairKey, mamiProductId, discoProductId, status, reasonCodes = [], confidence, evidence = {} } = req.body || {}
    if (!pairKey && !(mamiProductId || discoProductId)) {
      return res.status(400).json({ error: 'pairKey or product IDs are required' })
    }
    const normalizedStatus = ['match', 'no_match', 'revisión'].includes(status) ? status : 'revisión'
    const saved = await upsertReviewDecision({
      pairKey,
      mamiProductId,
      discoProductId,
      status: normalizedStatus,
      reasonCodes,
      confidence,
      evidence,
      admin: req.admin,
    })
    invalidateCatalogPageCache()
    res.status(201).json({ success: true, decision: saved })
  } catch (error) {
    console.error('Error saving review decision', error)
    res.status(500).json({ error: 'Error saving review decision', detail: error.message || 'Unknown error' })
  }
})

app.delete('/review/cross-source-decisions', requireAdmin, async (req, res) => {
  await clearReviewDecisions()
  invalidateCatalogPageCache()
  res.json({ success: true, cleared: true, count: 0 })
})

app.post('/upload-csv', requireAdmin, (req, res) => {
  res.json({ success: true })
})

app.get('/categories', async (req, res) => {
  try {
    const { data, error } = await analysisWriter.from('categories').select('id, name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch {
    res.status(500).json([])
  }
})

app.post('/categories', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ error: 'Category name is required' })
    const { data, error } = await supabase.from('categories').insert({ name }).select().single()
    if (error) {
      console.error('Error creating category', error)
      return res.status(500).json({ error: 'Error creating category' })
    }
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {}
    const { id } = req.params
    if (!name) return res.status(400).json({ error: 'Category name is required' })
    const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select().single()
    if (error) {
      console.error('Error updating category', error)
      return res.status(500).json({ error: 'Error updating category' })
    }
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { count: productCount, error: productsError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
    if (productsError) {
      console.error('Error checking category products', productsError)
      return res.status(500).json({ error: 'No se pudo comprobar si la categoría tiene productos' })
    }
    if (productCount > 0) {
      return res.status(409).json({ error: 'No se puede eliminar: la categoría tiene productos asociados' })
    }
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      console.error('Error deleting category', error)
      return res.status(500).json({ error: error.message || 'Error deleting category' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/subcategories', requireAdmin, async (req, res) => {
  try {
    const { name, category_id } = req.body || {}
    if (!name?.trim() || !category_id) return res.status(400).json({ error: 'Subcategory name and category are required' })
    const { data, error } = await supabase.from('subcategories').insert({ name: name.trim(), category_id }).select().single()
    if (error) {
      console.error('Error creating subcategory', error)
      return res.status(500).json({ error: 'Error creating subcategory' })
    }
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/subcategories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, category_id } = req.body || {}
    if (!name?.trim() || !category_id) return res.status(400).json({ error: 'Subcategory name and category are required' })
    const { data, error } = await supabase.from('subcategories').update({ name: name.trim(), category_id }).eq('id', req.params.id).select().single()
    if (error) {
      console.error('Error updating subcategory', error)
      return res.status(500).json({ error: 'Error updating subcategory' })
    }
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/subcategories/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('subcategories').delete().eq('id', req.params.id)
    if (error) {
      console.error('Error deleting subcategory', error)
      return res.status(500).json({ error: 'Error deleting subcategory' })
    }
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/brands', async (req, res) => {
  try {
    const { data, error } = await analysisWriter.from('brands').select('id, name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch {
    res.status(500).json([])
  }
})

app.post('/brands', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {}
    const normalizedName = normalizeBrandName(name)
    if (!normalizedName) return res.status(400).json({ error: 'Brand name is required' })

    const { data: existingBrands, error: listError } = await supabase.from('brands').select('id, name')
    if (listError) {
      console.error('Error reading brands', listError)
      return res.status(500).json({ error: 'Error reading brands' })
    }

    const existing = (existingBrands || []).find((brand) => normalizeBrandName(brand.name) === normalizedName)
    if (existing) {
      return res.json(existing)
    }

    const { data, error } = await supabase.from('brands').insert({ name: normalizedName }).select().single()
    if (error) {
      console.error('Error creating brand', error)
      return res.status(500).json({ error: 'Error creating brand' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/brands/:id', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {}
    const { id } = req.params
    const normalizedName = normalizeBrandName(name)
    if (!normalizedName) return res.status(400).json({ error: 'Brand name is required' })

    const { data: existingBrands, error: listError } = await supabase.from('brands').select('id, name')
    if (listError) {
      console.error('Error reading brands', listError)
      return res.status(500).json({ error: 'Error reading brands' })
    }

    const duplicate = (existingBrands || []).find((brand) => String(brand.id) !== String(id) && normalizeBrandName(brand.name) === normalizedName)
    if (duplicate) {
      return res.status(409).json({ error: 'Ya existe una marca equivalente', duplicate })
    }

    const { data, error } = await supabase.from('brands').update({ name: normalizedName }).eq('id', id).select().single()
    if (error) {
      console.error('Error updating brand', error)
      return res.status(500).json({ error: 'Error updating brand' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/brands/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const { data: targetBrand, error: targetError } = await supabase.from('brands').select('id, name').eq('id', id).single()
    if (targetError || !targetBrand) {
      return res.status(404).json({ error: 'Brand not found' })
    }

    const normalizedTarget = normalizeBrandName(targetBrand.name)
    const { data: otherBrands, error: listError } = await supabase.from('brands').select('id, name').neq('id', id)
    if (listError) {
      console.error('Error reading brand duplicates', listError)
      return res.status(500).json({ error: 'Error reading brands' })
    }

    const replacementBrand = (otherBrands || []).find((brand) => normalizeBrandName(brand.name) === normalizedTarget)
    if (replacementBrand) {
      const { error: reassignError } = await supabase.from('products').update({ brand_id: replacementBrand.id }).eq('brand_id', id)
      if (reassignError) {
        console.error('Error reassigning products before deleting brand', reassignError)
        return res.status(500).json({ error: 'No se pudo reubicar los productos antes de borrar la marca' })
      }
    }

    const { error } = await supabase.from('brands').delete().eq('id', id)
    if (error) {
      console.error('Error deleting brand', error)
      return res.status(500).json({ error: 'Error deleting brand' })
    }

    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/supermarkets', async (req, res) => {
  try {
    const { data, error } = await analysisWriter.from('supermarkets').select('id, name, image').order('name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch {
    res.status(500).json([])
  }
})

app.post('/supermarkets', requireAdmin, async (req, res) => {
  try {
    const { name, image } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'Supermarket name is required' })
    const { data, error } = await supabase.from('supermarkets').insert({ name: name.trim(), image: image?.trim() || null }).select().single()
    if (error) {
      console.error('Error creating supermarket', error)
      return res.status(500).json({ error: 'Error creating supermarket' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/supermarkets/:id', requireAdmin, async (req, res) => {
  try {
    const { name, image } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'Supermarket name is required' })
    const { data, error } = await supabase.from('supermarkets').update({ name: name.trim(), image: image?.trim() || null }).eq('id', req.params.id).select().single()
    if (error) {
      console.error('Error updating supermarket', error)
      return res.status(500).json({ error: 'Error updating supermarket' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/supermarkets/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('supermarkets').delete().eq('id', req.params.id)
    if (error) {
      console.error('Error deleting supermarket', error)
      return res.status(500).json({ error: 'Error deleting supermarket' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/products', requireAdmin, async (req, res) => {
  try {
    const { 
      name,
      category_id,
      brand_id,
      rating,
      image,
      supermarket,
      cashPrice,
      installmentsQuantity,
      installmentPrice,
      subcategory_id,
    } = req.body || {}

    if (!name) return res.status(400).json({ error: 'Product name is required' })

    const { data: product, error: productError } = await analysisWriter
      .from('products')
      .insert({
        name,
        category_id: normalizeOptionalReference(category_id),
        brand_id: normalizeOptionalReference(brand_id),
        rating,
        image,
        subcategory_id: subcategory_id || null,
        classification_source: subcategory_id ? 'manual' : null,
        classification_confidence: subcategory_id ? 'manual' : null,
      })
      .select()
      .single()
    if (productError) {
      console.error('Error creating product', productError)
      return res.status(500).json({ error: 'Error creating product' })
    }

    let offer = null
    if (supermarket || cashPrice || installmentsQuantity || installmentPrice) {
      const normalizedCashPrice = parsePrice(cashPrice)
      const normalizedInstallmentsQuantity = parsePrice(installmentsQuantity)
      const normalizedInstallmentPrice = parsePrice(installmentPrice)
      if (cashPrice && (!normalizedCashPrice || normalizedCashPrice <= 0)) {
        await analysisWriter.from('products').delete().eq('id', product.id)
        return res.status(400).json({ error: 'El precio contado debe ser un número mayor que cero' })
      }
      const { data: newOffer, error: offerError } = await analysisWriter
        .from('offers')
        .insert({
          product_id: product.id,
          supermarket: supermarket || 'Sin supermercado',
          cash_price: normalizedCashPrice,
          installments_quantity: normalizedInstallmentsQuantity,
          installment_price: normalizedInstallmentPrice,
        })
        .select()
        .single()

      if (offerError) {
        console.error('Error creating offer', offerError)
        await analysisWriter.from('products').delete().eq('id', product.id)
        return res.status(500).json({ error: offerError.message || 'Error creating offer' })
      }
      offer = newOffer
      await recordPriceHistory({ productId: product.id, offerId: newOffer.id, cashPrice: newOffer.cash_price })
    }
    scheduleRelatedPriceStatusRefresh(product.id)

    const responsePayload = { ...product, offers: offer ? [offer] : [] }
    invalidateCatalogPageCache()
    res.json(responsePayload)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/products/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'La edición de productos requiere SUPABASE_SERVICE_ROLE_KEY configurada en el backend.' })
    }
    const { id } = req.params 
    const { name, category_id, brand_id, rating, image } = req.body || {}
    const { data: previousProduct, error: previousError } = await analysisWriter
      .from('products')
      .select('category_id, subcategory_id')
      .eq('id', id)
      .maybeSingle()
    if (previousError) throw previousError
    const { data, error } = await analysisWriter
      .from('products')
      .update({
        name,
        category_id: normalizeOptionalReference(category_id),
        brand_id: normalizeOptionalReference(brand_id),
        rating,
        image,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating product', error)
      return res.status(500).json({ error: error.message || 'Error updating product' })
    }

    invalidateCatalogPageCache()
    scheduleRelatedPriceStatusRefresh(id, true, previousProduct)
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/products/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params 
    const { data: previousProduct, error: previousError } = await analysisWriter
      .from('products')
      .select('category_id, subcategory_id')
      .eq('id', id)
      .maybeSingle()
    if (previousError) throw previousError
    const { error: offersError } = await analysisWriter.from('offers').delete().eq('product_id', id)
    if (offersError) throw offersError
    const { error } = await analysisWriter.from('products').delete().eq('id', id)
    if (error) {
      console.error('Error deleting product', error)
      return res.status(500).json({ error: 'Error deleting product' })
    }
    invalidateCatalogPageCache()
    scheduleRelatedPriceStatusRefresh(id, true, previousProduct)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/offers', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'La administración de ofertas requiere SUPABASE_SERVICE_ROLE_KEY configurada en el backend.' })
    }
    const { 
      product_id,
      supermarket,
      cash_price,
      installments_quantity,
      installment_price,
      skipPriceChangeRecording = false,
    } = req.body || {}

    if (!product_id) return res.status(400).json({ error: 'product_id is required' })

    const normalizedCashPrice = normalizeNumericValue(cash_price)
    const normalizedInstallmentsQuantity = normalizeNumericValue(installments_quantity)
    const normalizedInstallmentPrice = normalizeNumericValue(installment_price)

    const { data, error } = await analysisWriter
      .from('offers')
      .insert({
        product_id,
        supermarket: supermarket || 'Sin supermercado',
        cash_price: normalizedCashPrice,
        installments_quantity: normalizedInstallmentsQuantity,
        installment_price: normalizedInstallmentPrice,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating offer', error)
      return res.status(500).json({ error: error.message || 'Error creating offer' })
    }

    if (!skipPriceChangeRecording) {
      await recordPriceHistory({ productId: data.product_id, offerId: data.id, cashPrice: data.cash_price })
    }

    invalidateCatalogPageCache()
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/offers/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'La administración de ofertas requiere SUPABASE_SERVICE_ROLE_KEY configurada en el backend.' })
    }
    const { id } = req.params 
    const {
      supermarket,
      cash_price,
      installments_quantity,
      installment_price,
      skipPriceChangeRecording = false,
    } = req.body || {}

    const normalizedCashPrice = normalizeNumericValue(cash_price)
    const normalizedInstallmentsQuantity = normalizeNumericValue(installments_quantity)
    const normalizedInstallmentPrice = normalizeNumericValue(installment_price)

    const { data: previousOffer, error: previousError } = await analysisWriter
      .from('offers')
      .select('id, product_id, cash_price, supermarket')
      .eq('id', id)
      .single()
    if (previousError) return res.status(404).json({ error: 'Oferta no encontrada' })

    const { data, error } = await analysisWriter
      .from('offers')
      .update({
        supermarket,
        cash_price: normalizedCashPrice,
        installments_quantity: normalizedInstallmentsQuantity,
        installment_price: normalizedInstallmentPrice,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating offer', error)
      return res.status(500).json({ error: error.message || 'Error updating offer' })
    }

    const previousPrice = Number(previousOffer.cash_price)
    const updatedPrice = Number(data.cash_price)
    const priceChanged = !sameMoneyValue(previousOffer.cash_price, data.cash_price)

    if (!skipPriceChangeRecording && priceChanged) {
      await recordPriceHistory({ productId: data.product_id, offerId: data.id, cashPrice: data.cash_price, source: 'admin_edit' })
      const percentage = previousPrice > 0 && updatedPrice > 0
        ? ((updatedPrice - previousPrice) / previousPrice) * 100
        : 0
      const { error: logError } = await analysisWriter.from('price_update_log').insert({
        admin_username: req.admin,
        filters: { productId: data.product_id, offerId: data.id, supermarket: data.supermarket || previousOffer.supermarket || null, source: 'admin_edit' },
        percentage,
        products_updated: 1,
        changes: [{
          offerId: data.id,
          productId: data.product_id,
          previousCashPrice: previousPrice,
          updatedCashPrice: updatedPrice,
        }],
      })
      if (logError) return res.status(500).json({ error: 'Precio actualizado, pero no se pudo registrar la actualización' })
    } else if (skipPriceChangeRecording && priceChanged) {
      scheduleRelatedPriceStatusRefresh(data.product_id)
    }

    invalidateCatalogPageCache()
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/offers/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'La administración de ofertas requiere SUPABASE_SERVICE_ROLE_KEY configurada en el backend.' })
    }
    const { id } = req.params 
    const { data: offer, error: offerError } = await analysisWriter.from('offers').select('product_id').eq('id', id).maybeSingle()
    if (offerError) throw offerError
    const { error } = await analysisWriter.from('offers').delete().eq('id', id)
    if (error) {
      console.error('Error deleting offer', error)
      return res.status(500).json({ error: error.message || 'Error deleting offer' })
    }
    invalidateCatalogPageCache()
    if (offer?.product_id) scheduleRelatedPriceStatusRefresh(offer.product_id)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/admins', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase.from('admins').select('id, username')
    if (error) {
      console.error('Error fetching admins', error)
      return res.status(500).json([])
    }
    res.json(data || [])
  } catch (e) {
    console.error(e)
    res.status(500).json([])
  }
})

app.get('/admin/price-history', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_history')
      .select('id, product_id, offer_id, observed_at, cash_price, source')
      .order('observed_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Error fetching price history', error)
      return res.status(500).json({ error: 'Error fetching price history' })
    }

    const productIds = [...new Set((data || []).map((entry) => entry.product_id).filter(Boolean))]
    const offerIds = [...new Set((data || []).map((entry) => entry.offer_id).filter(Boolean))]
    const [{ data: products }, { data: offers }] = await Promise.all([
      productIds.length ? supabase.from('products').select('id, name').in('id', productIds) : { data: [] },
      offerIds.length ? supabase.from('offers').select('id, supermarket').in('id', offerIds) : { data: [] },
    ])
    const productsById = new Map((products || []).map((product) => [String(product.id), product]))
    const offersById = new Map((offers || []).map((offer) => [String(offer.id), offer]))

    res.json((data || []).map((entry) => ({
      ...entry,
      product_name: productsById.get(String(entry.product_id))?.name || 'Producto eliminado',
      supermarket: offersById.get(String(entry.offer_id))?.supermarket || 'Sin supermercado',
    })))
  } catch (error) {
    console.error('Error fetching price history', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/admin/price-updates', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await analysisWriter
      .from('price_update_log')
      .select('id, updated_at, admin_username, filters, percentage, products_updated, changes')
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) return res.status(500).json({ error: 'Error fetching price updates' })
    res.json(data || [])
  } catch (error) {
    console.error('Error fetching price updates', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/admin/price-updates/:id', requireAdmin, async (req, res) => {
  try {
    const { data: update, error: fetchError } = await analysisWriter
      .from('price_update_log')
      .select('id, changes')
      .eq('id', req.params.id)
      .single()
    if (fetchError) return res.status(fetchError.code === 'PGRST116' ? 404 : 500).json({ error: 'Error fetching price update' })

    const changes = Array.isArray(update.changes) ? update.changes : []
    if (!changes.length) {
      const { error: deleteEmptyError } = await analysisWriter.from('price_update_log').delete().eq('id', req.params.id)
      if (deleteEmptyError) return res.status(500).json({ error: 'Error deleting price update' })
      return res.json({ success: true, restored: 0 })
    }

    for (const change of changes) {
      const { error: restoreError } = await analysisWriter
        .from('offers')
        .update({ cash_price: change.previousCashPrice })
        .eq('id', change.offerId)
      if (restoreError) {
        console.error('Error restoring offer', change.offerId, restoreError)
        return res.status(500).json({ error: 'The operation could not be fully reverted' })
      }
      await recordPriceHistory({
        productId: change.productId,
        offerId: change.offerId,
        cashPrice: change.previousCashPrice,
        source: 'bulk_admin_revert',
      })
    }

    const { error } = await analysisWriter.from('price_update_log').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: 'Prices restored, but the operation could not be deleted' })
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting price update', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/admins', requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
    const existing = await supabase.from('admins').select('id').eq('username', username).single()
    if (existing.error && existing.error.code !== 'PGRST116') {
      console.error('Error checking admin', existing.error)
      return res.status(500).json({ error: 'Error checking admin' })
    }
    if (existing.data) return res.status(400).json({ error: 'Admin already exists' })
    const passwordHash = await bcrypt.hash(password, 12)
    const { data, error } = await supabase.from('admins').insert({ username, password: passwordHash }).select('id, username').single()
    if (error) {
      console.error('Error creating admin', error)
      return res.status(500).json({ error: 'Error creating admin' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
    const normalizedUsername = String(username).trim()
    let adminProfile = null
    if (supabaseAdmin) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('customer_profiles')
        .select('user_id, username, email, role')
        .eq('username', normalizedUsername.toLowerCase())
        .maybeSingle()
      if (profileError) {
        console.error('Error checking registered admin account', profileError)
        return res.status(500).json({ error: 'Unable to verify admin credentials' })
      }
      adminProfile = profile
    }

    let authenticatedAdmin = ''
    if (adminProfile) {
      if (adminProfile.role !== 'administrator') {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      const { data: authData, error: authError } = await createCustomerAuthClient().auth.signInWithPassword({
        email: adminProfile.email,
        password,
      })
      if (authError || !authData.session) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      authenticatedAdmin = adminProfile.username
    } else {
      const { data, error } = await supabase.from('admins').select('username, password').eq('username', normalizedUsername).maybeSingle()
      if (error) {
        console.error('Error looking up admin during login', error)
        return res.status(500).json({ error: 'Unable to verify admin credentials' })
      }
      const isEmptyAdminTable = !data
      const isLocalDefaultLogin = process.env.NODE_ENV !== 'production'
        && isEmptyAdminTable
        && normalizedUsername === (process.env.ADMIN_DEV_USERNAME || 'admin')
        && password === (process.env.ADMIN_DEV_PASSWORD || '1234')
      authenticatedAdmin = data?.username || (isLocalDefaultLogin ? normalizedUsername : '')
      if (data) {
        const isBcryptHash = data.password?.startsWith('$2')
        const validPassword = isBcryptHash
          ? await bcrypt.compare(password, data.password)
          : data.password === password
        if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' })
        if (!isBcryptHash) {
          await supabase.from('admins').update({ password: await bcrypt.hash(password, 12) }).eq('username', normalizedUsername)
        }
      } else if (!isLocalDefaultLogin) {
        if (!supabaseAdmin) {
          return res.status(503).json({ error: 'Admin account login requires SUPABASE_SERVICE_ROLE_KEY' })
        }
        return res.status(401).json({ error: 'Invalid credentials' })
      }
    }
    const token = createAdminToken(authenticatedAdmin)
    if (!token) return res.status(503).json({ error: 'ADMIN_SESSION_SECRET is not configured' })
    res.json({ success: true, token })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function createCustomerAuthClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: {
      // Recovery emails are issued by the backend, so a PKCE verifier cannot be
      // persisted in the browser that later opens the email link.
      flowType: 'implicit',
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function getCustomerProfile(user) {
  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .select('username, email, role, supermarket_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw error
  return data || {
    username: user.user_metadata?.username || '',
    email: user.email || '',
    role: 'customer',
  }
}

function sendCustomerAuthUnavailable(res, error) {
  console.error('Customer auth profile error', error)
  return res.status(503).json({ error: 'La autenticación de clientes no está lista. Aplica la migración de perfiles en Supabase.' })
}

function requireCustomerAuthStorage(res) {
  if (supabaseAdmin) return true
  res.status(503).json({ error: 'La autenticación de clientes requiere SUPABASE_SERVICE_ROLE_KEY configurada en el backend.' })
  return false
}

function getPasswordRecoveryRedirectUrl(accountType) {
  const frontendUrl = getFrontendUrl()
  const redirectUrl = new URL('/restablecer-contrasena', frontendUrl)
  redirectUrl.searchParams.set('account', accountType)
  return redirectUrl.toString()
}

app.post('/auth/customer-password-reset', customerPasswordResetIpRateLimit, async (req, res) => {
  try {
    if (!requireCustomerAuthStorage(res)) return
    const identifier = String(req.body?.identifier || '').trim()
    if (!identifier) return res.status(400).json({ error: 'Ingresa tu correo o nombre de usuario.' })

    let email = identifier.toLowerCase()
    if (!email.includes('@')) {
      const { data: profile, error } = await supabaseAdmin
        .from('customer_profiles')
        .select('email')
        .eq('username', email)
        .maybeSingle()
      if (error) {
        console.error('Customer password recovery lookup failed', error)
        return res.status(500).json({ error: 'No se pudo procesar la solicitud.' })
      }
      email = profile?.email || ''
    }
    if (email) {
      const redirectTo = getPasswordRecoveryRedirectUrl('customer')
      const { error } = await createCustomerAuthClient().auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : {})
      if (error) {
        console.error('Customer password recovery email failed', error)
        const failure = getPasswordRecoveryFailure(error)
        return res.status(failure.status).json({ error: failure.message })
      }
    }
    res.json({ message: 'Si existe una cuenta asociada, recibirás un correo con instrucciones para recuperar tu contraseña.' })
  } catch (error) {
    console.error('Customer password recovery failed', error)
    res.status(500).json({ error: 'No se pudo procesar la solicitud.' })
  }
})

app.post('/auth/admin-password-reset', customerPasswordResetIpRateLimit, async (req, res) => {
  try {
    if (!requireCustomerAuthStorage(res)) return
    const email = String(req.body?.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'Ingresa el correo asociado a la cuenta administradora.' })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('customer_profiles')
      .select('email')
      .eq('email', email)
      .eq('role', 'administrator')
      .maybeSingle()
    if (profileError) {
      console.error('Admin password recovery lookup failed', profileError)
      return res.status(500).json({ error: 'No se pudo procesar la solicitud.' })
    }

    if (profile?.email) {
      const redirectTo = getPasswordRecoveryRedirectUrl('admin')
      const { error } = await createCustomerAuthClient().auth.resetPasswordForEmail(profile.email, redirectTo ? { redirectTo } : {})
      if (error) {
        console.error('Admin password recovery email failed', error)
        const failure = getPasswordRecoveryFailure(error)
        return res.status(failure.status).json({ error: failure.message })
      }
    }
    res.json({ message: 'Si el correo corresponde a una cuenta administradora, recibirás un mensaje con instrucciones.' })
  } catch (error) {
    console.error('Admin password recovery failed', error)
    res.status(500).json({ error: 'No se pudo procesar la solicitud.' })
  }
})

app.post('/auth/password-update', customerPasswordResetIpRateLimit, async (req, res) => {
  try {
    if (!requireCustomerAuthStorage(res)) return
    const accessToken = String(req.body?.accessToken || '')
    const tokenHash = String(req.body?.tokenHash || '')
    const password = String(req.body?.password || '')
    if (!accessToken && !tokenHash) return res.status(400).json({ error: 'El enlace de recuperación no es válido.' })
    if (!/^[a-zA-Z0-9]{4,}$/.test(password)) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres alfanuméricos.' })
    }

    const authClient = createCustomerAuthClient()
    const { data: authData, error: authError } = accessToken
      ? await authClient.auth.getUser(accessToken)
      : await authClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (authError || !authData.user) return res.status(401).json({ error: 'El enlace venció o ya no es válido. Solicita uno nuevo.' })

    const { error } = await supabaseAdmin.auth.admin.updateUserById(authData.user.id, { password })
    if (error) {
      console.error('Password update failed', error)
      return res.status(503).json({ error: 'No se pudo actualizar la contraseña.' })
    }
    res.json({ success: true })
  } catch (error) {
    console.error('Password update failed', error)
    res.status(500).json({ error: 'No se pudo actualizar la contraseña.' })
  }
})

app.post('/auth/customer-register', async (req, res) => {
  try {
    if (!requireCustomerAuthStorage(res)) return
    const username = String(req.body?.username || '').trim().toLowerCase()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!/^[a-z0-9]{6,32}$/.test(username)) {
      return res.status(400).json({ error: 'El usuario debe tener entre 6 y 32 caracteres alfanuméricos.' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' })
    }
    if (!/^[a-zA-Z0-9]{8,}$/.test(password)) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres alfanuméricos.' })
    }

    let existingProfile
    try {
      const result = await supabaseAdmin
        .from('customer_profiles')
        .select('user_id')
        .eq('username', username)
        .maybeSingle()
      if (result.error) return sendCustomerAuthUnavailable(res, result.error)
      existingProfile = result.data
    } catch (error) {
      return sendCustomerAuthUnavailable(res, error)
    }
    if (existingProfile) return res.status(409).json({ error: 'Este usuario ya se encuentra registrado.' })

    const authClient = createCustomerAuthClient()
    const emailRedirectTo = getCustomerConfirmationRedirectUrl()
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo,
      },
    })
    if (error) {
      const normalizedMessage = String(error.message || '').toLowerCase()
      if (
        ['email_exists', 'user_already_exists'].includes(error.code)
        || normalizedMessage.includes('already registered')
        || normalizedMessage.includes('already been registered')
        || normalizedMessage.includes('already exists')
      ) {
        return res.status(409).json({ error: 'Este correo ya se encuentra registrado.' })
      }
      if (normalizedMessage.includes('database error saving new user')) {
        return res.status(503).json({ error: 'No se pudo crear el perfil. Verifica la migración de perfiles en Supabase.' })
      }
      return res.status(400).json({ error: error.message || 'No se pudo crear la cuenta.' })
    }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return res.status(409).json({ error: 'Este correo ya se encuentra registrado.' })
    }

    res.status(201).json({
      session: data.session,
      user: data.user,
      confirmationRequired: !data.session,
    })
  } catch (error) {
    console.error('Customer registration failed', error)
    res.status(500).json({ error: 'No se pudo completar el registro.' })
  }
})

app.post('/auth/customer-login', async (req, res) => {
  try {
    if (!requireCustomerAuthStorage(res)) return
    const identifier = String(req.body?.identifier || '').trim()
    const password = String(req.body?.password || '')
    if (!identifier || !password) return res.status(400).json({ error: 'Ingresa tus credenciales.' })

    let email = identifier
    if (!identifier.includes('@')) {
      if (!/^[a-zA-Z0-9]{1,32}$/.test(identifier)) {
        return res.status(401).json({ error: 'Credenciales inválidas.' })
      }
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('customer_profiles')
        .select('email')
        .eq('username', identifier.toLowerCase())
        .maybeSingle()
      if (profileError) {
        return sendCustomerAuthUnavailable(res, profileError)
      }
      if (!profile?.email) return res.status(401).json({ error: 'Credenciales inválidas.' })
      email = profile.email
    }

    const authClient = createCustomerAuthClient()
    const { data, error } = await authClient.auth.signInWithPassword({ email, password })
    if (error || !data.session) return res.status(401).json({ error: 'Credenciales inválidas.' })
    res.json({ session: data.session, profile: await getCustomerProfile(data.user) })
  } catch (error) {
    console.error('Customer login failed', error)
    return sendCustomerAuthUnavailable(res, error)
  }
})

app.post('/auth/customer-refresh', async (req, res) => {
  try {
    if (!requireCustomerAuthStorage(res)) return
    const refreshToken = String(req.body?.refreshToken || '')
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' })
    const { data, error } = await createCustomerAuthClient().auth.refreshSession({ refresh_token: refreshToken })
    if (error || !data.session) return res.status(401).json({ error: 'La sesión expiró. Inicia sesión nuevamente.' })
    res.json({ session: data.session, profile: await getCustomerProfile(data.user) })
  } catch (error) {
    return sendCustomerAuthUnavailable(res, error)
  }
})

app.get('/auth/customer-session', async (req, res) => {
  try {
    if (!requireCustomerAuthStorage(res)) return
    const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!accessToken) return res.status(401).json({ error: 'Authentication required' })
    const { data, error } = await createCustomerAuthClient().auth.getUser(accessToken)
    if (error || !data.user) return res.status(401).json({ error: 'Invalid session' })
    res.json({ user: data.user, profile: await getCustomerProfile(data.user) })
  } catch (error) {
    return sendCustomerAuthUnavailable(res, error)
  }
})

async function requireCustomerAuth(req, res, next) {
  const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!accessToken) return res.status(401).json({ error: 'Inicia sesión para continuar.' })

  try {
    const { data, error } = await createCustomerAuthClient().auth.getUser(accessToken)
    if (error || !data.user) return res.status(401).json({ error: 'La sesión no es válida. Inicia sesión nuevamente.' })
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({ error: 'Las operaciones de cuenta requieren configuración privada del servidor.' })
    }
    req.customerUser = data.user
    return next()
  } catch (error) {
    console.error('Customer authentication failed', error)
    return res.status(503).json({ error: 'No se pudo verificar la sesión. Inténtalo nuevamente.' })
  }
}

app.post('/auth/admin-session', requireCustomerAuth, async (req, res) => {
  try {
    const profile = await getCustomerProfile(req.customerUser)
    if (profile.role !== 'administrator') {
      return res.status(403).json({ error: 'Esta cuenta no tiene permisos de administrador.' })
    }
    const username = String(profile.username || '').trim()
    if (!username) {
      return res.status(403).json({ error: 'No se pudo validar el usuario administrador.' })
    }
    const token = createAdminToken(username)
    if (!token) {
      return res.status(503).json({ error: 'La sesión administrativa no está configurada en el servidor.' })
    }
    return res.json({ token, username })
  } catch (error) {
    console.error('Admin session creation failed', error)
    return sendCustomerAuthUnavailable(res, error)
  }
})

app.get('/customer/users', requireCustomerAuth, async (req, res) => {
  try {
    const { data: profiles, error: profilesError } = await analysisWriter
      .from('customer_profiles')
      .select('user_id, username, role')
    if (profilesError) throw profilesError

    const customers = (profiles || [])
      .filter((profile) => profile.role === 'customer' && profile.user_id !== req.customerUser.id)
      .map((profile) => ({ userId: profile.user_id, username: profile.username }))
      .sort((first, second) => first.username.localeCompare(second.username))
    return res.json(customers)
  } catch (error) {
    console.error('Customer user search failed', error)
    return res.status(503).json({ error: 'No se pudieron buscar usuarios.' })
  }
})

app.get('/customer/notifications', requireCustomerAuth, async (req, res) => {
  try {
    const { data: invitations, error: invitationsError } = await analysisWriter
      .from('shared_shopping_list_invitations')
      .select('id, list_id, inviter_user_id, created_at')
      .eq('invitee_user_id', req.customerUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (invitationsError) throw invitationsError
    if (!invitations?.length) return res.json([])

    const listIds = [...new Set(invitations.map((invitation) => invitation.list_id))]
    const inviterIds = [...new Set(invitations.map((invitation) => invitation.inviter_user_id))]
    const [{ data: lists, error: listsError }, { data: profiles, error: profilesError }] = await Promise.all([
      analysisWriter.from('shared_shopping_lists').select('id, name').in('id', listIds),
      analysisWriter.from('customer_profiles').select('user_id, username').in('user_id', inviterIds),
    ])
    if (listsError) throw listsError
    if (profilesError) throw profilesError

    const listNames = new Map((lists || []).map((list) => [list.id, list.name]))
    const usernames = new Map((profiles || []).map((profile) => [profile.user_id, profile.username]))
    return res.json(invitations.map((invitation) => ({
      id: invitation.id,
      listId: invitation.list_id,
      listName: listNames.get(invitation.list_id) || 'Lista compartida',
      inviterUsername: usernames.get(invitation.inviter_user_id) || 'Usuario',
      createdAt: invitation.created_at,
    })))
  } catch (error) {
    console.error('Customer notifications fetch failed', error)
    return res.status(503).json({ error: 'No se pudieron cargar las notificaciones.' })
  }
})

app.post('/customer/notifications/:notificationId/accept', requireCustomerAuth, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.notificationId)) {
    return res.status(400).json({ error: 'La invitación no es válida.' })
  }

  try {
    const { data: invitation, error: invitationError } = await analysisWriter
      .from('shared_shopping_list_invitations')
      .select('id, list_id, status')
      .eq('id', req.params.notificationId)
      .eq('invitee_user_id', req.customerUser.id)
      .maybeSingle()
    if (invitationError) throw invitationError
    if (!invitation || invitation.status === 'declined') {
      return res.status(404).json({ error: 'La invitación ya no está disponible.' })
    }

    if (invitation.status === 'pending') {
      const { data: acceptedInvitation, error: acceptanceError } = await analysisWriter
        .from('shared_shopping_list_invitations')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', invitation.id)
        .eq('invitee_user_id', req.customerUser.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
      if (acceptanceError) throw acceptanceError
      if (!acceptedInvitation) {
        const { data: currentInvitation, error: verificationError } = await analysisWriter
          .from('shared_shopping_list_invitations')
          .select('status')
          .eq('id', invitation.id)
          .eq('invitee_user_id', req.customerUser.id)
          .maybeSingle()
        if (verificationError) throw verificationError
        if (currentInvitation?.status !== 'accepted') {
          return res.status(404).json({ error: 'La invitación ya no está disponible.' })
        }
      }
    }

    const { error: membershipError } = await analysisWriter
      .from('shared_shopping_list_members')
      .upsert(
        { list_id: invitation.list_id, user_id: req.customerUser.id, role: 'member' },
        { onConflict: 'list_id,user_id', ignoreDuplicates: true },
      )
    if (membershipError) throw membershipError

    const { data: list, error: listError } = await analysisWriter
      .from('shared_shopping_lists')
      .select('id, name')
      .eq('id', invitation.list_id)
      .maybeSingle()
    if (listError) throw listError
    if (!list) {
      return res.status(404).json({ error: 'La lista compartida ya no está disponible.' })
    }
    return res.json(list)
  } catch (error) {
    console.error('Shared-list invitation acceptance failed', error)
    return res.status(503).json({ error: 'No se pudo aceptar la invitación. Inténtalo nuevamente.' })
  }
})

app.post('/customer/notifications/:notificationId/decline', requireCustomerAuth, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.notificationId)) {
    return res.status(400).json({ error: 'La invitación no es válida.' })
  }

  try {
    const { data, error } = await analysisWriter
      .from('shared_shopping_list_invitations')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', req.params.notificationId)
      .eq('invitee_user_id', req.customerUser.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'La invitación ya no está disponible.' })
    return res.json({ success: true })
  } catch (error) {
    console.error('Shared-list invitation decline failed', error)
    return res.status(503).json({ error: 'No se pudo rechazar la invitación. Inténtalo nuevamente.' })
  }
})

app.get('/customer/favorites', requireCustomerAuth, async (req, res) => {
  try {
    const { data, error } = await analysisWriter
      .from('customer_favorites')
      .select('product_id')
      .eq('user_id', req.customerUser.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return res.json({ ids: (data || []).map((favorite) => String(favorite.product_id)) })
  } catch (error) {
    console.error('Customer favorites fetch failed', error)
    return res.status(503).json({ error: 'No se pudieron cargar los favoritos. Verifica que la migración de favoritos esté aplicada en Supabase.' })
  }
})

app.post('/customer/price-reports', customerPriceReportIpRateLimit, requireCustomerAuth, async (req, res) => {
  const reportType = String(req.body?.reportType || '')
  const productName = String(req.body?.productName || '').trim()
  const storeName = String(req.body?.storeName || '').trim()
  const reportedPrice = Number(req.body?.reportedPrice)
  const city = String(req.body?.city || '').trim()
  const comments = String(req.body?.comments || '').trim()
  const validReportTypes = new Set(['oferta', 'sobreprecio', 'actualizacion'])

  if (!validReportTypes.has(reportType)) {
    return res.status(400).json({ error: 'Selecciona un tipo de reporte válido.' })
  }
  if (!productName || productName.length > 160) {
    return res.status(400).json({ error: 'El producto debe tener entre 1 y 160 caracteres.' })
  }
  if (!storeName || storeName.length > 120) {
    return res.status(400).json({ error: 'El comercio debe tener entre 1 y 120 caracteres.' })
  }
  if (!Number.isFinite(reportedPrice) || reportedPrice <= 0 || reportedPrice > 1000000000) {
    return res.status(400).json({ error: 'Ingresa un precio válido mayor que cero.' })
  }
  if (!city || city.length > 100 || comments.length > 1000) {
    return res.status(400).json({ error: 'La localidad o los detalles adicionales no son válidos.' })
  }

  try {
    const profile = await getCustomerProfile(req.customerUser)
    const reporterUsername = String(profile.username || req.customerUser.user_metadata?.username || '').trim()
    const reporterEmail = String(profile.email || req.customerUser.email || '').trim()
    const { data, error } = await supabaseAdmin
      .from('price_reports')
      .insert({
        reporter_user_id: req.customerUser.id,
        reporter_username: reporterUsername || reporterEmail || 'Usuario',
        reporter_email: reporterEmail,
        report_type: reportType,
        product_name: productName,
        store_name: storeName,
        reported_price: reportedPrice,
        city,
        comments,
      })
      .select('id, created_at')
      .single()
    if (error) throw error
    return res.status(201).json({ report: data })
  } catch (error) {
    console.error('Price report submission failed', error)
    return res.status(503).json({ error: 'No se pudo guardar el reporte. Verifica que la migración de reportes esté aplicada.' })
  }
})

app.get('/admin/price-reports', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'La consulta de reportes requiere SUPABASE_SERVICE_ROLE_KEY.' })
  }

  try {
    const { data, count, error } = await supabaseAdmin
      .from('price_reports')
      .select('id, reporter_user_id, reporter_username, reporter_email, report_type, product_name, store_name, reported_price, city, comments, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw error
    return res.json({ reports: data || [], totalCount: count || 0 })
  } catch (error) {
    console.error('Admin price reports fetch failed', error)
    return res.status(503).json({ error: 'No se pudieron cargar los reportes. Verifica que la migración de reportes esté aplicada.' })
  }
})

app.post('/customer/favorites', requireCustomerAuth, async (req, res) => {
  const productId = String(req.body?.productId || '')
  if (!/^[1-9]\d*$/.test(productId)) {
    return res.status(400).json({ error: 'El identificador del producto no es válido.' })
  }

  try {
    const { error } = await analysisWriter
      .from('customer_favorites')
      .upsert(
        { user_id: req.customerUser.id, product_id: productId },
        { onConflict: 'user_id,product_id', ignoreDuplicates: true },
      )
    if (error) throw error
    return res.status(201).json({ success: true })
  } catch (error) {
    console.error('Customer favorite save failed', error)
    return res.status(503).json({ error: 'No se pudo guardar el favorito. Verifica que la migración de favoritos esté aplicada en Supabase.' })
  }
})

app.delete('/customer/favorites/:productId', requireCustomerAuth, async (req, res) => {
  const productId = String(req.params.productId || '')
  if (!/^[1-9]\d*$/.test(productId)) {
    return res.status(400).json({ error: 'El identificador del producto no es válido.' })
  }

  try {
    const { error } = await analysisWriter
      .from('customer_favorites')
      .delete()
      .eq('user_id', req.customerUser.id)
      .eq('product_id', productId)
    if (error) throw error
    return res.json({ success: true })
  } catch (error) {
    console.error('Customer favorite removal failed', error)
    return res.status(503).json({ error: 'No se pudo quitar el favorito. Verifica que la migración de favoritos esté aplicada en Supabase.' })
  }
})

async function requireBusinessStore(req, res, next) {
  try {
    const { data: profile, error: profileError } = await analysisWriter
      .from('customer_profiles')
      .select('role, supermarket_id')
      .eq('user_id', req.customerUser.id)
      .maybeSingle()
    if (profileError) throw profileError
    if (!['business', 'administrator'].includes(profile?.role)) {
      return res.status(403).json({ error: 'Esta función está disponible solo para cuentas comerciales.' })
    }
    const adminStoreId = String(req.headers['x-admin-store-id'] || '')
    const selectedStoreId = profile.role === 'administrator' ? adminStoreId : profile.supermarket_id
    if (profile.role === 'administrator' && !selectedStoreId) {
      return res.status(400).json({ error: 'Selecciona un supermercado para gestionar.' })
    }
    if (!selectedStoreId) {
      return res.status(409).json({ error: 'Tu cuenta comercial todavía no tiene un supermercado asignado. Contacta a administración.' })
    }

    const { data: store, error: storeError } = await analysisWriter
      .from('supermarkets')
      .select('id, name')
      .eq('id', selectedStoreId)
      .maybeSingle()
    if (storeError) throw storeError
    if (!store) {
      return res.status(409).json({ error: 'El supermercado asignado ya no está disponible. Contacta a administración.' })
    }

    req.businessStore = store
    return next()
  } catch (error) {
    console.error('Business catalog authorization failed', error)
    return res.status(503).json({ error: 'No se pudo verificar la asignación comercial.' })
  }
}

app.get('/business/stores', requireCustomerAuth, async (req, res) => {
  try {
    const profile = await getCustomerProfile(req.customerUser)
    if (profile.role !== 'administrator') {
      return res.status(403).json({ error: 'Solo las cuentas administradoras pueden elegir un supermercado.' })
    }
    const { data, error } = await analysisWriter
      .from('supermarkets')
      .select('id, name')
      .order('name', { ascending: true })
    if (error) throw error
    return res.json({ stores: data || [] })
  } catch (error) {
    console.error('Business store options could not be loaded', error)
    return res.status(503).json({ error: 'No se pudieron cargar los supermercados disponibles.' })
  }
})

app.get('/admin/business-accounts', requireAdmin, async (req, res) => {
  try {
    const accounts = []
    const batchSize = 1000
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await analysisWriter
        .from('customer_profiles')
        .select('user_id, username, email, role, supermarket_id')
        .order('username', { ascending: true })
        .range(offset, offset + batchSize - 1)
      if (error) throw error
      accounts.push(...(data || []))
      if ((data || []).length < batchSize) break
    }
    return res.json(accounts)
  } catch (error) {
    console.error('Business account listing failed', error)
    return res.status(503).json({ error: 'No se pudieron cargar las cuentas. Verifica la migración del catálogo comercial.' })
  }
})

app.get('/admin/customer-accounts', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'La administración de cuentas requiere SUPABASE_SERVICE_ROLE_KEY en el backend.' })
  }

  const search = String(req.query.search || '').trim().slice(0, 100).replace(/[%_*(),\\]/g, '')
  const requestedPage = Number(req.query.page || 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 1000000)
    : 1
  const pageSize = 50

  try {
    let query = supabaseAdmin
      .from('customer_profiles')
      .select('user_id, username, email, role, created_at', { count: 'exact' })
      .order('username', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (search) {
      const searchTerms = search.split(/\s+/).filter(Boolean)
      const termFilters = searchTerms.map((term) => (
        `or(username.ilike.%${term}%,email.ilike.%${term}%)`
      ))
      query = query.or(`and(${termFilters.join(',')})`)
    }
    const { data, error, count } = await query
    if (error) throw error
    return res.json({
      accounts: data || [],
      total: count || 0,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Registered customer account listing failed', error)
    return res.status(503).json({ error: 'No se pudieron cargar las cuentas registradas.' })
  }
})

app.put('/admin/customer-accounts/:userId', requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(400).json({ error: 'La cuenta seleccionada no es válida.' })
  }

  const role = String(req.body?.role || '')
  if (!['customer', 'administrator', 'business'].includes(role)) {
    return res.status(400).json({ error: 'El tipo de cuenta no es válido.' })
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'La administración de cuentas requiere SUPABASE_SERVICE_ROLE_KEY en el backend.' })
  }

  try {
    const updates = { role }
    if (role !== 'business') updates.supermarket_id = null
    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .update(updates)
      .eq('user_id', userId)
      .select('user_id, username, email, role, created_at')
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'No se encontró la cuenta seleccionada.' })
    return res.json(data)
  } catch (error) {
    console.error('Registered customer account role update failed', error)
    return res.status(503).json({ error: 'No se pudo actualizar el tipo de cuenta. Verifica que la migración de roles esté aplicada.' })
  }
})

app.delete('/admin/customer-accounts/:userId', requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(400).json({ error: 'La cuenta seleccionada no es válida.' })
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'La administración de cuentas requiere SUPABASE_SERVICE_ROLE_KEY en el backend.' })
  }

  try {
    const { data: account, error: accountError } = await supabaseAdmin
      .from('customer_profiles')
      .select('user_id, username, role')
      .eq('user_id', userId)
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) return res.status(404).json({ error: 'No se encontró la cuenta seleccionada.' })
    if (String(account.username).toLowerCase() === String(req.admin || '').toLowerCase()) {
      return res.status(403).json({ error: 'No puedes eliminar la cuenta de administrador que estás utilizando.' })
    }

    if (account.role === 'administrator') {
      const { count, error: countError } = await supabaseAdmin
        .from('customer_profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'administrator')
      if (countError) throw countError
      if (count <= 1) {
        return res.status(409).json({ error: 'No se puede eliminar la última cuenta administradora.' })
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId, false)
    if (deleteError) throw deleteError
    return res.status(204).end()
  } catch (error) {
    console.error('Registered customer account deletion failed', error)
    return res.status(503).json({ error: 'No se pudo eliminar la cuenta y sus datos asociados.' })
  }
})

app.put('/admin/business-accounts/:userId', requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return res.status(400).json({ error: 'La cuenta seleccionada no es válida.' })
  }

  const role = String(req.body?.role || '')
  const supermarketId = req.body?.supermarketId ? String(req.body.supermarketId) : null
  if (!['customer', 'business'].includes(role)) {
    return res.status(400).json({ error: 'El tipo de cuenta no es válido.' })
  }
  if (role === 'customer' && supermarketId) {
    return res.status(400).json({ error: 'Las cuentas de cliente no pueden tener un supermercado asignado.' })
  }
  if (supermarketId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(supermarketId)) {
    return res.status(400).json({ error: 'El supermercado seleccionado no es válido.' })
  }

  try {
    if (supermarketId) {
      const { data: store, error: storeError } = await analysisWriter
        .from('supermarkets')
        .select('id')
        .eq('id', supermarketId)
        .maybeSingle()
      if (storeError) throw storeError
      if (!store) return res.status(400).json({ error: 'El supermercado seleccionado no existe.' })
    }

    const { data, error } = await analysisWriter
      .from('customer_profiles')
      .update({ role, supermarket_id: role === 'business' ? supermarketId : null })
      .eq('user_id', userId)
      .select('user_id, username, email, role, supermarket_id')
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'No se encontró la cuenta seleccionada.' })
    return res.json(data)
  } catch (error) {
    console.error('Business account assignment failed', error)
    return res.status(503).json({ error: 'No se pudo actualizar la cuenta comercial.' })
  }
})

app.get('/business/catalog', requireCustomerAuth, requireBusinessStore, async (req, res) => {
  const search = String(req.query.search || '').trim()
  const requestedPage = Number(req.query.page || 1)
  if (search.length > 120) return res.status(400).json({ error: 'La búsqueda no puede superar 120 caracteres.' })
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) {
    return res.status(400).json({ error: 'La página solicitada no es válida.' })
  }

  const page = Math.min(requestedPage, 1000000)
  const pageSize = 40
  const offset = (page - 1) * pageSize

  try {
    let pageProducts
    let offersByProduct = new Map()
    let hasMore

    if (search) {
      const searchTerms = search.split(/\s+/).filter(Boolean)
      let productsQuery = analysisWriter
        .from('products')
        .select('id, name, image')
        .order('name', { ascending: true })
        .order('id', { ascending: true })
      searchTerms.forEach((term) => {
        productsQuery = productsQuery.ilike('name', `%${term}%`)
      })
      const { data: productRows, error: productsError } = await productsQuery.range(offset, offset + pageSize)
      if (productsError) throw productsError

      hasMore = (productRows || []).length > pageSize
      pageProducts = (productRows || []).slice(0, pageSize)
      const productIds = pageProducts.map((product) => product.id)
      if (productIds.length) {
        const { data: offers, error: offersError } = await analysisWriter
          .from('offers')
          .select('id, product_id, cash_price')
          .eq('supermarket', req.businessStore.name)
          .in('product_id', productIds)
        if (offersError) throw offersError
        offersByProduct = new Map((offers || []).map((offer) => [String(offer.product_id), offer]))
      }
    } else {
      const { data: offerRows, error: offersError } = await analysisWriter
        .from('offers')
        .select('id, product_id, cash_price')
        .eq('supermarket', req.businessStore.name)
        .order('product_id', { ascending: true })
        .range(offset, offset + pageSize)
      if (offersError) throw offersError

      hasMore = (offerRows || []).length > pageSize
      const pageOffers = (offerRows || []).slice(0, pageSize)
      const productIds = pageOffers.map((offer) => offer.product_id)
      offersByProduct = new Map(pageOffers.map((offer) => [String(offer.product_id), offer]))

      if (productIds.length) {
        const { data: productRows, error: productsError } = await analysisWriter
          .from('products')
          .select('id, name, image')
          .in('id', productIds)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
        if (productsError) throw productsError
        pageProducts = productRows || []
      } else {
        pageProducts = []
      }
    }

    return res.json({
      store: req.businessStore,
      page,
      hasMore,
      products: pageProducts.map((product) => {
        const offer = offersByProduct.get(String(product.id))
        return {
          ...product,
          available: Boolean(offer),
          offerId: offer?.id || null,
          cashPrice: Number(offer?.cash_price) || null,
        }
      }),
    })
  } catch (error) {
    console.error('Business catalog listing failed', error)
    return res.status(503).json({ error: 'No se pudo cargar el catálogo comercial.' })
  }
})

app.get('/business/price-history', requireCustomerAuth, requireBusinessStore, async (req, res) => {
  try {
    const { data: historyRows, error } = await analysisWriter
      .from('price_history')
      .select('id, product_id, offer_id, observed_at, cash_price, source, product:products(name), offer:offers!inner(supermarket)')
      .eq('offer.supermarket', req.businessStore.name)
      .order('observed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(500)
    if (error) throw error

    const rowsByOffer = new Map()
    for (const row of historyRows || []) {
      if (row.offer_id === null) continue
      const offerId = String(row.offer_id)
      const offerRows = rowsByOffer.get(offerId) || []
      offerRows.push(row)
      rowsByOffer.set(offerId, offerRows)
    }

    const history = [...rowsByOffer.values()]
      .flatMap((offerRows) => {
        const chronologicalRows = [...offerRows].reverse()
        return chronologicalRows.map((row, index) => ({
          id: row.id,
          productName: row.product?.name || 'Producto',
          previousPrice: index > 0 ? Number(chronologicalRows[index - 1].cash_price) : null,
          cashPrice: Number(row.cash_price),
          observedAt: row.observed_at,
          source: row.source,
        }))
      })
      .sort((left, right) => new Date(right.observedAt) - new Date(left.observedAt))

    return res.json({ history })
  } catch (error) {
    console.error('Business price history listing failed', error)
    return res.status(503).json({ error: 'No se pudo cargar el historial de precios.' })
  }
})

app.get('/business/disco-price-history', requireCustomerAuth, async (req, res) => {
  try {
    const profile = await getCustomerProfile(req.customerUser)
    if (!['business', 'administrator'].includes(profile.role)) {
      return res.status(403).json({ error: 'Esta función está disponible solo para cuentas comerciales.' })
    }

    const { data: historyRows, error } = await analysisWriter
      .from('price_history')
      .select('id, product_id, offer_id, observed_at, cash_price, source, product:products(name), offer:offers!inner(supermarket)')
      .eq('offer.supermarket', 'Disco')
      .order('observed_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(500)
    if (error) throw error

    const rowsByOffer = new Map()
    for (const row of historyRows || []) {
      if (row.offer_id === null) continue
      const offerId = String(row.offer_id)
      const offerRows = rowsByOffer.get(offerId) || []
      offerRows.push(row)
      rowsByOffer.set(offerId, offerRows)
    }

    const history = [...rowsByOffer.values()]
      .flatMap((offerRows) => {
        const chronologicalRows = [...offerRows].reverse()
        return chronologicalRows.map((row, index) => ({
          id: row.id,
          productName: row.product?.name || 'Producto',
          previousPrice: index > 0 ? Number(chronologicalRows[index - 1].cash_price) : null,
          cashPrice: Number(row.cash_price),
          observedAt: row.observed_at,
          source: row.source,
        }))
      })
      .sort((left, right) => new Date(right.observedAt) - new Date(left.observedAt))

    return res.json({ history })
  } catch (error) {
    console.error('Disco price history listing failed', error)
    return res.status(503).json({ error: 'No se pudo cargar el historial de precios de Disco.' })
  }
})

app.put('/business/catalog/:productId', requireCustomerAuth, requireBusinessStore, async (req, res) => {
  const productId = Number(req.params.productId)
  const available = req.body?.available
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'El producto seleccionado no es válido.' })
  }
  if (typeof available !== 'boolean') {
    return res.status(400).json({ error: 'Indica si el producto debe estar disponible.' })
  }

  const cashPrice = Number(req.body?.cashPrice)
  if (available && (!Number.isFinite(cashPrice) || cashPrice <= 0)) {
    return res.status(400).json({ error: 'El precio debe ser un número mayor que cero.' })
  }

  try {
    const { data: product, error: productError } = await analysisWriter
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle()
    if (productError) throw productError
    if (!product) return res.status(404).json({ error: 'No se encontró el producto del catálogo.' })

    const { data: existingOffer, error: offerLookupError } = await analysisWriter
      .from('offers')
      .select('id, cash_price')
      .eq('product_id', productId)
      .eq('supermarket', req.businessStore.name)
      .maybeSingle()
    if (offerLookupError) throw offerLookupError

    if (!available) {
      if (existingOffer) {
        const { error: deleteError } = await analysisWriter
          .from('offers')
          .delete()
          .eq('id', existingOffer.id)
          .eq('supermarket', req.businessStore.name)
        if (deleteError) throw deleteError
        invalidateCatalogPageCache()
        scheduleRelatedPriceStatusRefresh(productId)
      }
      return res.json({ productId, available: false })
    }

    let offer = existingOffer
    const priceChanged = !existingOffer || !sameMoneyValue(existingOffer.cash_price, cashPrice)
    if (existingOffer && priceChanged) {
      const { data, error } = await analysisWriter
        .from('offers')
        .update({ cash_price: cashPrice })
        .eq('id', existingOffer.id)
        .eq('supermarket', req.businessStore.name)
        .select('id, cash_price')
        .single()
      if (error) throw error
      offer = data
    } else if (!existingOffer) {
      const { data, error } = await analysisWriter
        .from('offers')
        .insert({
          product_id: productId,
          supermarket: req.businessStore.name,
          cash_price: cashPrice,
        })
        .select('id, cash_price')
        .single()
      if (error) throw error
      offer = data
    }

    if (priceChanged) {
      await recordPriceHistory({
        productId,
        offerId: offer.id,
        cashPrice,
        source: 'business_catalog',
        scheduleStatusRefresh: false,
      })
      scheduleRelatedPriceStatusRefresh(productId)
    }

    return res.json({
      productId,
      available: true,
      offerId: offer.id,
      cashPrice: Number(offer.cash_price),
    })
  } catch (error) {
    console.error('Business catalog update failed', error)
    return res.status(503).json({ error: 'No se pudo actualizar el producto del comercio.' })
  }
})

async function isSharedListMember(listId, userId) {
  const { data, error } = await analysisWriter
    .from('shared_shopping_list_members')
    .select('role')
    .eq('list_id', listId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

app.post('/shared-lists/:listId/invitations', requireCustomerAuth, async (req, res) => {
  const recipientUserId = String(req.body?.userId || '')
  const username = String(req.body?.username || '').trim().toLowerCase()
  const isValidRecipientUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientUserId)
  const isValidUsername = /^[a-z0-9]{2,32}$/.test(username)
  if (!isValidRecipientUserId && !isValidUsername) {
    return res.status(400).json({ error: 'Selecciona un usuario válido para invitar.' })
  }

  try {
    const membership = await isSharedListMember(req.params.listId, req.customerUser.id)
    if (!membership) return res.status(404).json({ error: 'No se encontró la lista o no tienes acceso.' })

    let recipientQuery = analysisWriter
      .from('customer_profiles')
      .select('user_id, username, role')
    if (isValidRecipientUserId) {
      recipientQuery = recipientQuery.eq('user_id', recipientUserId)
    } else {
      recipientQuery = recipientQuery.eq('username', username)
    }
    const { data: recipient, error: recipientError } = await recipientQuery.maybeSingle()
    if (recipientError) throw recipientError
    if (recipient?.role !== 'customer') {
      return res.status(404).json({ error: 'No se encontró un cliente con ese usuario.' })
    }
    if (recipient.user_id === req.customerUser.id) {
      return res.status(400).json({ error: 'No puedes invitarte a tu propia lista.' })
    }

    const recipientMembership = await isSharedListMember(req.params.listId, recipient.user_id)
    if (recipientMembership) return res.status(409).json({ error: 'Ese usuario ya participa en la lista.' })

    const { data: invitation, error: invitationError } = await analysisWriter
      .from('shared_shopping_list_invitations')
      .insert({
        list_id: req.params.listId,
        inviter_user_id: req.customerUser.id,
        invitee_user_id: recipient.user_id,
      })
      .select('id')
      .single()
    if (invitationError?.code === '23505') {
      return res.status(409).json({ error: 'Ya le enviaste una invitación a esa persona.' })
    }
    if (invitationError) throw invitationError
    return res.status(201).json({ id: invitation.id, username: recipient.username })
  } catch (error) {
    console.error('Shared-list invitation creation failed', error)
    return res.status(503).json({ error: 'No se pudo enviar la invitación.' })
  }
})

app.get('/shared-lists', requireCustomerAuth, async (req, res) => {
  try {
    const { data: memberships, error: membershipError } = await analysisWriter
      .from('shared_shopping_list_members')
      .select('list_id, role, joined_at')
      .eq('user_id', req.customerUser.id)
      .order('joined_at', { ascending: false })
    if (membershipError) throw membershipError

    const listIds = (memberships || []).map((membership) => membership.list_id)
    if (!listIds.length) return res.json([])

    const { data: lists, error: listsError } = await analysisWriter
      .from('shared_shopping_lists')
      .select('id, name, owner_user_id, created_at, updated_at')
      .in('id', listIds)
      .order('updated_at', { ascending: false })
    if (listsError) throw listsError

    const roleByListId = new Map(memberships.map((membership) => [membership.list_id, membership.role]))
    return res.json((lists || []).map((list) => ({
      ...list,
      role: roleByListId.get(list.id) || 'member',
    })))
  } catch (error) {
    console.error('Shared-list fetch failed', error)
    return res.status(503).json({ error: 'No se pudieron cargar las listas. Verifica que la migración de listas compartidas esté aplicada en Supabase.' })
  }
})

app.post('/shared-lists', requireCustomerAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name || name.length > 80) {
    return res.status(400).json({ error: 'El nombre debe tener entre 1 y 80 caracteres.' })
  }
  try {
    const { data: list, error: listError } = await analysisWriter
      .from('shared_shopping_lists')
      .insert({
        name,
        owner_user_id: req.customerUser.id,
        invite_code: crypto.randomBytes(24).toString('base64url'),
      })
      .select('id, name, owner_user_id, invite_code, created_at, updated_at')
      .single()
    if (listError) throw listError

    const { error: membershipError } = await analysisWriter
      .from('shared_shopping_list_members')
      .insert({ list_id: list.id, user_id: req.customerUser.id, role: 'owner' })
    if (membershipError) {
      const { error: cleanupError } = await analysisWriter
        .from('shared_shopping_lists')
        .delete()
        .eq('id', list.id)
      if (cleanupError) console.error('Failed to clean up incomplete shared list', cleanupError)
      throw membershipError
    }

    return res.status(201).json(list)
  } catch (error) {
    console.error('Shared-list creation failed', error)
    return res.status(503).json({ error: 'No se pudo crear la lista. Verifica que la migración de listas compartidas esté aplicada en Supabase.' })
  }
})

app.post('/shared-lists/join', requireCustomerAuth, async (req, res) => {
  const inviteCode = String(req.body?.inviteCode || '').trim()
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(inviteCode)) {
    return res.status(400).json({ error: 'El enlace o código de invitación no es válido.' })
  }

  try {
    const { data: list, error: listError } = await analysisWriter
      .from('shared_shopping_lists')
      .select('id, name, owner_user_id, created_at, updated_at')
      .eq('invite_code', inviteCode)
      .maybeSingle()
    if (listError) throw listError
    if (!list) return res.status(404).json({ error: 'No se encontró una lista con esa invitación.' })

    const { error: membershipError } = await analysisWriter
      .from('shared_shopping_list_members')
      .upsert(
        { list_id: list.id, user_id: req.customerUser.id, role: 'member' },
        { onConflict: 'list_id,user_id', ignoreDuplicates: true },
      )
    if (membershipError) throw membershipError
    return res.json(list)
  } catch (error) {
    console.error('Joining shared list failed', error)
    return res.status(503).json({ error: 'No se pudo aceptar la invitación. Inténtalo nuevamente.' })
  }
})

app.delete('/shared-lists/:listId', requireCustomerAuth, async (req, res) => {
  try {
    const membership = await isSharedListMember(req.params.listId, req.customerUser.id)
    if (!membership) return res.status(404).json({ error: 'No se encontró la lista o no tienes acceso.' })
    if (membership.role !== 'owner') {
      return res.status(403).json({ error: 'Solo quien creó la lista puede eliminarla.' })
    }

    const { error, count } = await analysisWriter
      .from('shared_shopping_lists')
      .delete({ count: 'exact' })
      .eq('id', req.params.listId)
      .eq('owner_user_id', req.customerUser.id)
    if (error) throw error
    if (!count) return res.status(404).json({ error: 'No se encontró la lista.' })
    return res.status(204).end()
  } catch (error) {
    console.error('Shared-list deletion failed', error)
    return res.status(503).json({ error: 'No se pudo eliminar la lista.' })
  }
})

app.get('/shared-lists/:listId', requireCustomerAuth, async (req, res) => {
  try {
    const membership = await isSharedListMember(req.params.listId, req.customerUser.id)
    if (!membership) return res.status(404).json({ error: 'No se encontró la lista o no tienes acceso.' })

    const [{ data: list, error: listError }, { data: items, error: itemsError }, { data: members, error: membersError }] = await Promise.all([
      analysisWriter
        .from('shared_shopping_lists')
        .select('id, name, owner_user_id, invite_code, created_at, updated_at')
        .eq('id', req.params.listId)
        .maybeSingle(),
      analysisWriter
        .from('shared_shopping_list_items')
        .select('id, product_id, item_name, quantity, is_checked, added_by, created_at')
        .eq('list_id', req.params.listId)
        .order('created_at', { ascending: true }),
      analysisWriter
        .from('shared_shopping_list_members')
        .select('user_id, role, joined_at')
        .eq('list_id', req.params.listId)
        .order('joined_at', { ascending: true }),
    ])
    if (listError) throw listError
    if (itemsError) throw itemsError
    if (membersError) throw membersError
    if (!list) return res.status(404).json({ error: 'No se encontró la lista.' })

    const memberUserIds = (members || []).map((member) => member.user_id)
    const { data: profiles, error: profilesError } = memberUserIds.length
      ? await analysisWriter
        .from('customer_profiles')
        .select('user_id, username')
        .in('user_id', memberUserIds)
      : { data: [], error: null }
    if (profilesError) throw profilesError
    const usernameByUserId = new Map((profiles || []).map((profile) => [profile.user_id, profile.username]))

    return res.json({
      ...list,
      role: membership.role,
      memberCount: members?.length || 1,
      members: (members || []).map((member) => ({
        user_id: member.user_id,
        username: usernameByUserId.get(member.user_id) || 'Usuario',
        role: member.role,
        joined_at: member.joined_at,
      })),
      items: items || [],
    })
  } catch (error) {
    console.error('Shared-list detail fetch failed', error)
    return res.status(503).json({ error: 'No se pudo cargar la lista compartida.' })
  }
})

app.post('/shared-lists/:listId/items', requireCustomerAuth, async (req, res) => {
  const itemName = String(req.body?.itemName || '').trim()
  const quantity = Number(req.body?.quantity ?? 1)
  if (!itemName || itemName.length > 160 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
    return res.status(400).json({ error: 'Ingresa un artículo y una cantidad válida (máximo 999).' })
  }

  try {
    const membership = await isSharedListMember(req.params.listId, req.customerUser.id)
    if (!membership) return res.status(404).json({ error: 'No se encontró la lista o no tienes acceso.' })
    const { data, error } = await analysisWriter
      .from('shared_shopping_list_items')
      .insert({
        list_id: req.params.listId,
        item_name: itemName,
        quantity,
        added_by: req.customerUser.id,
      })
      .select('id, product_id, item_name, quantity, is_checked, added_by, created_at')
      .single()
    if (error) throw error
    return res.status(201).json(data)
  } catch (error) {
    console.error('Shared-list item creation failed', error)
    return res.status(503).json({ error: 'No se pudo agregar el artículo a la lista.' })
  }
})

app.patch('/shared-lists/:listId/items/:itemId', requireCustomerAuth, async (req, res) => {
  const changes = {}
  if (typeof req.body?.isChecked === 'boolean') changes.is_checked = req.body.isChecked
  if (req.body?.quantity !== undefined) {
    const quantity = Number(req.body.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor que 0 y no superar 999.' })
    }
    changes.quantity = quantity
  }
  if (typeof req.body?.itemName === 'string') {
    const itemName = req.body.itemName.trim()
    if (!itemName || itemName.length > 160) {
      return res.status(400).json({ error: 'El nombre del artículo debe tener entre 1 y 160 caracteres.' })
    }
    changes.item_name = itemName
  }
  if (!Object.keys(changes).length) return res.status(400).json({ error: 'No hay cambios válidos para guardar.' })

  try {
    const membership = await isSharedListMember(req.params.listId, req.customerUser.id)
    if (!membership) return res.status(404).json({ error: 'No se encontró la lista o no tienes acceso.' })
    const { data, error } = await analysisWriter
      .from('shared_shopping_list_items')
      .update(changes)
      .eq('id', req.params.itemId)
      .eq('list_id', req.params.listId)
      .select('id, product_id, item_name, quantity, is_checked, added_by, created_at')
      .maybeSingle()
    if (error) throw error
    if (!data) return res.status(404).json({ error: 'No se encontró el artículo.' })
    return res.json(data)
  } catch (error) {
    console.error('Shared-list item update failed', error)
    return res.status(503).json({ error: 'No se pudo actualizar el artículo.' })
  }
})

app.delete('/shared-lists/:listId/items/:itemId', requireCustomerAuth, async (req, res) => {
  try {
    const membership = await isSharedListMember(req.params.listId, req.customerUser.id)
    if (!membership) return res.status(404).json({ error: 'No se encontró la lista o no tienes acceso.' })
    const { error, count } = await analysisWriter
      .from('shared_shopping_list_items')
      .delete({ count: 'exact' })
      .eq('id', req.params.itemId)
      .eq('list_id', req.params.listId)
    if (error) throw error
    if (!count) return res.status(404).json({ error: 'No se encontró el artículo.' })
    return res.status(204).end()
  } catch (error) {
    console.error('Shared-list item deletion failed', error)
    return res.status(503).json({ error: 'No se pudo quitar el artículo.' })
  }
})

// Admin: update offers prices by category with a percentage
app.post('/admin/update-prices', requireAdmin, async (req, res) => {
  try {
    const { categoryId, brandId, supermarket, percentage, updatedAt } = req.body || {}
    if ((!categoryId && !brandId && !supermarket) || typeof percentage !== 'number') {
      return res.status(400).json({ error: 'categoryId, brandId or supermarket and numeric percentage required' })
    }
    if (percentage === 0) return res.json({ updated: 0 })
    let operationDate
    if (updatedAt) {
      operationDate = new Date(`${updatedAt}T12:00:00`)
      if (Number.isNaN(operationDate.getTime())) return res.status(400).json({ error: 'Invalid update date' })
    }

    // fetch products with offers and filter locally by multiple possible category fields
    const { data: allProducts, error: allErr } = await analysisWriter.from('products').select('*, offers(*)')
    if (allErr) {
      console.error('Error fetching products', allErr)
      return res.status(500).json({ error: 'Error fetching products' })
    }

    const products = (allProducts || []).filter((p) => {
      if (categoryId) {
        const catCandidates = []
        if (p.category_id) catCandidates.push(p.category_id)
        if (p.category) catCandidates.push(p.category)
        if (p['category.id']) catCandidates.push(p['category.id'])
        if (p['category.name']) catCandidates.push(p['category.name'])
        if (p.categories && p.categories.name) catCandidates.push(p.categories.name)
        if (!catCandidates.some((c) => c && String(c) === String(categoryId))) return false
      }
      if (brandId) {
        const brandCandidates = []
        if (p.brand_id) brandCandidates.push(p.brand_id)
        if (p.brand) brandCandidates.push(p.brand)
        if (p['brand.id']) brandCandidates.push(p['brand.id'])
        if (p['brand.name']) brandCandidates.push(p['brand.name'])
        if (p.brands && p.brands.name) brandCandidates.push(p.brands.name)
        if (!brandCandidates.some((b) => b && String(b) === String(brandId))) return false
      }
      return true
    })

    const productIds = products.map((p) => p.id).filter(Boolean)
    if (!productIds.length) {
      return res.json({ updated: 0 })
    }

    // fetch offers for these products
    const { data: allOffers, error: offersErr } = await analysisWriter.from('offers').select('*').in('product_id', productIds)
    if (offersErr) {
      console.error('Error fetching offers', offersErr)
      return res.status(500).json({ error: 'Error fetching offers' })
    }
    const offers = (allOffers || []).filter((offer) => !supermarket || offer.supermarket === supermarket)
    if (!offers.length) return res.json({ updated: 0 })

    // update each offer individually with the new price
    let updatedCount = 0
    const changes = []
    for (const offer of offers || []) {
      const current = Number(offer.cash_price || 0)
      const newPrice = Math.round(current * (1 + percentage / 100))
      const { error: upErr } = await analysisWriter.from('offers').update({ cash_price: newPrice }).eq('id', offer.id)
      if (upErr) console.error('Error updating offer', offer.id, upErr)
      else {
        updatedCount++
        changes.push({
          offerId: offer.id,
          productId: offer.product_id,
          previousCashPrice: current,
          updatedCashPrice: newPrice,
        })
        await recordPriceHistory({
          productId: offer.product_id,
          offerId: offer.id,
          cashPrice: newPrice,
          source: 'bulk_admin',
        })
      }
    }

    const { error: logError } = await analysisWriter.from('price_update_log').insert({
      admin_username: req.admin,
      ...(operationDate ? { updated_at: operationDate.toISOString() } : {}),
      filters: { categoryId: categoryId || null, brandId: brandId || null, supermarket: supermarket || null },
      percentage,
      products_updated: new Set(changes.map((change) => String(change.productId))).size,
      changes,
    })
    if (logError) {
      console.error('Error recording price update', logError)
      return res.status(500).json({ error: 'Prices updated, but the operation could not be recorded' })
    }

    for (const productId of new Set(changes.map((change) => String(change.productId)))) {
      scheduleRelatedPriceStatusRefresh(productId)
    }
    res.json({ updated: updatedCount })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const desiredPort = process.env.PORT ? Number(process.env.PORT) : 3000
const candidatePorts = [desiredPort, 3100, 3140, 3200, 3210, 3300, 3500, 4000].filter((port, index, array) => Number.isInteger(port) && port > 0 && array.indexOf(port) === index)
let discoSyncRunning = false
const discoSyncIntervalMs = Number(process.env.DISCO_SYNC_INTERVAL_MS || 24 * 60 * 60 * 1000)
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.post('/translate/products', productTranslationIpRateLimit, async (req, res) => {
  const names = req.body?.names
  if (!Array.isArray(names) || names.length < 1 || names.length > 50) {
    return res.status(400).json({ error: 'Send between 1 and 50 product names.' })
  }

  const normalizedNames = names.map((name) => typeof name === 'string' ? name.trim() : '')
  if (normalizedNames.some((name) => !name || name.length > 200)) {
    return res.status(400).json({ error: 'Product names must contain between 1 and 200 characters.' })
  }

  try {
    const translations = await productTranslationService.translate(normalizedNames)
    return res.json({
      translations: [...translations].map(([original, translated]) => ({ original, translated })),
    })
  } catch (error) {
    if (error.code === 'TRANSLATION_SERVICE_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'Product translation is not configured on the server.' })
    }
    console.error('Product translation request failed:', error.message)
    return res.status(502).json({ error: 'The product translation service could not translate the requested names.' })
  }
})

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  enqueueIncompletePriceStatuses(analysisWriter, priceStatusQueue)
    .catch((error) => console.error('Unable to queue missing or stale current price statuses', error))
}

if (process.env.DISCO_SYNC_ENABLED === 'true') {
  setInterval(async () => {
    if (discoSyncRunning) return
    discoSyncRunning = true
    try {
      const result = await syncDiscoPrices({
        database: analysisWriter,
        historyRecorder: recordPriceHistory,
        onCatalogChange: invalidateCatalogPageCache,
      })
      console.log(`Disco scheduled sync: ${result.updated.length} updated, ${result.unchanged.length} unchanged, ${result.unavailable.length} unavailable, ${result.suspicious.length} suspicious`)
    } catch (error) {
      console.error('Disco scheduled sync failed:', error.message)
    } finally {
      discoSyncRunning = false
    }
  }, discoSyncIntervalMs)
  console.log(`Disco scheduled sync enabled every ${discoSyncIntervalMs}ms`)
}

let server = null
function startServerAt(portIndex = 0) {
  if (portIndex >= candidatePorts.length) {
    console.error('No free port available for the admin API server')
    process.exit(1)
    return
  }

  const port = candidatePorts[portIndex]
  server = app.listen(port, () => {
    const actual = server.address().port
    console.log(`Server running on port ${actual}`)
  })

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use; trying ${candidatePorts[portIndex + 1] || 'next available'}`)
      startServerAt(portIndex + 1)
      return
    }

    console.error('Server error:', err && err.message)
  })
}

startServerAt()
