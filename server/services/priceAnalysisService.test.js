const assert = require('node:assert/strict')
const { test } = require('node:test')
const { filterKnownPriceScaleArtifacts } = require('./priceAnalysisService')

test('excludes known 100x Disco scale artifacts from current-price analysis history', () => {
  const product = {
    offers: [{ id: 'disco-offer', supermarket: 'Disco', cash_price: 8613 }],
  }
  const history = [
    { offer_id: 'disco-offer', cash_price: 8613 },
    { offer_id: 'disco-offer', cash_price: 861300 },
    { offer_id: 'other-offer', cash_price: 861300 },
  ]

  assert.deepEqual(filterKnownPriceScaleArtifacts(history, product), [history[0], history[2]])
})

test('keeps ordinary historical price changes', () => {
  const product = {
    offers: [{ id: 'disco-offer', supermarket: 'Disco', cash_price: 9000 }],
  }
  const history = [
    { offer_id: 'disco-offer', cash_price: 8613 },
    { offer_id: 'disco-offer', cash_price: 9000 },
  ]

  assert.deepEqual(filterKnownPriceScaleArtifacts(history, product), history)
})

test('normalizes low-scale Mami offers and their history to pesos', () => {
  const product = {
    source: 'mami',
    offers: [{ id: 'mami-offer', supermarket: 'Mami', cash_price: 3.49 }],
  }
  const history = [{ offer_id: 'mami-offer', cash_price: 3.49 }]

  assert.equal(filterKnownPriceScaleArtifacts(history, product).length, 1)
  assert.equal(require('../priceNormalization').normalizeDiscoStoredPrice(product.offers[0].cash_price, product.source), 3490)
})
