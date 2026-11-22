import assert from 'node:assert/strict'
import test from 'node:test'
import { filterDisplayPriceHistory } from './priceHistoryDisplay.js'

test('filters stale 100x points and technical normalization records from visible history', () => {
  const history = [
    { offerId: 551, avgPrice: 1100, date: '2026-08-30' },
    { offerId: 551, avgPrice: 110000, date: '2026-09-07' },
    { offerId: 551, avgPrice: 1100, date: '2026-09-09' },
    { offerId: 552, avgPrice: 1100, source: 'price_token_normalization' },
    { offerId: 553, avgPrice: 11000, date: '2026-09-08' },
  ]
  const offers = [
    { id: 551, price: 1100 },
    { id: 552, price: 1100 },
    { id: 553, price: 1100 },
  ]

  assert.deepEqual(filterDisplayPriceHistory(history, offers), [history[0], history[2], history[4]])
})

test('filters Mami 1000x scale artifacts while retaining unrelated offers', () => {
  const history = [
    { offer_id: 'mami-offer', cash_price: 3490000 },
    { offer_id: 'other-offer', cash_price: 3490000 },
  ]
  const offers = [{ id: 'mami-offer', cash_price: 3490 }]

  assert.deepEqual(filterDisplayPriceHistory(history, offers), [history[1]])
})
