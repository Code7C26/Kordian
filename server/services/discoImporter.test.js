const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  createDiscoPromotionFetcher,
  normalizeDiscoProduct,
  parseDiscoPromotionFromHtml,
} = require('./discoImporter')

const promotionHtml = (overrides = {}) => `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Product',
  ean: '7896004009162',
  name: 'Papas Pringles Crema y Cebolla 109 g',
  offers: {
    '@type': 'Offer',
    price: 3300,
    priceCurrency: 'ARS',
    priceValidUntil: '2026-11-03',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      priceType: 'https://schema.org/ListPrice',
      price: 6600,
    },
  },
  ...overrides,
})}</script>`

function priceToken(price) {
  const payload = Buffer.from(JSON.stringify({ data: { price } })).toString('base64url')
  return `header.${payload}.signature`
}

function productWithPrice({ name, price, tokenPrice }) {
  return normalizeDiscoProduct({
    productId: 'disco-1',
    productName: name,
    brand: 'Disco',
    categories: ['Electrodomésticos'],
    items: [{
      itemId: 'sku-1',
      ean: '7790000000001',
      sellers: [{
        sellerName: 'Disco',
        commertialOffer: {
          IsAvailable: true,
          Price: price,
          PriceToken: priceToken(tokenPrice),
          ListPrice: price,
          AvailableQuantity: 1,
        },
      }],
    }],
  })
}

test('uses VTEX Price instead of a token 100 times higher for a durable product', () => {
  const product = productWithPrice({
    name: 'Heladera No Frost 300 L',
    price: 8613,
    tokenPrice: 861300,
  })

  assert.equal(product.price, 8613)
})

test('uses the raw Disco price when PriceToken stores the value at 100x scale', () => {
  const product = productWithPrice({
    name: 'Bolsas Para Horno Mostaza Y Miel 30 Grs Alicante',
    price: 2700,
    tokenPrice: 270000,
  })

  assert.equal(product.price, 2700)
})

test('uses the token to corroborate a 100x scale correction only for a low raw price', () => {
  const product = productWithPrice({
    name: 'Gaseosa Cola 1.25 L',
    price: 86.13,
    tokenPrice: 8613,
  })

  assert.equal(product.price, 8613)
})

test('does not apply the durable-product multiplier to ordinary raw prices', () => {
  const product = productWithPrice({
    name: 'Microondas 20 L',
    price: 861.3,
    tokenPrice: 86130,
  })

  assert.equal(product.price, 861.3)
})

test('uses the raw price when a product price token is 100 times higher', () => {
  const product = productWithPrice({
    name: 'Yogur Yogs Bebible Entero Banana 900g',
    price: 905.19,
    tokenPrice: 90519,
  })

  assert.equal(product.price, 905.19)
})

test('extracts a Disco promotional price and reference price without verifying purchase conditions', () => {
  assert.deepEqual(
    parseDiscoPromotionFromHtml(promotionHtml(), '7896004009162', Date.parse('2026-11-03T12:00:00Z')),
    {
      promotionPrice: 3300,
      referencePrice: 6600,
      conditionsVerified: false,
      validUntil: '2026-11-03',
    },
  )
})

test('does not use a promotion for a different product EAN or an expired promotion', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  assert.equal(parseDiscoPromotionFromHtml(promotionHtml(), '7790000000001', now), null)
  assert.equal(
    parseDiscoPromotionFromHtml(promotionHtml({ offers: { price: 3300, priceValidUntil: '2026-11-02', listPrice: 6600 } }), '7896004009162', now),
    null,
  )
})

test('caches the public product-page request and rejects URLs outside Disco', async () => {
  let fetchCount = 0
  const fetchPromotion = createDiscoPromotionFetcher({
    fetchImpl: async () => {
      fetchCount += 1
      return { ok: true, text: async () => promotionHtml() }
    },
    now: () => Date.parse('2026-11-03T12:00:00Z'),
  })

  const first = await fetchPromotion('https://www.disco.com.ar/papas-pringles/p?utm_source=test', '7896004009162')
  const second = await fetchPromotion('https://www.disco.com.ar/papas-pringles/p', '7896004009162')

  assert.deepEqual(first, second)
  assert.equal(fetchCount, 1)
  await assert.rejects(
    fetchPromotion('https://example.com/papas-pringles/p', '7896004009162'),
    /ficha de producto de Disco/,
  )
})
