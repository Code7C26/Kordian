const { randomUUID } = require('crypto')
const { fetchDiscoProductById } = require('./discoImporter')
const { isDiscoScaleCorrection } = require('../priceNormalization')
const { assertCatalogWriteAllowed } = require('./catalogMaintenance')
const { requireServiceRoleDatabase } = require('./serviceRole')

let activeSync = null

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
  if (activeSync) return activeSync
  activeSync = runDiscoPriceSync(options).finally(() => {
    activeSync = null
  })
  return activeSync
}

async function runDiscoPriceSync({
  database,
  onCatalogChange = () => {},
  adminUsername = 'system',
  fetchProductById = fetchDiscoProductById,
  maxCurrentPrice = null,
  minCurrentPrice = null,
}) {
  requireServiceRoleDatabase(database)
  assertCatalogWriteAllowed('Disco')
  const { data: products, error: productsError } = await database
    .from('products')
    .select('id, name, source_product_id, offers(id, supermarket, cash_price, list_price, is_catalog_visible)')
    .eq('source', 'disco')

  if (productsError) throw productsError

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
  const results = await mapWithConcurrency(candidates, 5, async (product) => {
    if (!product.source_product_id) return { status: 'unavailable', productId: product.id, name: product.name }
    const offer = product.offers?.find((candidate) => candidate.supermarket === 'Disco')
    if (!offer) return { status: 'unavailable', productId: product.id, name: product.name }
    const current = await fetchProductById(product.source_product_id)
    if (!current) {
      return {
        status: 'unavailable',
        productId: product.id,
        name: product.name,
        hiddenOfferId: offer.id,
        visibilityChange: getVisibilityChange(offer, false),
      }
    }
    if (!current.available) {
      return {
        status: 'unavailable',
        productId: product.id,
        name: product.name,
        hiddenOfferId: offer.id,
        visibilityChange: getVisibilityChange(offer, false),
      }
    }
    const currentPrice = normalizePrice(current.price)
    if (!currentPrice || currentPrice <= 0) {
      return { status: 'unavailable', productId: product.id, name: product.name, reason: 'invalid_price' }
    }
    const previousPrice = normalizePrice(offer.cash_price)
    const sourceListPrice = normalizePrice(current.listPrice)
    const updatedListPrice = sourceListPrice && sourceListPrice > currentPrice ? sourceListPrice : null
    const previousListPrice = offer.list_price == null ? null : normalizePrice(offer.list_price)
    const listPriceChanged = previousListPrice !== updatedListPrice
    const promotionChange = listPriceChanged
      ? {
          offerId: offer.id,
          productId: product.id,
          sourceProductId: product.source_product_id,
          expectedCashPrice: currentPrice,
          previousListPrice,
          updatedListPrice,
        }
      : null
    if (previousPrice === currentPrice) {
      return {
        status: 'unchanged',
        productId: product.id,
        name: product.name,
        visibilityChange: getVisibilityChange(offer, true),
        promotionChange,
      }
    }
    const isScaleCorrection = isDiscoScaleCorrection(previousPrice, currentPrice)
    const changeRatio = previousPrice > 0
      ? Math.max(previousPrice, currentPrice) / Math.min(previousPrice, currentPrice)
      : 1
    if (changeRatio >= 10 && !isScaleCorrection) {
      return {
        status: 'suspicious',
        productId: product.id,
        name: product.name,
        previousCashPrice: previousPrice,
        sourceCashPrice: currentPrice,
        ratio: Number(changeRatio.toFixed(2)),
      }
    }
    const change = {
      status: 'updated',
      productId: product.id,
      offerId: offer.id,
      sourceProductId: product.source_product_id,
      previousCashPrice: Number(offer.cash_price),
      updatedCashPrice: currentPrice,
      listPriceChanged,
      visibilityChange: getVisibilityChange(offer, true),
      promotionChange,
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
    || promotionChanges.length || suspicious.length
    ? {
      admin_username: adminUsername,
      filters: {
        source: 'disco_sync',
        ...(maxCurrentPrice != null ? { max_current_price: maxCurrentPrice } : {}),
        ...(minCurrentPrice != null ? { min_current_price: minCurrentPrice } : {}),
        operationId,
        suspicious,
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
  if (updates.length || removals.length || visibilityChanges.length || promotionChanges.length || log) {
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

  if (updates.length || removals.length || visibilityChanges.length || promotionChanges.length) onCatalogChange()

  return {
    updated: updatedChanges,
    promotionsUpdated: promotionChanges.map(({ offerId, previousListPrice, updatedListPrice }) => ({
      offerId,
      previousListPrice,
      updatedListPrice,
    })),
    unchanged,
    unavailable,
    suspicious,
    visibilityChanges,
  }
}

module.exports = { syncDiscoPrices }
