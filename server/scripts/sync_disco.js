const database = require('../supabase')
const { syncDiscoPrices } = require('../services/discoPriceSync')

async function recordPriceHistory({ productId, offerId, cashPrice, source }) {
  const { error } = await database.from('price_history').insert({
    product_id: productId,
    offer_id: offerId,
    cash_price: cashPrice,
    source,
  })
  if (error) throw error
}

syncDiscoPrices({ database, historyRecorder: recordPriceHistory })
  .then((result) => {
    console.log(JSON.stringify({
      updated: result.updated.length,
      unchanged: result.unchanged.length,
      unavailable: result.unavailable,
    }, null, 2))
  })
  .catch((error) => {
    console.error('Disco sync failed:', error.message)
    process.exitCode = 1
  })
