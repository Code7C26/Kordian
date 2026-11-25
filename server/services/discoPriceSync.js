const { randomUUID } = require('crypto')
const { fetchDiscoProductById } = require('./discoImporter')
const { isDiscoScaleCorrection } = require('../priceNormalization')
const { assertCatalogWriteAllowed } = require('./catalogMaintenance')
const { requireServiceRoleDatabase } = require('./serviceRole')

let activeSync = null
const PRODUCT_PAGE_SIZE = 1000

function wrapPriceSyncRpcError(error, operationId) {
  const wrapped = new Error(error?.message || 'Price sync RPC failed')
  wrapped.cause = error
  wrapped.code = error?.code
  wrapped.operationId = operationId
  wrapped.resultUnknown = !/^[0-9A-Z]{5}$/.test(String(error?.code || ''))
  return wrapped
}

function normalizePrice(value) {
  const price = Number(value)
  return Number.isFinite(price) ? Number(price.toFixed(2)) : null
}

function normalizeEan(value) {
  const ean = String(value || '').replace(/\D/g, '')
  return ean || null
}

function getVisibilityChange(offer, isCatalogVisible) {
  const currentlyVisible = offer.is_catalog_visible !== false
  if (currentlyVisible === isCatalogVisible) return null
  return { offerId: offer.id, isCatalogVisible }
}

