import assert from 'node:assert/strict'
import test from 'node:test'
import { filterProductOffers, getProductOffers, getProductPrice } from './productOffers.js'

test('counts the primary store offer when there are no alternative stores', () => {
  const offers = getProductOffers({
    currentPrice: 2990,
    primaryStore: { id: 1, name: 'Mami' },
    otherStores: [],
  })

  assert.equal(offers.length, 1)
  assert.equal(offers[0].price, 2990)
  assert.equal(offers[0].supermarket, 'Mami')
})

test('includes and sorts the primary and alternative store offers', () => {
  const offers = getProductOffers({
    currentPrice: 3200,
    primaryStore: { id: 1, name: 'Mami' },
    primaryOffer: { id: 1, price: 2990, supermarket: 'Mami' },
    otherStores: [
      { id: 2, price: 3490, supermarket: 'Disco' },
    ],
  })

  assert.deepEqual(offers.map((offer) => offer.supermarket), ['Mami', 'Disco'])
  assert.deepEqual(offers.map((offer) => offer.price), [2990, 3490])
})

test('ignores offers without a valid price or store', () => {
  const offers = getProductOffers({
    primaryStore: { id: 1, name: 'Mami' },
    currentPrice: 0,
    otherStores: [
      { id: 2, price: 1000, supermarket: '' },
      { id: 3, price: 'invalid', supermarket: 'Disco' },
    ],
  })

  assert.deepEqual(offers, [])
})

test('uses the single filtered offer instead of a stale product-level price', () => {
  const product = { currentPrice: 285000, price: 285000 }
  const offers = [{ price: 2850, supermarket: 'Disco' }]

  assert.equal(getProductPrice(product, offers), 2850)
})

test('falls back to the product price when no valid offer is available', () => {
  assert.equal(getProductPrice({ currentPrice: 2850 }, []), 2850)
  assert.equal(getProductPrice({ currentPrice: 0, price: 1990 }, []), 1990)
  assert.equal(getProductPrice({}, []), 0)
})

test('excludes the phantom stores from the two-percent Serenisima milk comparison', () => {
  const product = {
    name: 'LECHE LA SERENISIMA PARCIALMENTE DESCREMADA CLASICA MAS LIVIANA 2% GRASA SACHET X 1 LT.',
    primaryStore: { id: 1, name: 'Becerra' },
    currentPrice: 1900,
    otherStores: [
      { id: 2, price: 1800, supermarket: 'Carrefour' },
      { id: 3, price: 2000, supermarket: 'Mami' },
      { id: 4, price: 2100, supermarket: 'Disco' },
    ],
  }

  const offers = getProductOffers(product)

  assert.equal(offers.length, 1)
  assert.equal(offers[0].supermarket, 'Disco')
  assert.equal(offers[0].price, 2100)
})

test('matches the exact compact product name shown in the comparison panel', () => {
  const product = {
    name: 'Leche Descremada La Serenísima 2sachet 1lt',
    primaryStore: { id: 1, name: 'Disco' },
    currentPrice: 2050,
    otherStores: [
      { id: 2, price: 2050, supermarket: 'Becerra' },
      { id: 3, price: 2050, supermarket: 'Carrefour' },
      { id: 4, price: 2050, supermarket: 'Mami' },
    ],
  }

  assert.deepEqual(
    getProductOffers(product).map(({ supermarket }) => supermarket),
    ['Disco'],
  )
})

test('keeps those stores for other products and filters matching source SKU variants', () => {
  const offers = [
    { id: 1, price: 1000, supermarket: 'Carrefour' },
    { id: 2, price: 1200, supermarket: 'Disco' },
    { id: 3, price: 1100, supermarket: 'Mami' },
    { id: 4, price: 1300, supermarket: 'Becerra' },
  ]

  assert.deepEqual(filterProductOffers({ name: 'Leche La Serenisima Entera 3% Sachet x 1 lt' }, offers), offers)
  assert.deepEqual(
    filterProductOffers({ source_product_id: 'prod3262764' }, offers),
    [offers[1]],
  )
})
