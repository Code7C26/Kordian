const assert = require('node:assert/strict')
const { test } = require('node:test')
const { normalizeDiscoProduct } = require('./discoImporter')

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
