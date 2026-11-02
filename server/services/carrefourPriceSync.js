const { fetchProductById, isValidGtin } = require('./carrefourImporter')

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
  historyRecorder,
  postalCode,
  onCatalogChange = () => {},
  adminUsername = 'system',
  fetchProductById: fetchById = fetchProductById,
  concurrency = 1,
  maxOffersPerRun = DEFAULT_MAX_OFFERS_PER_RUN,
  suspiciousPriceRatio = 3,
}) {
  if (!database || typeof database.from !== 'function') throw new TypeError('Se requiere una base de datos para sincronizar Carrefour')
  if (typeof historyRecorder !== 'function') throw new TypeError('Se requiere un registrador de historial de precios')
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

    const { error: updateError } = await database
      .from('offers')
      .update({
        cash_price: currentPrice,
        list_price: listPrice,
        source_product_id: sourceProductId,
        source_sku: sourceSku,
        source_url: sourceUrl,
      })
      .eq('id', offer.id)
    if (updateError) throw updateError

    if (priceChanged) {
      await historyRecorder({
        productId: product?.id || offer.product_id,
        offerId: offer.id,
        cashPrice: currentPrice,
        source: 'carrefour_sync',
        scheduleStatusRefresh: false,
        throwOnError: true,
      })
    }
    onCatalogChange()
    return {
      status: 'updated',
      productId: product?.id || offer.product_id,
      offerId: offer.id,
      sourceProductId,
      previousCashPrice: previousPrice,
      updatedCashPrice: currentPrice,
      listPriceChanged,
      priceChanged,
      identityChanged,
    }
  })

  const updated = results.filter((result) => result.status === 'updated')
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
    const { error: stateUpdateError } = await database
      .from('carrefour_sync_state')
      .upsert({
        sync_key: SYNC_STATE_KEY,
        last_offer_id: nextOfferId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'sync_key' })
    if (stateUpdateError) throw stateUpdateError
  }

  if (offers.length) {
    const firstChange = updated.find((result) => result.previousCashPrice && result.updatedCashPrice)
    const percentage = firstChange
      ? ((firstChange.updatedCashPrice - firstChange.previousCashPrice) / firstChange.previousCashPrice) * 100
      : 0
    const { error: logError } = await database.from('price_update_log').insert({
      admin_username: adminUsername,
      filters: { source: 'carrefour_sync', postal_code: postalCode, suspicious, unavailable, identityMismatch, needsReview, errors },
      percentage,
      products_updated: updated.filter((result) => result.previousCashPrice !== result.updatedCashPrice).length,
      changes: updated,
    })
    if (logError) throw logError
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
