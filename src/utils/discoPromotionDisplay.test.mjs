import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyDiscoPromotionToOffers,
  applyDiscoPromotionToProduct,
} from './discoPromotionDisplay.js'

test('uses the verified Disco promotion and reference price for displayed offers', () => {
  const offers = [
    { id: 'disco', supermarket: 'Disco', price: 2300, listPrice: null },
    { id: 'mami', supermarket: 'Mami', price: 2100, listPrice: null },
  ]

  const displayedOffers = applyDiscoPromotionToOffers(offers, {
    promotionPrice: 1837.5,
    referencePrice: 2450,
  })

  assert.deepEqual(displayedOffers.map(({ id, price, listPrice }) => ({ id, price, listPrice })), [
    { id: 'disco', price: 1837.5, listPrice: 2450 },
    { id: 'mami', price: 2100, listPrice: null },
  ])
  assert.equal(offers[0].price, 2300)
})

test('does not replace prices when the promotion values are invalid', () => {
  const offers = [{ supermarket: 'Disco', price: 2300, listPrice: null }]

  assert.equal(applyDiscoPromotionToOffers(offers, {
    promotionPrice: 2450,
    referencePrice: 2300,
  }), offers)
})

test('updates the catalog primary offer when a Disco promotion becomes available', () => {
  const product = {
    currentPrice: 2300,
    primaryStore: { id: 'disco', name: 'Disco', listPrice: null },
    primaryOffer: { id: 'disco', supermarket: 'Disco', price: 2300, listPrice: null },
    otherStores: [{ id: 'mami', supermarket: 'Mami', price: 2100, listPrice: null }],
  }

  const promotedProduct = applyDiscoPromotionToProduct(product, {
    promotionPrice: 1837.5,
    referencePrice: 2450,
  })

  assert.equal(promotedProduct.currentPrice, 1837.5)
  assert.equal(promotedProduct.primaryOffer.id, 'disco')
  assert.equal(promotedProduct.primaryOffer.listPrice, 2450)
  assert.equal(promotedProduct.otherStores[0].id, 'mami')
  assert.equal(product.currentPrice, 2300)
})
