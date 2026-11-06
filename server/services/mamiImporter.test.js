const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  normalizeProduct,
  extractVisibleMamiPrice,
  extractMamiDetailProductsFromHtml,
  fetchPreview: fetchMamiPreview,
} = require('./mamiImporter')

test('reads the visible Mami retail price rather than the lower schema price', () => {
  const html = `
    <script type="application/ld+json">
      {"@type":"Product","productID":"2390086000000","name":"limon x kg.","image":"https://example.com/limon.jpg","offers":{"price":"3.49"}}
    </script>
    <title>LIMON X KG. | Super MaMi</title>
    <script>productId = "prod3390086"</script>
    <div class="precio-unidad"><span>$3,490.00</span> x kg.</div>
  `
  const parsed = extractMamiDetailProductsFromHtml(
    html,
    'https://www.supermami.com.ar/super/producto/limon-x-kg/_/A-3390086-3390086-s',
  )

  assert.equal(extractVisibleMamiPrice(html), 3490)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].price, 3490)
  assert.equal(parsed[0].sourceProductId, 'prod3390086')
})

test('converts Mami structured low prices when the visible retail price is unavailable', () => {
  const product = normalizeProduct({
    sourceProductId: 'prod123',
    name: 'Yogur Bebible',
    price: 3.49,
    sourceUrl: 'https://www.supermami.com.ar/super/producto/yogur',
  })

  assert.equal(product.price, 3490)
})

test('parses both Argentine and decimal Mami price formats', () => {
  assert.equal(extractVisibleMamiPrice('<div class="precio-unidad">$1.234,56 x kg.</div>'), 1234.56)
  assert.equal(extractVisibleMamiPrice('<div class="precio-unidad">$3490.00 x kg.</div>'), 3490)
})

test('bounds Mami query detail fetches to the requested result page and records timing', async () => {
  const originalFetch = global.fetch
  const originalDetailBatchSize = process.env.MAMI_DETAIL_BATCH_SIZE
  process.env.MAMI_DETAIL_BATCH_SIZE = '1'
  const productRoutes = [1, 2, 3].map((index) => `/super/producto/product-${index}`)
  const homeHtml = productRoutes.map((route) => `<a href="${route}">Producto</a>`).join('')
  const requests = []
  global.fetch = async (url) => {
    const requestUrl = String(url)
    requests.push(requestUrl)
    const productId = requestUrl.split('/').pop()
    const body = requestUrl.includes('/super/home')
      ? homeHtml
      : `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Product',
        productID: productId,
        name: `Producto ${productId}`,
        brand: 'Marca',
        category: 'Almacén',
        image: 'https://example.com/product.jpg',
        offers: { price: 3490 },
      })}</script>`
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } })
  }

  try {
    const report = await fetchMamiPreview({ query: 'producto', from: 0, to: 1 })
    assert.equal(report.sourceRead.detailRouteCount, 2)
    assert.equal(requests.length, 3)
    assert.equal(report.products.length, 2)
    assert.ok(report.sourceRead.timingsMs.discovery >= 0)
    assert.ok(report.sourceRead.timingsMs.detailFetch >= 0)
    assert.ok(report.sourceRead.timingsMs.total >= 0)
  } finally {
    global.fetch = originalFetch
    if (originalDetailBatchSize === undefined) delete process.env.MAMI_DETAIL_BATCH_SIZE
    else process.env.MAMI_DETAIL_BATCH_SIZE = originalDetailBatchSize
  }
})
