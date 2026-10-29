const assert = require('node:assert/strict')
const { test } = require('node:test')
const { normalizeProduct, extractVisibleMamiPrice, extractMamiDetailProductsFromHtml } = require('./mamiImporter')

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
