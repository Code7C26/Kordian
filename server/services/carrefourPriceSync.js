const { randomUUID } = require('crypto')
const { fetchProductById, isValidGtin } = require('./carrefourImporter')
const { requireServiceRoleDatabase } = require('./serviceRole')

const SYNC_STATE_KEY = 'daily'
const DEFAULT_MAX_OFFERS_PER_RUN = 25
const MAX_OFFERS_PER_RUN = 100
const SOURCE_REQUEST_DELAY_MS = 400
let activeSync = null

function normalizePrice(value) {
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? Number(price.toFixed(2)) : null
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function loadOfferBatch(database, maxOffersPerRun) {
  const { data: syncState, error: stateError } = await database
    .from('carrefour_sync_state')
    .select('last_offer_id')
    .eq('sync_key', SYNC_STATE_KEY)
    .maybeSingle()
  if (stateError) throw stateError

  const lastOfferId = syncState?.last_offer_id ?? null
  const readPage = async (afterOfferId) => {
    let query = database
      .from('offers')
      .select('id, product_id, supermarket, source_product_id, source_sku, source_url, cash_price, list_price, products!inner(id, name, source, source_product_id, ean)')
      .eq('supermarket', 'Carrefour')
    if (afterOfferId !== null) query = query.gt('id', afterOfferId)
    return query.order('id', { ascending: true }).limit(maxOffersPerRun)
  }

  let { data: offers, error: offersError } = await readPage(lastOfferId)
  let wrapped = false
  if (!offersError && (!offers || offers.length === 0) && lastOfferId !== null) {
    const firstPage = await readPage(null)
    offers = firstPage.data
    offersError = firstPage.error
    wrapped = true
  }
  if (offersError) throw offersError
  return { offers: offers || [], lastOfferId, wrapped }
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await callback(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

function syncCarrefourPrices(options) {
  if (activeSync) return activeSync
  activeSync = runCarrefourPriceSync(options).finally(() => {
    activeSync = null
  })
  return activeSync
}

async function runCarrefourPriceSync({
  database,
  postalCode,
  onCatalogChange = () => {},
  adminUsername = 'system',
  fetchProductById: fetchById = fetchProductById,
  concurrency = 1,
  maxOffersPerRun = DEFAULT_MAX_OFFERS_PER_RUN,
  suspiciousPriceRatio = 3,
}) {
  requireServiceRoleDatabase(database)
  if (!/^[A-Z0-9]{4,8}$/i.test(String(postalCode || '').trim())) throw new TypeError('Se requiere un código postal válido')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) throw new TypeError('La concurrencia debe ser un entero entre 1 y 5')
  if (!Number.isInteger(maxOffersPerRun) || maxOffersPerRun < 1 || maxOffersPerRun > MAX_OFFERS_PER_RUN) {
    throw new TypeError(`El máximo de ofertas por ejecución debe ser un entero entre 1 y ${MAX_OFFERS_PER_RUN}`)
  }

  const { offers, lastOfferId, wrapped } = await loadOfferBatch(database, maxOffersPerRun)

  const results = await mapWithConcurrency(offers, concurrency, async (offer, index) => {
    if (index > 0) await delay(SOURCE_REQUEST_DELAY_MS)
    const product = offer.products
    const sourceProductId = String(
      offer.source_product_id
      || (product?.source === 'carrefour' ? product.source_product_id : '')
      || '',
    ).trim()
    if (!sourceProductId) {
      return { status: 'unavailable', productId: product?.id || offer.product_id, reason: 'missing_carrefour_source_id' }
    }

    let current
    try {
      current = await fetchById(sourceProductId, { postalCode })
    } catch (error) {
      return { status: 'error', productId: product?.id || offer.product_id, sourceProductId, reason: error.message }
    }
    if (!current) {
      return { status: 'unavailable', productId: product?.id || offer.product_id, sourceProductId, reason: 'not_found' }
    }
    if (String(current.sourceProductId || '') !== sourceProductId) {
      return { status: 'identity_mismatch', productId: product?.id || offer.product_id, sourceProductId }
    }
    if (current.variantCount !== 1 || String(current.sellerName || '').trim().toLowerCase() !== 'carrefour') {
      return {
        status: 'needs_review',
        productId: product?.id || offer.product_id,
        sourceProductId,
        reason: current.variantCount !== 1 ? 'ambiguous_variants' : 'unverified_seller',
      }
    }
    if (!current.sourceSku || !isValidGtin(current.ean)) {
      return {
        status: 'needs_review',
        productId: product?.id || offer.product_id,
        sourceProductId,
        reason: 'invalid_current_identity',
      }
    }
    if (product?.ean && String(product.ean) !== String(current.ean || '')) {
      return {
        status: 'identity_mismatch',
        productId: product.id,
        sourceProductId,
        reason: 'gtin_mismatch',
      }
    }
    if (current.available !== true || Number(current.stock) <= 0) {
      return { status: 'unavailable', productId: product?.id || offer.product_id, sourceProductId, reason: 'out_of_stock' }
    }

    const currentPrice = normalizePrice(current.price)
    if (!currentPrice) {
      return { status: 'unavailable', productId: product?.id || offer.product_id, sourceProductId, reason: 'invalid_price' }
    }
    const previousPrice = normalizePrice(offer.cash_price)
    if (previousPrice) {
      const ratio = Math.max(previousPrice, currentPrice) / Math.min(previousPrice, currentPrice)
      if (ratio >= suspiciousPriceRatio) {
        return {
          status: 'suspicious',
          productId: product?.id || offer.product_id,
          sourceProductId,
          previousCashPrice: previousPrice,
          sourceCashPrice: currentPrice,
          ratio: Number(ratio.toFixed(2)),
        }
      }
    }

    const nextListPrice = normalizePrice(current.listPrice)
    const listPrice = nextListPrice && nextListPrice > currentPrice ? nextListPrice : null
    const priceChanged = previousPrice !== currentPrice
    const listPriceChanged = (normalizePrice(offer.list_price) || null) !== listPrice
    const sourceSku = String(current.sourceSku).trim()
    const sourceUrl = current.sourceUrl || offer.source_url || null
    const identityChanged = offer.source_product_id !== sourceProductId
      || offer.source_sku !== sourceSku
      || (offer.source_url || null) !== sourceUrl
    if (!priceChanged && !listPriceChanged && !identityChanged) {
      return { status: 'unchanged', productId: product?.id || offer.product_id, sourceProductId }
    }

    const previousCashPrice = Number(offer.cash_price)
    const previousListPrice = offer.list_price == null ? null : Number(offer.list_price)
    const updatedCashPrice = priceChanged ? currentPrice : previousCashPrice
    const updatedListPrice = listPriceChanged
      ? listPrice
      : (offer.list_price == null ? null : Number(offer.list_price))
    const updatedSourceUrl = identityChanged ? sourceUrl : (offer.source_url ?? null)
    return {
      status: 'updated',
      productId: product?.id || offer.product_id,
      offerId: offer.id,
      sourceProductId,
      previousCashPrice,
      updatedCashPrice,
      listPriceChanged,
      priceChanged,
      identityChanged,
      syncUpdate: {
        offerId: offer.id,
        productId: product?.id || offer.product_id,
        sourceProductId,
        productSource: product?.source ?? null,
        productSourceProductId: product?.source_product_id ?? null,
        productEan: product?.ean ?? null,
        previousCashPrice,
        updatedCashPrice,
        previousListPrice,
        updatedListPrice,
        previousSourceProductId: offer.source_product_id ?? null,
        previousSourceSku: offer.source_sku ?? null,
        previousSourceUrl: offer.source_url ?? null,
        sourceSku,
        sourceUrl: updatedSourceUrl,
        priceChanged,
      },
    }
  })

  const updatedResults = results.filter((result) => result.status === 'updated')
  const updates = updatedResults.map((result) => result.syncUpdate)
  const updated = updatedResults.map((result) => {
    const publicResult = { ...result }
    delete publicResult.syncUpdate
    return publicResult
  })
  const unchanged = results.filter((result) => result.status === 'unchanged')
  const unavailable = results.filter((result) => result.status === 'unavailable')
  const suspicious = results.filter((result) => result.status === 'suspicious')
  const identityMismatch = results.filter((result) => result.status === 'identity_mismatch')
  const needsReview = results.filter((result) => result.status === 'needs_review')
  const errors = results.filter((result) => result.status === 'error')

  let nextOfferId = lastOfferId
  if (offers.length) {
    const firstErrorIndex = results.findIndex((result) => result.status === 'error')
    if (firstErrorIndex > 0) nextOfferId = offers[firstErrorIndex - 1].id
    else if (firstErrorIndex < 0) nextOfferId = offers[offers.length - 1].id
    const firstChange = updated.find((result) => result.priceChanged)
    const percentage = firstChange
      ? ((firstChange.updatedCashPrice - firstChange.previousCashPrice) / firstChange.previousCashPrice) * 100
      : 0
    const operationId = randomUUID()
    let syncError
    try {
      const response = await database.rpc('apply_catalog_carrefour_price_sync', {
        p_updates: updates,
        p_next_offer_id: nextOfferId == null ? null : Number(nextOfferId),
        p_log: {
          admin_username: adminUsername,
          filters: {
            source: 'carrefour_sync',
            postal_code: postalCode,
            operationId,
            suspicious,
            unavailable,
            identityMismatch,
            needsReview,
            errors,
          },
          percentage,
          products_updated: updated.filter((result) => result.priceChanged).length,
          changes: updated,
        },
      })
      syncError = response.error
    } catch (error) {
      syncError = error
    }
    if (syncError) {
      const wrapped = new Error(syncError.message || 'Carrefour price sync RPC failed')
      wrapped.cause = syncError
      wrapped.code = syncError.code
      wrapped.operationId = operationId
      wrapped.resultUnknown = !/^[0-9A-Z]{5}$/.test(String(syncError.code || ''))
      if (wrapped.resultUnknown) onCatalogChange()
      throw wrapped
    }
    if (updated.length) onCatalogChange()
  }

  return {
    checked: results.length,
    batchLimit: maxOffersPerRun,
    nextOfferId,
    wrapped,
    updated,
    unchanged,
    unavailable,
    suspicious,
    identityMismatch,
    needsReview,
    errors,
  }
}

module.exports = {
  DEFAULT_MAX_OFFERS_PER_RUN,
  MAX_OFFERS_PER_RUN,
  syncCarrefourPrices,
}
