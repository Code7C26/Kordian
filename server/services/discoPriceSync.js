const { fetchDiscoProductById } = require('./discoImporter')
const { isDiscoScaleCorrection } = require('../priceNormalization')

let activeSync = null

function normalizePrice(value) {
  const price = Number(value)
  return Number.isFinite(price) ? Number(price.toFixed(2)) : null
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
  historyRecorder,
  onCatalogChange = () => {},
  adminUsername = 'system',
  fetchProductById = fetchDiscoProductById,
  maxCurrentPrice = null,
  minCurrentPrice = null,
}) {
  const { data: products, error: productsError } = await database
    .from('products')
    .select('id, name, source_product_id, offers(id, supermarket, cash_price)')
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
      return { status: 'unavailable', productId: product.id, name: product.name }
    }
    if (!current.available) {
      const { error: historyDeleteError } = await database.from('price_history').delete().eq('offer_id', offer.id)
      if (historyDeleteError) throw historyDeleteError
      const { error: deleteError } = await database.from('offers').delete().eq('id', offer.id)
      if (deleteError) throw deleteError
      onCatalogChange()
      return { status: 'unavailable', productId: product.id, name: product.name, removedOfferId: offer.id }
    }
    const currentPrice = normalizePrice(current.price)
    if (!currentPrice || currentPrice <= 0) {
      return { status: 'unavailable', productId: product.id, name: product.name, reason: 'invalid_price' }
    }
    const previousPrice = normalizePrice(offer.cash_price)
    if (previousPrice === currentPrice) {
      return { status: 'unchanged', productId: product.id, name: product.name }
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
    const { error: updateError } = await database.from('offers').update({ cash_price: currentPrice }).eq('id', offer.id)
    if (updateError) throw updateError
    onCatalogChange()
    await historyRecorder({ productId: product.id, offerId: offer.id, cashPrice: currentPrice, source: 'disco_sync' })
    return {
      status: 'updated',
      productId: product.id,
      offerId: offer.id,
      previousCashPrice: previousPrice,
      updatedCashPrice: currentPrice,
    }
  })
  const updated = results.filter((result) => result.status === 'updated')
  const unchanged = results.filter((result) => result.status === 'unchanged')
  const unavailable = results.filter((result) => result.status === 'unavailable')
  const suspicious = results.filter((result) => result.status === 'suspicious')

  if (updated.length || suspicious.length) {
    const firstChange = updated[0]
    const percentage = firstChange?.previousCashPrice > 0
      ? ((firstChange.updatedCashPrice - firstChange.previousCashPrice) / firstChange.previousCashPrice) * 100
      : 0
    const { error: logError } = await database.from('price_update_log').insert({
      admin_username: adminUsername,
      filters: {
        source: 'disco_sync',
        ...(maxCurrentPrice != null ? { max_current_price: maxCurrentPrice } : {}),
        ...(minCurrentPrice != null ? { min_current_price: minCurrentPrice } : {}),
        suspicious,
      },
      percentage,
      products_updated: updated.length,
      changes: updated,
    })
    if (logError) throw logError
  }

  return { updated, unchanged, unavailable, suspicious }
}

module.exports = { syncDiscoPrices }