function withoutInternalChanges(result) {
  const cleaned = { ...result }
  delete cleaned.syncChange
  delete cleaned.visibilityChange
  delete cleaned.promotionChange
  return cleaned
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await callback(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

function syncDiscoPrices(options) {
  const dryRun = Boolean(options?.dryRun)
  if (activeSync) {
    if (activeSync.dryRun === dryRun) return activeSync.promise
    return activeSync.promise.then(() => syncDiscoPrices(options))
  }
  const entry = { dryRun, promise: null }
  entry.promise = runDiscoPriceSync(options).finally(() => {
    if (activeSync === entry) activeSync = null
  })
  activeSync = entry
  return entry.promise
}

async function loadDiscoProducts(database) {
  const products = []
  for (let offset = 0; ; offset += PRODUCT_PAGE_SIZE) {
    const { data, error } = await database
      .from('products')
      .select('id, name, source_product_id, ean, offers(id, supermarket, cash_price, list_price, is_catalog_visible)')
      .eq('source', 'disco')
      .order('id', { ascending: true })
      .range(offset, offset + PRODUCT_PAGE_SIZE - 1)

    if (error) throw error
    const page = data || []
    products.push(...page)
    if (page.length < PRODUCT_PAGE_SIZE) return products
  }
}

async function runDiscoPriceSync({
  database,
  onCatalogChange = () => {},
  adminUsername = 'system',
  fetchProductById = fetchDiscoProductById,
  maxCurrentPrice = null,
  minCurrentPrice = null,
  dryRun = false,
  concurrency = 5,
}) {
  requireServiceRoleDatabase(database)
  if (!dryRun) assertCatalogWriteAllowed('Disco')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) {
    throw new TypeError('La concurrencia debe ser un entero entre 1 y 5')
  }
  const products = await loadDiscoProducts(database)

  const candidates = (products || []).filter((product) => {
    const hasMaximum = maxCurrentPrice != null && Number.isFinite(Number(maxCurrentPrice))
    const hasMinimum = minCurrentPrice != null && Number.isFinite(Number(minCurrentPrice))
    if (!hasMaximum && !hasMinimum) return true

    const offer = product.offers?.find((candidate) => candidate.supermarket === 'Disco')
    if (!offer || Number(offer.cash_price) <= 0) return false

    const price = Number(offer.cash_price)
    if (hasMaximum && price >= Number(maxCurrentPrice)) return false
    if (hasMinimum && price < Number(minCurrentPrice)) return false
    return true
  })
  const results = await mapWithConcurrency(candidates, concurrency, async (product) => {
    if (!product.source_product_id) {
      return { status: 'unavailable', productId: product.id, name: product.name, reason: 'missing_source_product_id' }
    }
    const offer = product.offers?.find((candidate) => candidate.supermarket === 'Disco')
    if (!offer) {
      return { status: 'unavailable', productId: product.id, name: product.name, reason: 'missing_disco_offer' }
    }
    let current
    try {
      current = await fetchProductById(product.source_product_id)
    } catch (error) {
      if (!dryRun) throw error
      return {
        status: 'error',
        productId: product.id,
        name: product.name,
        offerId: offer.id,
        previousCashPrice: Number(offer.cash_price),
        sourceProductId: product.source_product_id,
        reason: error?.message || String(error),
      }
    }
    if (!current) {
      return {
        status: 'unavailable',
        productId: product.id,
        name: product.name,
        sourceProductId: product.source_product_id,
        reason: 'source_product_not_found',
        hiddenOfferId: offer.id,
        visibilityChange: getVisibilityChange(offer, false),
      }
    }
    const localEan = normalizeEan(product.ean)
    const sourceEan = normalizeEan(current.ean)
    const sourceProductId = String(current.sourceProductId || '').trim()
    if ((sourceProductId && sourceProductId !== String(product.source_product_id))
      || (localEan && sourceEan && localEan !== sourceEan)) {
      return {
        status: 'identity_mismatch',
        productId: product.id,
        name: product.name,
        sourceName: current.name || null,
        sourceProductId: product.source_product_id,
        productEan: localEan,
        sourceEan,
        reason: sourceProductId && sourceProductId !== String(product.source_product_id)
          ? 'source_product_id_mismatch'
          : 'ean_mismatch',
        visibilityChange: getVisibilityChange(offer, false),
      }
    }
    if (!current.available || (current.stock != null && Number(current.stock) <= 0)) {
      return {
        status: 'unavailable',
        productId: product.id,
        name: product.name,
        sourceProductId: product.source_product_id,
        reason: 'out_of_stock',
        hiddenOfferId: offer.id,
        visibilityChange: getVisibilityChange(offer, false),
      }
    }
    const currentPrice = normalizePrice(current.price)
    if (!currentPrice || currentPrice <= 0) {
      return {
        status: 'unavailable',
        productId: product.id,
        name: product.name,
        sourceProductId: product.source_product_id,
        reason: 'invalid_price',
      }
    }
    const previousPrice = normalizePrice(offer.cash_price)
    const sourceListPrice = normalizePrice(current.listPrice)
    const updatedListPrice = sourceListPrice && sourceListPrice > currentPrice ? sourceListPrice : null
    const listPriceWarning = current.listPriceWarning
      ? {
          productId: product.id,
          name: product.name,
          sourceProductId: product.source_product_id,
          ...current.listPriceWarning,
        }
      : null
    const previousListPrice = offer.list_price == null ? null : normalizePrice(offer.list_price)
    const listPriceChanged = previousListPrice !== updatedListPrice
    const promotionChange = listPriceChanged
      ? {
          offerId: offer.id,
          productId: product.id,
          sourceName: current.name || null,
          sourceProductId: product.source_product_id,
          productEan: localEan,
          sourceEan,
          expectedCashPrice: currentPrice,
          previousListPrice,
          updatedListPrice,
          ...(listPriceWarning ? { listPriceWarning } : {}),
        }
      : null
    if (previousPrice === currentPrice) {
      return {
        status: 'unchanged',
        productId: product.id,
        name: product.name,
        visibilityChange: getVisibilityChange(offer, true),
        promotionChange,
        listPriceWarning,
      }
    }
    const isScaleCorrection = isDiscoScaleCorrection(previousPrice, currentPrice)
    const eanVerified = Boolean(localEan && sourceEan && localEan === sourceEan)
    const changeRatio = previousPrice > 0
      ? Math.max(previousPrice, currentPrice) / Math.min(previousPrice, currentPrice)
      : 1
    if (changeRatio >= 10 && (!isScaleCorrection || !eanVerified)) {
      return {
        status: 'suspicious',
        productId: product.id,
        name: product.name,
        sourceName: current.name || null,
        sourceProductId: product.source_product_id,
        previousCashPrice: previousPrice,
        sourceCashPrice: currentPrice,
        ratio: Number(changeRatio.toFixed(2)),
        reason: isScaleCorrection ? 'scale_correction_requires_matching_ean' : 'price_change_ratio',
        productEan: localEan,
        sourceEan,
      }
    }
    const change = {
      status: 'updated',
      productId: product.id,
      name: product.name,
      offerId: offer.id,
      sourceName: current.name || null,
      sourceProductId: product.source_product_id,
      productEan: localEan,
      sourceEan,
      previousCashPrice: Number(offer.cash_price),
      updatedCashPrice: currentPrice,
      listPriceChanged,
      visibilityChange: getVisibilityChange(offer, true),
      promotionChange,
      listPriceWarning,
    }
    return {
      ...change,
      syncChange: {
        offerId: offer.id,
        productId: product.id,
        sourceProductId: product.source_product_id,
        previousCashPrice: Number(offer.cash_price),
        updatedCashPrice: currentPrice,
      },
    }
  })
  const updated = results.filter((result) => result.status === 'updated')
  const updatedChanges = updated.map(withoutInternalChanges)
  const unchanged = results.filter((result) => result.status === 'unchanged').map(withoutInternalChanges)
  const unavailable = results.filter((result) => result.status === 'unavailable').map(withoutInternalChanges)
  const suspicious = results.filter((result) => result.status === 'suspicious')
  const identityMismatch = results.filter((result) => result.status === 'identity_mismatch')
  const errors = results.filter((result) => result.status === 'error')
  const listPriceWarnings = results
    .map((result) => result.listPriceWarning)
    .filter(Boolean)
  const updates = updated.map((result) => result.syncChange)
  const removals = unavailable.map((result) => result.removal).filter(Boolean)
  const visibilityChanges = results
    .map((result) => result.visibilityChange)
    .filter(Boolean)
  const promotionChanges = results
    .map((result) => result.promotionChange)
    .filter(Boolean)
  const operationId = randomUUID()

  const log = updated.length || removals.length || visibilityChanges.length
    || promotionChanges.length || suspicious.length || identityMismatch.length
    ? {
      admin_username: adminUsername,
      filters: {
        source: 'disco_sync',
        ...(maxCurrentPrice != null ? { max_current_price: maxCurrentPrice } : {}),
        ...(minCurrentPrice != null ? { min_current_price: minCurrentPrice } : {}),
        operationId,
        suspicious,
        identityMismatch: identityMismatch.map(withoutInternalChanges),
        removedOffers: removals,
        visibilityChanges,
        promotionChanges,
      },
      percentage: updated[0]?.previousCashPrice > 0
        ? ((updated[0].updatedCashPrice - updated[0].previousCashPrice) / updated[0].previousCashPrice) * 100
        : 0,
      products_updated: updated.length,
      changes: updatedChanges,
    }
    : null
  if (!dryRun && (updates.length || removals.length || visibilityChanges.length || promotionChanges.length || log)) {
    assertCatalogWriteAllowed('Disco')
    const { error } = await database.rpc('apply_catalog_price_promotion_sync', {
      p_supermarket: 'Disco',
      p_source: 'disco_sync',
      p_updates: updates,
      p_promotion_updates: promotionChanges,
      p_removals: removals,
      p_log: log,
    })
    if (error) throw wrapPriceSyncRpcError(error, operationId)
  }

  if (!dryRun) {
    for (const isCatalogVisible of [false, true]) {
      const offerIds = visibilityChanges
        .filter((change) => change.isCatalogVisible === isCatalogVisible)
        .map((change) => change.offerId)
      if (!offerIds.length) continue

      const { data, error } = await database
        .from('offers')
        .update({ is_catalog_visible: isCatalogVisible })
        .in('id', offerIds)
        .eq('supermarket', 'Disco')
        .select('id')
      if (error) throw error
      if ((data || []).length !== offerIds.length) {
        throw new Error('Disco offer visibility update did not affect every expected offer')
      }
    }
  }

  if (!dryRun && (updates.length || removals.length || visibilityChanges.length || promotionChanges.length)) {
    onCatalogChange()
  }

  return {
    dryRun,
    scanned: candidates.length,
    updated: dryRun ? [] : updatedChanges,
    promotionsUpdated: dryRun ? [] : promotionChanges.map(({ offerId, previousListPrice, updatedListPrice }) => ({
      offerId,
      previousListPrice,
      updatedListPrice,
    })),
    ...(dryRun ? {
      proposed: {
        updates: updatedChanges,
        promotions: promotionChanges,
        visibilityChanges,
      },
    } : {}),
    unchanged,
    unavailable,
    suspicious,
    identityMismatch: identityMismatch.map(withoutInternalChanges),
    errors: errors.map(withoutInternalChanges),
    listPriceWarnings,
    visibilityChanges: dryRun ? [] : visibilityChanges,
  }
}

module.exports = { syncDiscoPrices }
