const { fetchMamiProductById } = require('./mamiImporter')

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
  historyRecorder,
  fetchProductById = fetchMamiProductById,
  concurrency = 4,
}) {
  const { data: offers, error } = await database
    .from('offers')
    .select('id, product_id, cash_price, supermarket, products!inner(id, name, source, source_product_id, source_url)')
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
    if (Number(previousPrice.toFixed(2)) === Number(price.toFixed(2))) {
      return { status: 'unchanged', productId: product.id, name: product.name }
    }

    const { error: updateError } = await database
      .from('offers')
      .update({ cash_price: price })
      .eq('id', offer.id)
    if (updateError) throw updateError

    await historyRecorder({
      productId: product.id,
      offerId: offer.id,
      cashPrice: price,
      source: 'mami_price_repair',
      throwOnError: true,
    })
    return {
      status: 'updated',
      productId: product.id,
      offerId: offer.id,
      name: product.name,
      previousCashPrice: previousPrice,
      updatedCashPrice: price,
    }
  })

  return {
    checked: candidates.length,
    updated: results.filter((result) => result.status === 'updated'),
    unchanged: results.filter((result) => result.status === 'unchanged'),
    skipped: results.filter((result) => !['updated', 'unchanged'].includes(result.status)),
  }
}

module.exports = { syncMamiLowPrices }
