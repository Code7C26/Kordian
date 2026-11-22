const assert = require('node:assert/strict')
const { test } = require('node:test')
const { analyzeProduct, filterKnownPriceScaleArtifacts } = require('./priceAnalysisService')

test('duplicate offers from one supermarket do not count as independent market evidence', async () => {
  const product = {
    id: 1,
    name: 'Producto de prueba 500 ml',
    source: 'test',
    offers: [
      { id: 1, supermarket: 'Tienda A', cash_price: 900 },
      { id: 2, supermarket: 'Tienda A', cash_price: 1000 },
    ],
  }

  const result = await analyzeProduct(product, [product], [], 'Alimentos')

  assert.equal(result.dataQuality.supermarkets, 1)
  assert.equal(result.classification, 'INFORMACION_INSUFICIENTE')
})

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

test('excludes price token normalization records from analysis history', () => {
  const product = {
    offers: [{ id: 'disco-offer', supermarket: 'Disco', cash_price: 1100 }],
  }
  const history = [
    { offer_id: 'disco-offer', cash_price: 1100, source: 'disco_public_search' },
    { offer_id: 'disco-offer', cash_price: 110000, source: 'price_token_normalization' },
  ]

  assert.deepEqual(filterKnownPriceScaleArtifacts(history, product), [history[0]])
})

test('excludes normalization records even when there is no current offer price', () => {
  const history = [
    { offer_id: 'disco-offer', cash_price: 1100, source: 'disco_public_search' },
    { offer_id: 'disco-offer', cash_price: 110000, source: 'price_token_normalization' },
  ]

  assert.deepEqual(filterKnownPriceScaleArtifacts(history, { offers: [] }), [history[0]])
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
