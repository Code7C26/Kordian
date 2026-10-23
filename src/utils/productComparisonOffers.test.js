import assert from 'node:assert/strict'
import test from 'node:test'
import { addProductComparisonOffers } from './productComparisonOffers.js'

test('adds the requested local offers and preserves the Disco price', () => {
  const product = { id: 18075, name: 'Gaseosa Cola Sabor Original 1.25 Lts Coca Cola' }
  const offers = addProductComparisonOffers(product, [
    { id: 5668, supermarket: 'Disco', cash_price: 3600 },
  ])

  assert.deepEqual(
    offers.map(({ supermarket, cash_price }) => [supermarket, cash_price]),
    [
      ['Disco', 3600],
      ['Becerra', 3700],
      ['Mami', 3500],
      ['Carrefour', 3400],
    ],
  )
})

test('does not change other products and avoids duplicate local stores', () => {
  const product = { id: 18075, name: 'Gaseosa Cola Sabor Original 1.25 Lts Coca Cola' }
  const offers = addProductComparisonOffers(product, [
    { id: 5668, supermarket: 'Disco', cash_price: 3600 },
    { id: 1, supermarket: 'Becerra', cash_price: 3800 },
  ])

  assert.equal(offers.filter((offer) => offer.supermarket === 'Becerra').length, 1)
  assert.equal(offers.find((offer) => offer.supermarket === 'Becerra').cash_price, 3700)
  assert.deepEqual(addProductComparisonOffers({ ean: 'another-product' }, offers), offers)
  assert.deepEqual(
    addProductComparisonOffers({ name: 'Gaseosa Cola Sabor Original 1.25 Lts Coca Cola' }, [
      { id: 5668, supermarket: 'Disco', cash_price: 3600 },
    ]).map((offer) => offer.supermarket),
    ['Disco', 'Becerra', 'Mami', 'Carrefour'],
  )
})
