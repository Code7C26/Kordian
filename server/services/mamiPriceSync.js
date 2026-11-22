const { randomUUID } = require('crypto')
const { fetchMamiProductById } = require('./mamiImporter')
const { assertCatalogWriteAllowed } = require('./catalogMaintenance')
const { requireServiceRoleDatabase } = require('./serviceRole')

function wrapPriceSyncRpcError(error, operationId) {
  const wrapped = new Error(error?.message || 'Price sync RPC failed')
  wrapped.cause = error
  wrapped.code = error?.code
  wrapped.operationId = operationId
  wrapped.resultUnknown = !/^[0-9A-Z]{5}$/.test(String(error?.code || ''))
  return wrapped
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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

async function syncMamiLowPrices({
  database,
  adminUsername = 'system',
  fetchProductById = fetchMamiProductById,
  concurrency = 4,
}) {
  requireServiceRoleDatabase(database)
  assertCatalogWriteAllowed('Mami')
  const { data: offers, error } = await database
    .from('offers')
    .select('id, product_id, cash_price, list_price, supermarket, products!inner(id, name, source, source_product_id, source_url)')
    .eq('supermarket', 'Mami')
    .eq('products.source', 'mami')
    .lt('cash_price', 100)

  if (error) throw error

  const candidates = (offers || []).filter((offer) => Number(offer.cash_price) > 0)
  const results = await mapWithConcurrency(candidates, concurrency, async (offer) => {
    const product = offer.products
    const current = await fetchProductById(product.source_product_id, product.source_url)
    if (!current) return { status: 'unavailable', productId: product.id, name: product.name }
    if (current.priceEvidence !== 'visible_page') {
      return { status: 'missing_visible_price', productId: product.id, name: product.name }
    }
    if (String(current.sourceProductId) !== String(product.source_product_id)
      || normalizeText(current.name) !== normalizeText(product.name)) {
      return { status: 'identity_mismatch', productId: product.id, name: product.name }
    }

    const price = Number(current.price)
    if (!Number.isFinite(price) || price < 100) {
      return { status: 'invalid_price', productId: product.id, name: product.name }
    }

    const previousPrice = Number(offer.cash_price)
    const priceChanged = Number(previousPrice.toFixed(2)) !== Number(price.toFixed(2))
    const sourceListPrice = Number(current.listPrice)
    const updatedListPrice = Number.isFinite(sourceListPrice) && sourceListPrice > price
      ? Number(sourceListPrice.toFixed(2))
      : null
    const previousListPrice = offer.list_price == null
      ? null
      : Number(Number(offer.list_price).toFixed(2))
    const listPriceChanged = previousListPrice !== updatedListPrice
    const promotionChange = listPriceChanged
      ? {
          offerId: offer.id,
          productId: product.id,
          sourceProductId: product.source_product_id,
          expectedCashPrice: price,
          previousListPrice,
          updatedListPrice,
        }
      : null

    if (!priceChanged) {
      return {
        status: 'unchanged',
        productId: product.id,
        name: product.name,
        promotionChange,
      }
    }

    return {
      status: 'updated',
      productId: product.id,
      offerId: offer.id,
      sourceProductId: product.source_product_id,
      name: product.name,
      previousCashPrice: Number(offer.cash_price),
      updatedCashPrice: price,
      promotionChange,
    }
  })

  const updated = results.filter((result) => result.status === 'updated')
  const promotionChanges = results
    .map((result) => result.promotionChange)
    .filter(Boolean)
  if (updated.length || promotionChanges.length) {
    assertCatalogWriteAllowed('Mami')
    const operationId = randomUUID()
    const firstChange = updated[0]
    const percentage = firstChange?.previousCashPrice > 0
      ? ((firstChange.updatedCashPrice - firstChange.previousCashPrice) / firstChange.previousCashPrice) * 100
      : 0
    const log = updated.length
      ? {
          admin_username: adminUsername,
          filters: {
            source: 'mami_price_repair',
            operationId,
            promotionChanges,
          },
          percentage,
          products_updated: updated.length,
          changes: updated,
        }
      : null
    const { error } = await database.rpc('apply_catalog_price_promotion_sync', {
      p_supermarket: 'Mami',
      p_source: 'mami_price_repair',
      p_updates: updated.map((change) => ({
        offerId: change.offerId,
        productId: change.productId,
        sourceProductId: change.sourceProductId,
        previousCashPrice: change.previousCashPrice,
        updatedCashPrice: change.updatedCashPrice,
      })),
      p_promotion_updates: promotionChanges,
      p_removals: [],
      p_log: log,
    })
    if (error) throw wrapPriceSyncRpcError(error, operationId)
  }

  return {
    checked: candidates.length,
    updated,
    promotionsUpdated: promotionChanges.map(({ offerId, previousListPrice, updatedListPrice }) => ({
      offerId,
      previousListPrice,
      updatedListPrice,
    })),
    unchanged: results.filter((result) => result.status === 'unchanged'),
    skipped: results.filter((result) => !['updated', 'unchanged'].includes(result.status)),
  }
}

module.exports = { syncMamiLowPrices }
