const database = require('../supabaseAdmin')
const { fetchDiscoProductById } = require('../services/discoImporter')
const { isDiscoScaleCorrection } = require('../priceNormalization')

async function main() {
  const { data: products, error } = await database
    .from('products')
    .select('id, name, source_product_id, offers(id, supermarket, cash_price)')
    .eq('source', 'disco')
  if (error) throw error

  let checked = 0
  let fixed = 0
  for (let start = 0; start < products.length; start += 10) {
    const batch = products.slice(start, start + 10)
    const results = await Promise.all(batch.map(async (product) => ({
      product,
      sourceProduct: await fetchDiscoProductById(product.source_product_id),
    })))

    for (const { product, sourceProduct } of results) {
      checked++
      if (!sourceProduct) {
        console.warn(`No source product returned for ${product.name}`)
        continue
      }
      const price = Number(sourceProduct.price)
      if (!sourceProduct.available || !Number.isFinite(price) || price <= 0) {
        console.warn(`Skipped unavailable or invalid source price for ${product.name}`)
        continue
      }
      for (const offer of (product.offers || []).filter((candidate) => candidate.supermarket === 'Disco')) {
        const previousPrice = Number(offer.cash_price)
        const normalizedPrice = Number(price.toFixed(2))
        if (Number(previousPrice.toFixed(2)) === normalizedPrice) continue
        const ratio = previousPrice > 0 ? Math.max(previousPrice, normalizedPrice) / Math.min(previousPrice, normalizedPrice) : 1
        const isScaleCorrection = isDiscoScaleCorrection(previousPrice, normalizedPrice)
        if (ratio >= 10 && !isScaleCorrection) {
          console.warn(`Skipped suspicious price change for ${product.name}: ${previousPrice} -> ${normalizedPrice}`)
          continue
        }
        const { error: updateError } = await database.from('offers').update({ cash_price: normalizedPrice }).eq('id', offer.id)
        if (updateError) throw updateError
        const { error: historyError } = await database.from('price_history').insert({
          product_id: product.id,
          offer_id: offer.id,
          cash_price: normalizedPrice,
          source: 'price_token_normalization',
        })
        if (historyError) throw historyError
        console.log(`${product.name}: ${previousPrice} -> ${normalizedPrice}`)
        fixed++
      }
    }
  }

  console.log(JSON.stringify({ checked, fixed }, null, 2))
}

main().catch((error) => {
  console.error('Token price sync failed:', error.message)
  process.exitCode = 1
})
