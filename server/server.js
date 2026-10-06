const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { createClient } = require('@supabase/supabase-js')
const app = express()

app.use(cors())
app.use(express.json())

<<<<<<< HEAD
app.get('/health', (req, res) => {
  res.json({ service: 'arprice-api', capabilities: { reviewMatchGrouping: true } })
})

=======
const supabase = require('./supabase')
>>>>>>> origin/main
const supabaseAdmin = require('./supabaseAdmin')
const { analyzeProduct } = require('./services/priceAnalysisService')
const { fetchDiscoPreviewReport, findPreviewMatches, isValidDiscoProduct } = require('./services/discoImporter')
const { fetchPreview: fetchMamiPreview, findMatches: findMamiMatches, isValidProduct: isValidMamiProduct, source: mamiSource, getInvalidReason: getMamiInvalidReason } = require('./services/mamiImporter')
<<<<<<< HEAD
const { compareSimulationReport, compareCrossSourceProducts, buildTaxonomyComparison } = require('./services/importerContract')
const { syncDiscoPrices } = require('./services/discoPriceSync')
const { suggestCatalogMapping } = require('./services/catalogTaxonomy')
const { auditCrossSourceProducts } = require('./services/crossSourceProductMatcher')
const { normalizeDiscoStoredPrice } = require('./priceNormalization')
const { normalizePairKey, upsertReviewDecision, listReviewDecisions, clearReviewDecisions, summarizeReviewDecisions, getReviewGroupingPeerIds, applyReviewMatchGrouping } = require('./services/reviewDecisionStore')
const analysisWriter = supabaseAdmin
const supabase = analysisWriter
const publicDiscoSearchCache = new Map()
const publicDiscoSearchInFlight = new Set()
=======
const { compareSimulationReport, buildTaxonomyComparison } = require('./services/importerContract')
const { syncDiscoPrices } = require('./services/discoPriceSync')
const { suggestCatalogMapping } = require('./services/catalogTaxonomy')
const { normalizeDiscoStoredPrice } = require('./priceNormalization')
const analysisWriter = supabaseAdmin
const publicDiscoSearchCache = new Map()
>>>>>>> origin/main
const publicDiscoSearchMaxResults = Math.min(500, Math.max(50, Number(process.env.DISCO_PUBLIC_SEARCH_MAX_RESULTS || 500)))
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
    if (categoriesError || subcategoriesError) return res.status(500).json({ error: 'Error fetching taxonomy' })

    // PostgREST limits a response to 1,000 rows by default. Counts must include
    // the complete catalog, otherwise newly imported products disappear from categories.
    const productTaxonomy = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data: page, error: productsError } = await analysisWriter
        .from('products')
<<<<<<< HEAD
        .select('category_id, subcategory_id, offers(id, cash_price, supermarket)')
        .range(from, from + pageSize - 1)
      if (productsError) return res.status(500).json({ error: 'Error fetching taxonomy' })
      productTaxonomy.push(...(page || []).filter((product) => (product.offers || []).some((offer) => Number(offer.cash_price) > 0 && String(offer.supermarket || '').trim())))
=======
        .select('category_id, subcategory_id')
        .range(from, from + pageSize - 1)
      if (productsError) return res.status(500).json({ error: 'Error fetching taxonomy' })
      productTaxonomy.push(...(page || []))
