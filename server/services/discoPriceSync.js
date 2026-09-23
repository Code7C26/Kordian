const { fetchDiscoProductById } = require('./discoImporter')

async function syncDiscoPrices({ database, historyRecorder, adminUsername = 'system' }) {
  const { data: products, error: productsError } = await database
    .from('products')
    .select('id, name, source_product_id, offers(id, supermarket, cash_price)')
    .eq('source', 'disco')

  if (productsError) throw productsError

  const updated = []
  const unchanged = []
  const unavailable = []
  for (const product of products || []) {
    if (!product.source_product_id) continue
    const current = await fetchDiscoProductById(product.source_product_id)
    const offer = product.offers?.find((candidate) => candidate.supermarket === 'Disco')
    if (!current || !offer || current.price <= 0) {
      unavailable.push({ productId: product.id, name: product.name })
      continue
    }
    const previousPrice = Number(offer.cash_price)
    if (previousPrice === current.price) {
      unchanged.push({ productId: product.id, name: product.name })
      continue
    }
    const { error: updateError } = await database.from('offers').update({ cash_price: current.price }).eq('id', offer.id)
    if (updateError) throw updateError
    await historyRecorder({ productId: product.id, offerId: offer.id, cashPrice: current.price, source: 'disco_sync' })
    updated.push({ productId: product.id, offerId: offer.id, previousCashPrice: previousPrice, updatedCashPrice: current.price })
  }

  if (updated.length) {
    const { error: logError } = await database.from('price_update_log').insert({
      admin_username: adminUsername,
      filters: { source: 'disco_sync' },
      percentage: 0,
      products_updated: updated.length,
      changes: updated,
    })
    if (logError) throw logError
  }

  return { updated, unchanged, unavailable }
}

module.exports = { syncDiscoPrices }
