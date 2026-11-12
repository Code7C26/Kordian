const database = require('../supabaseAdmin')

function decodePriceToken(token) {
  if (typeof token !== 'string') return null
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString())
    const price = Number(payload?.data?.price)
    return Number.isFinite(price) && price > 0 ? price : null
  } catch {
    return null
  }
}

async function getSourcePrice(sourceProductId) {
  const response = await fetch(`https://www.disco.com.ar/api/catalog_system/pub/products/search?fq=productId:${sourceProductId}&_from=0&_to=0`)
  if (!response.ok) return null
  const data = await response.json()
  const sellers = (data[0]?.items || []).flatMap((item) => item.sellers || [])
  return decodePriceToken(sellers[0]?.commertialOffer?.PriceToken)
}

async function main() {
  const { data: products, error } = await database
    .from('products')
    .select('id, name, source_product_id, offers(id, cash_price)')
    .eq('source', 'disco')
  if (error) throw error

  let checked = 0
  let fixed = 0
  for (let start = 0; start < products.length; start += 10) {
    const batch = products.slice(start, start + 10)
    const results = await Promise.all(batch.map(async (product) => ({
      product,
      price: await getSourcePrice(product.source_product_id).catch(() => null),
    })))

    for (const { product, price } of results) {
      checked++
      if (!price) continue
      for (const offer of product.offers || []) {
        const previousPrice = Number(offer.cash_price)
        if (previousPrice === price) continue
        const { error: updateError } = await database.from('offers').update({ cash_price: price }).eq('id', offer.id)
        if (updateError) throw updateError
        const { error: historyError } = await database.from('price_history').insert({
          product_id: product.id,
          offer_id: offer.id,
          cash_price: price,
          source: 'price_token_normalization',
        })
        if (historyError) throw historyError
        console.log(`${product.name}: ${previousPrice} -> ${price}`)
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