>>>>>>> origin/main
      if (!page || page.length < pageSize) break
    }

    const categoryCounts = new Map()
    const subcategoryCounts = new Map()
    for (const product of productTaxonomy || []) {
      if (product.category_id) categoryCounts.set(String(product.category_id), (categoryCounts.get(String(product.category_id)) || 0) + 1)
      if (product.subcategory_id) subcategoryCounts.set(String(product.subcategory_id), (subcategoryCounts.get(String(product.subcategory_id)) || 0) + 1)
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
<<<<<<< HEAD
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
=======
    const [previewReport, { data: localProducts, error: productsError }, { data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] = await Promise.all([
      fetchMamiPreview({ query, from, to }),
      supabase.from('products').select('id, name, source_product_id, ean, brand, offers(id, supermarket, cash_price)'),
      supabase.from('categories').select('id, name'),
      supabase.from('subcategories').select('id, name, category_id'),
    ])
    if (productsError || categoriesError || subcategoriesError) return res.status(500).json({ error: 'No se pudo consultar el inventario local o el catálogo de categorías' })
>>>>>>> origin/main
    const comparison = compareSimulationReport({
      source: mamiSource,
      isValidProduct: isValidMamiProduct,
      getInvalidReason: getMamiInvalidReason,
      findMatches: findMamiMatches,
    }, previewReport, localProducts || [])
<<<<<<< HEAD
    if (!previewReport.sourceRead?.htmlFetched || (!previewReport.sourceRead.categoryRouteCount && !previewReport.sourceRead.productRouteCount)) {
      return res.status(503).json({
        error: 'Mami no entregó un catálogo navegable',
        detail: previewReport.sourceRead || null,
        retryable: true,
      })
    }
=======
>>>>>>> origin/main
    const taxonomyComparison = (previewReport.products || []).map((product) => ({
      ...buildTaxonomyComparison(product, categories || [], subcategories || []),
      sourceProductId: product.sourceProductId,
      name: product.name,
    }))
<<<<<<< HEAD
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
=======
>>>>>>> origin/main
    res.json({
      source: mamiSource,
      query,
      from,
      to,
<<<<<<< HEAD
      products,
=======
      products: previewReport.products,
>>>>>>> origin/main
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

<<<<<<< HEAD
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

app.post('/admin/import/mami', requireAdmin, async (req, res) => {
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
          if (Number(existingOffer.cash_price) !== Number(item.price)) {
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
=======
app.post('/admin/import/mami', requireAdmin, async (req, res) => {
  try {
    return res.status(403).json({
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
  } catch (error) {
    console.error('Error trying to import Mami', error)
    return res.status(502).json({ error: error.message || 'No se pudo iniciar la importación de Mami' })
>>>>>>> origin/main
  }
})

app.post('/admin/import/disco', requireAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.products) ? req.body.products : []
    if (!items.length) return res.status(400).json({ error: 'Seleccioná al menos un producto' })
    const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }, { data: brands, error: brandsError }, { data: existingProducts, error: productsError }] = await Promise.all([
      supabase.from('categories').select('id, name'),
      supabase.from('subcategories').select('id, name, category_id'),
      supabase.from('brands').select('id, name'),
<<<<<<< HEAD
      supabase.from('products').select('id, name, source_product_id, ean, offers(id, supermarket, cash_price)'),
=======
      supabase.from('products').select('id, name, source_product_id, ean'),
>>>>>>> origin/main
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
<<<<<<< HEAD
      const updated = []
      const unchanged = []
=======
>>>>>>> origin/main
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
<<<<<<< HEAD
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
          if (Number(existingOffer.cash_price) !== Number(item.price)) {
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
=======
      const duplicate = existingBySourceId || existingByEan || seenSourceProductIds.has(sourceProductId)
      if (!category || !subcategory || duplicate) {
        skipped.push({ sourceProductId: item.sourceProductId, reason: duplicate ? (existingByEan ? 'EAN duplicado' : 'Posible duplicado') : 'Falta precio o mapeo de categoría' })
>>>>>>> origin/main
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
    const result = await syncDiscoPrices({ database: analysisWriter, historyRecorder: recordPriceHistory, adminUsername: req.admin })
    res.json({ updated: result.updated.length, unchanged: result.unchanged.length, unavailable: result.unavailable })
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
    const { id } = req.params
    const { subcategory_id } = req.body || {}
    const priceHistoryRecorded = req.body?.priceHistoryRecorded === true
    if (!subcategory_id) return res.status(400).json({ error: 'subcategory_id is required' })
    const { data, error } = await supabase.from('products').update({
      subcategory_id,
      classification_source: 'manual',
      classification_confidence: 'manual',
    }).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: 'Error updating product classification' })
    const { error: logError } = await analysisWriter.from('price_update_log').insert({
      admin_username: req.admin,
      filters: { source: 'product_edit', productId: id },
      percentage: 0,
      products_updated: 1,
      changes: [{ type: 'classification_edit', productId: id, updatedFields: ['subcategory_id'], priceHistoryRecorded }],
    })
    if (logError) console.error('Error recording product classification update', logError)
    res.json(data)
  } catch (error) {
    console.error('Error updating product classification', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function recordPriceHistory({ productId, offerId, cashPrice, source = 'admin', throwOnError = false }) {
  const price = Number(cashPrice)
  if (!productId || !offerId || !Number.isFinite(price) || price <= 0) return

  const { data, error } = await analysisWriter.from('price_history').insert({
    product_id: productId,
    offer_id: offerId,
    cash_price: price,
    source,
  }).select('id').single()
  if (error) {
    console.error('Error recording price history', error)
    if (throwOnError) throw error
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
      if (Number(existingOffer.cash_price) !== Number(item.price)) {
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

async function importDiscoSearchResults(search) {
  const normalizedSearch = String(search || '').trim().toLowerCase()
  if (!normalizedSearch) return { imported: 0, updated: 0 }
  const cachedAt = publicDiscoSearchCache.get(normalizedSearch)
  if (cachedAt && Date.now() - cachedAt < 5 * 60 * 1000) return { imported: 0, updated: 0 }

  const previewReport = await fetchDiscoPreviewReport({ query: normalizedSearch, from: 0, to: publicDiscoSearchMaxResults - 1 })
  const preview = previewReport.products
  if (!preview.length && !previewReport.discarded.length) return { imported: 0, updated: 0 }
  publicDiscoSearchCache.set(normalizedSearch, Date.now())

  const [{ data: categories }, { data: subcategories }, { data: brands }, { data: existingProducts }] = await Promise.all([
    analysisWriter.from('categories').select('id, name'),
    analysisWriter.from('subcategories').select('id, name, category_id'),
    analysisWriter.from('brands').select('id, name'),
    analysisWriter.from('products').select('id, source_product_id, ean, offers(id, supermarket)'),
  ])
  const productsBySource = new Map((existingProducts || []).map((product) => [String(product.source_product_id || ''), product]))
  const productsByEan = new Map((existingProducts || []).filter((product) => product.ean).map((product) => [String(product.ean), product]))
  const brandCache = new Map((brands || []).map((brand) => [normalizeBrandName(brand.name), brand]))
  let imported = 0
  let updated = 0

  for (const item of preview) {
    const existing = productsBySource.get(String(item.sourceProductId)) || (item.ean && productsByEan.get(String(item.ean)))
    const existingOffer = existing?.offers?.find((offer) => offer.supermarket === 'Disco')
    if (existing && existingOffer) {
      if (Number(existingOffer.cash_price) !== Number(item.price)) {
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

// GET /products - fetch from Supabase with simple filters + pagination
app.get('/products', async (req, res) => {
  try {
    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 20)
    const safePage = Number.isFinite(page) && page > 0 ? page : 1
    const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 20
    const search = String(req.query.search || '').trim()
    const category = req.query.category || ''
    const subcategory = req.query.subcategory || ''
    const brand = req.query.brand || ''
    const supermarket = req.query.supermarket || ''

<<<<<<< HEAD
    if (search && safePage === 1) res.once('finish', () => scheduleDiscoSearchResults(search))

    // Keep every offer for display while filtering products through a matching offer.
    const matchingOfferSelect = supermarket ? ', matching_offers:offers!inner(id)' : ''
    let query = analysisWriter.from('products').select(`*, offers(*)${matchingOfferSelect}, categories(id, name), subcategories(id, name), brands(id, name)`)
    let countQuery = analysisWriter.from('products').select(
      supermarket ? 'id, matching_offers:offers!inner(id)' : '*',
      { count: 'exact', head: true },
    )
=======
    if (search) {
      try {
        await importDiscoSearchResults(search)
      } catch (error) {
        console.error('Disco search import failed', error.message)
      }
    }

    // Include related catalog data so admin and storefront can display it.
    let query = analysisWriter.from('products').select('*, offers(*), categories(id, name), subcategories(id, name), brands(id, name)')
    let countQuery = analysisWriter.from('products').select('*', { count: 'exact', head: true })
>>>>>>> origin/main

    if (search) {
      const searchPattern = `%${search}%`
      const [brandsResult, categoriesResult, subcategoriesResult] = await Promise.all([
        analysisWriter.from('brands').select('id').ilike('name', searchPattern),
        analysisWriter.from('categories').select('id').ilike('name', searchPattern),
        analysisWriter.from('subcategories').select('id').ilike('name', searchPattern),
      ])

      const brandIds = (brandsResult.data || []).map((item) => item.id).filter(Boolean)
      const categoryIds = (categoriesResult.data || []).map((item) => item.id).filter(Boolean)
      const subcategoryIds = (subcategoriesResult.data || []).map((item) => item.id).filter(Boolean)

      const productSearchClauses = [`name.ilike.${searchPattern}`]
      if (brandIds.length) productSearchClauses.push(`brand_id.in.(${brandIds.join(',')})`)
      if (categoryIds.length) productSearchClauses.push(`category_id.in.(${categoryIds.join(',')})`)
      if (subcategoryIds.length) productSearchClauses.push(`subcategory_id.in.(${subcategoryIds.join(',')})`)

      const searchOr = productSearchClauses.join(',')
      query = query.or(searchOr)
      countQuery = countQuery.or(searchOr)
    }

    if (category) {
      query = query.eq('category_id', category)
      countQuery = countQuery.eq('category_id', category)
    }
    if (subcategory) {
      query = query.eq('subcategory_id', subcategory)
      countQuery = countQuery.eq('subcategory_id', subcategory)
    }
    if (brand) {
      query = query.eq('brand_id', brand)
      countQuery = countQuery.eq('brand_id', brand)
    }
    if (supermarket) {
      query = query.eq('matching_offers.supermarket', supermarket)
      countQuery = countQuery.eq('matching_offers.supermarket', supermarket)
    }

    const { count, error: countError } = await countQuery
    if (countError) {
      console.error('Supabase count error:', countError)
      return res.status(500).json({ error: 'Error counting products' })
    }

    const from = (safePage - 1) * safeLimit
    const to = from + safeLimit - 1

    const { data, error } = await query.order('id', { ascending: true }).range(from, to)

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Error fetching products' })
    }

<<<<<<< HEAD
    const decisions = await listReviewDecisions()
    const peerIds = getReviewGroupingPeerIds(data || [], decisions)
    let peerProducts = []
    if (peerIds.length) {
      const { data: peers, error: peersError } = await analysisWriter
        .from('products')
        .select('*, offers(*), categories(id, name), subcategories(id, name), brands(id, name)')
        .in('id', peerIds)
      if (peersError) {
        console.error('Supabase error loading reviewed product peers:', peersError)
        return res.status(500).json({ error: 'Error fetching matched product offers' })
      }
      peerProducts = peers || []
    }
=======
>>>>>>> origin/main
    const normalizedData = (data || []).map((product) => ({
      ...product,
      offers: (product.offers || []).map((offer) => ({
        ...offer,
        cash_price: normalizeDiscoStoredPrice(offer.cash_price, product.source),
      })),
    }))
<<<<<<< HEAD
    const normalizedPeers = peerProducts.map((product) => ({
      ...product,
      offers: (product.offers || []).map((offer) => ({
        ...offer,
        cash_price: normalizeDiscoStoredPrice(offer.cash_price, product.source),
      })),
    }))
    const groupedData = applyReviewMatchGrouping([...normalizedData, ...normalizedPeers], decisions)

    res.json({
      data: groupedData,
      total: Number(count || 0) - Math.max(0, normalizedData.length - groupedData.length),
=======

    res.json({
      data: normalizedData,
      total: Number(count || 0),
>>>>>>> origin/main
      page: safePage,
      limit: safeLimit,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /analysis/products - calculate the structured analysis from backend data
app.get('/analysis/products', async (req, res) => {
  try {
    const products = []
    const productPageSize = 1000
    for (let from = 0; ; from += productPageSize) {
      const { data: page, error: productsError } = await analysisWriter
        .from('products')
        .select('*, offers(*), categories(name), subcategories(name), brands(name)')
        .range(from, from + productPageSize - 1)
      if (productsError) return res.status(500).json({ error: 'Error fetching products for analysis' })
      products.push(...(page || []))
      if (!page || page.length < productPageSize) break
    }

    const productIds = (products || []).map((product) => product.id).filter(Boolean)
    const history = []
    const historyBatchSize = 500
    for (let index = 0; index < productIds.length; index += historyBatchSize) {
      const batchIds = productIds.slice(index, index + historyBatchSize)
      const { data: batch, error: historyError } = await analysisWriter
        .from('price_history')
        .select('*')
        .in('product_id', batchIds)
        .order('observed_at', { ascending: true })
      if (historyError) {
        return res.status(503).json({
          error: 'Price analysis migration is not available',
          detail: 'Apply server/migrations/20260822_price_analysis.sql before using this endpoint',
        })
      }
      history.push(...(batch || []))
    }

    const { data: updateLogs, error: updateLogsError } = await analysisWriter
      .from('price_update_log')
      .select('updated_at, changes')
      .order('updated_at', { ascending: true })
    if (updateLogsError) console.error('Error fetching price update history', updateLogsError)

    const historyByProduct = new Map()
    const activeOfferIds = new Set((products || []).flatMap((product) => (product.offers || []).map((offer) => String(offer.id))))
    for (const point of history || []) {
      if (!point.offer_id || !activeOfferIds.has(String(point.offer_id))) continue
      const points = historyByProduct.get(String(point.product_id)) || []
      points.push(point)
      historyByProduct.set(String(point.product_id), points)
    }
    for (const update of updateLogs || []) {
      for (const change of Array.isArray(update.changes) ? update.changes : []) {
        if (!change.productId || !change.updatedCashPrice) continue
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

    const analyses = await Promise.all((products || []).map((product) => analyzeProduct(
      product,
      products || [],
      historyByProduct.get(String(product.id)) || [],
      product.categories?.name || '',
    )))

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { error: persistenceError } = await analysisWriter.from('price_analysis').insert(analyses.map((analysis) => ({
        product_id: analysis.product.id,
        status: analysis.classification,
        anomaly_score: analysis.score || 0,
        offer_score: analysis.offerScore || 0,
        confidence: analysis.confidence || 'baja',
        indicators: {
          ...analysis.indicators,
          references: analysis.references,
          dataQuality: analysis.dataQuality,
        },
      })))
      if (persistenceError) console.error('Error persisting price analysis', persistenceError)
    }

    res.json(analyses)
  } catch (error) {
    console.error('Error calculating price analysis', error)
    res.status(500).json({ error: 'Error calculating price analysis' })
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
      pairs: enrichedPairs,
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
    res.status(201).json({ success: true, decision: saved })
  } catch (error) {
    console.error('Error saving review decision', error)
    res.status(500).json({ error: 'Error saving review decision', detail: error.message || 'Unknown error' })
  }
})

app.delete('/review/cross-source-decisions', requireAdmin, async (req, res) => {
  await clearReviewDecisions()
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

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        name,
        category_id,
        brand_id,
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
        await supabase.from('products').delete().eq('id', product.id)
        return res.status(400).json({ error: 'El precio contado debe ser un número mayor que cero' })
      }
      const { data: newOffer, error: offerError } = await supabase
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
        await supabase.from('products').delete().eq('id', product.id)
        return res.status(500).json({ error: offerError.message || 'Error creating offer' })
      }
      offer = newOffer
      await recordPriceHistory({ productId: product.id, offerId: newOffer.id, cashPrice: newOffer.cash_price })
    }

    const responsePayload = { ...product, offers: offer ? [offer] : [] }
    res.json(responsePayload)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/products/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params 
    const { name, category_id, brand_id, rating, image, priceHistoryRecorded = false } = req.body || {}
    const { data, error } = await supabase
      .from('products')
      .update({ name, category_id, brand_id, rating, image })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating product', error)
      return res.status(500).json({ error: 'Error updating product' })
    }

    const updatedFields = Object.entries({ name, category_id, brand_id, rating, image })
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field)
    const { error: logError } = await analysisWriter.from('price_update_log').insert({
      admin_username: req.admin,
      filters: { source: 'product_edit', productId: id },
      percentage: 0,
      products_updated: 1,
      changes: [{ type: 'product_edit', productId: id, productName: data.name, updatedFields, priceHistoryRecorded: priceHistoryRecorded === true }],
    })
    if (logError) console.error('Error recording product update', logError)

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/products/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params 
    await supabase.from('offers').delete().eq('product_id', id)
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      console.error('Error deleting product', error)
      return res.status(500).json({ error: 'Error deleting product' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/offers', requireAdmin, async (req, res) => {
  try {
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

    const { data, error } = await supabase
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
      return res.status(500).json({ error: 'Error creating offer' })
    }

    if (!skipPriceChangeRecording) {
      await recordPriceHistory({ productId: data.product_id, offerId: data.id, cashPrice: data.cash_price })
    }

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/offers/:id', requireAdmin, async (req, res) => {
  try {
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

    const { data: previousOffer, error: previousError } = await supabase
      .from('offers')
      .select('id, product_id, cash_price, supermarket')
      .eq('id', id)
      .single()
    if (previousError) return res.status(404).json({ error: 'Oferta no encontrada' })

    const { data, error } = await supabase
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
      return res.status(500).json({ error: 'Error updating offer' })
    }

    if (!skipPriceChangeRecording) {
      await recordPriceHistory({ productId: data.product_id, offerId: data.id, cashPrice: data.cash_price, source: 'admin_edit' })
      const previousPrice = Number(previousOffer.cash_price)
      const updatedPrice = Number(data.cash_price)
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
    }

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/offers/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params 
    const { error } = await supabase.from('offers').delete().eq('id', id)
    if (error) {
      console.error('Error deleting offer', error)
      return res.status(500).json({ error: 'Error deleting offer' })
    }
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
    const { data, error } = await supabase.from('admins').select('username, password').eq('username', username).single()
    const isBcryptHash = data?.password?.startsWith('$2')
    const validPassword = data && (isBcryptHash
      ? await bcrypt.compare(password, data.password)
      : data.password === password)
    const isEmptyAdminTable = error?.code === 'PGRST116'
    const isLocalDefaultLogin = process.env.NODE_ENV !== 'production'
      && isEmptyAdminTable
      && username === (process.env.ADMIN_DEV_USERNAME || 'admin')
      && password === (process.env.ADMIN_DEV_PASSWORD || '1234')
    if (!isLocalDefaultLogin && (!data || !validPassword)) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (data && !isBcryptHash) {
      await supabase.from('admins').update({ password: await bcrypt.hash(password, 12) }).eq('username', username)
    }
    const token = createAdminToken(data?.username || username)
    if (!token) return res.status(503).json({ error: 'ADMIN_SESSION_SECRET is not configured' })
    res.json({ success: true, token })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function createCustomerAuthClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function getCustomerProfile(user) {
  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .select('username, email, role')
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

app.post('/auth/customer-register', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().toLowerCase()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    if (!/^[a-z0-9]{1,32}$/.test(username)) {
      return res.status(400).json({ error: 'El usuario debe tener solo letras y números (máximo 32).' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Ingresa un correo electrónico válido.' })
    }
    if (!/^[a-zA-Z0-9]{4,}$/.test(password)) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres alfanuméricos.' })
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
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    if (error) {
      const normalizedMessage = String(error.message || '').toLowerCase()
      if (normalizedMessage.includes('already registered') || normalizedMessage.includes('already been registered')) {
        return res.status(409).json({ error: 'Este correo ya se encuentra registrado.' })
      }
      if (normalizedMessage.includes('database error saving new user')) {
        return res.status(503).json({ error: 'No se pudo crear el perfil. Verifica la migración de perfiles en Supabase.' })
      }
      return res.status(400).json({ error: error.message || 'No se pudo crear la cuenta.' })
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
    const accessToken = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!accessToken) return res.status(401).json({ error: 'Authentication required' })
    const { data, error } = await createCustomerAuthClient().auth.getUser(accessToken)
    if (error || !data.user) return res.status(401).json({ error: 'Invalid session' })
    res.json({ user: data.user, profile: await getCustomerProfile(data.user) })
  } catch (error) {
    return sendCustomerAuthUnavailable(res, error)
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
if (process.env.DISCO_SYNC_ENABLED !== 'false') {
  setInterval(async () => {
    if (discoSyncRunning) return
    discoSyncRunning = true
    try {
      const result = await syncDiscoPrices({ database: analysisWriter, historyRecorder: recordPriceHistory })
      console.log(`Disco scheduled sync: ${result.updated.length} updated, ${result.unchanged.length} unchanged, ${result.unavailable.length} unavailable`)
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
