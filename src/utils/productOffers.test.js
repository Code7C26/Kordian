import assert from 'node:assert/strict'
import test from 'node:test'
import { getProductOffers } from './productOffers.js'

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
