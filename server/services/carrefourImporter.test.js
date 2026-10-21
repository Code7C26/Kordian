const assert = require('node:assert/strict')
const test = require('node:test')
const {
  createCarrefourImporter,
  findCarrefourLocalMatch,
  getCarrefourProductInvalidReason,
  isValidCarrefourProduct,
  isValidGtin,
  normalizeCarrefourProduct,
  normalizePostalCode,
} = require('./carrefourImporter')

function makeCarrefourProduct({
  productId = '719377',
  ean = '7791337007253',
  price = 8210,
  available = true,
  quantity = 10,
  items = null,
} = {}) {
  return {
    productId,
    productName: 'Leche chocolatada Cindor 1 lt',
    brand: 'Cindor',
    categories: ['/Lácteos/Leches saborizadas/'],
    link: 'https://www.carrefour.com.ar/leche-cindor-719377/p',
    items: items || [{
      itemId: '141554',
      ean,
      images: [{ imageUrl: 'https://carrefourar.vteximg.com.br/arquivos/7791337007253.jpg' }],
      sellers: [{
        sellerName: 'CARREFOUR',
        commertialOffer: {
          Price: price,
          ListPrice: 9000,
          IsAvailable: available,
          AvailableQuantity: quantity,
        },
      }],
    }],
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    json: async () => body,
  }
}

test('normalizes a single available Carrefour SKU without applying store-specific price scaling', () => {
  const product = normalizeCarrefourProduct(makeCarrefourProduct())
  assert.equal(product.source, 'carrefour')
  assert.equal(product.sourceProductId, '719377')
  assert.equal(product.sourceSku, '141554')
  assert.equal(product.ean, '7791337007253')
  assert.equal(product.price, 8210)
  assert.equal(product.listPrice, 9000)
  assert.equal(product.available, true)
  assert.equal(product.stock, 10)
  assert.equal(product.sourceCategory, 'Leches saborizadas')
  assert.equal(product.sourceUrl, 'https://www.carrefour.com.ar/leche-cindor-719377/p')
  assert.equal(isValidCarrefourProduct(product), true)
})

test('rejects unavailable products, invalid GTINs, and ambiguous multi-SKU products', () => {
  const unavailable = normalizeCarrefourProduct(makeCarrefourProduct({ available: false, quantity: 0 }))
  assert.equal(getCarrefourProductInvalidReason(unavailable), 'Sin stock disponible para la zona consultada')

  const marketplaceSeller = makeCarrefourProduct()
  marketplaceSeller.items[0].sellers[0].sellerName = 'Marketplace Vendor'
  const unverifiedSeller = normalizeCarrefourProduct(marketplaceSeller)
  assert.equal(getCarrefourProductInvalidReason(unverifiedSeller), 'Vendedor de Carrefour no verificado')

  const invalidGtin = normalizeCarrefourProduct(makeCarrefourProduct({ ean: '1234567890123' }))
  assert.equal(getCarrefourProductInvalidReason(invalidGtin), 'Sin EAN/GTIN válido')

  const multiSku = normalizeCarrefourProduct(makeCarrefourProduct({
    items: [
      makeCarrefourProduct().items[0],
      { ...makeCarrefourProduct().items[0], itemId: '141555', ean: '7791337007260' },
    ],
  }))
  assert.equal(getCarrefourProductInvalidReason(multiSku), 'Producto con variantes múltiples; requiere revisión manual')
})

test('validates postal codes and GTIN check digits', () => {
  assert.equal(normalizePostalCode(' 5186 '), '5186')
  assert.equal(normalizePostalCode('A5000'), 'A5000')
  assert.equal(normalizePostalCode('18'), '')
  assert.equal(normalizePostalCode('123456789'), '')
  assert.equal(isValidGtin('7791337007253'), true)
  assert.equal(isValidGtin('7791337007254'), false)
})

test('matches only a unique exact Carrefour source ID or EAN and rejects conflicts', () => {
  const item = normalizeCarrefourProduct(makeCarrefourProduct())
  const existing = { id: 42, source: 'mami', source_product_id: 'mami-1', ean: item.ean }
  assert.equal(findCarrefourLocalMatch(item, [existing]).product, existing)
  assert.equal(findCarrefourLocalMatch(item, [existing]).matchedBy, 'ean')

  const duplicateEan = { id: 43, source: 'disco', source_product_id: 'disco-1', ean: item.ean }
  assert.equal(findCarrefourLocalMatch(item, [existing, duplicateEan]).ambiguous, true)

  const sourceConflict = {
    id: 44,
    source: 'carrefour',
    source_product_id: item.sourceProductId,
    ean: '7791337007260',
  }
  assert.equal(findCarrefourLocalMatch(item, [sourceConflict]).ambiguous, true)
})

test('uses the resolved postal-code region for a bounded preview', async () => {
  const requestedUrls = []
  const importer = createCarrefourImporter({
    fetchImpl: async (url) => {
      requestedUrls.push(new URL(url))
      if (String(url).includes('/api/checkout/pub/regions')) {
        return jsonResponse([{ id: 'v2.region-for-5186' }])
      }
      return jsonResponse([makeCarrefourProduct()])
    },
  })

  const preview = await importer.fetchPreview({ query: 'leche', postalCode: '5186' })
  assert.equal(preview.postalCode, '5186')
  assert.equal(preview.products.length, 1)
  assert.equal(preview.discarded.length, 0)
  assert.equal(requestedUrls.length, 2)
  assert.equal(requestedUrls[1].searchParams.get('regionId'), 'v2.region-for-5186')
  assert.equal(requestedUrls[1].searchParams.get('_to'), '19')
})

test('does not fall back to an unregionalized price when Carrefour blocks region lookup', async () => {
  let requestCount = 0
  const importer = createCarrefourImporter({
    fetchImpl: async () => {
      requestCount += 1
      return jsonResponse({}, 403)
    },
  })

  await assert.rejects(
    importer.fetchPreview({ query: 'leche', postalCode: '5186' }),
    /Carrefour respondió HTTP 403/,
  )
  assert.equal(requestCount, 1)
})
