const assert = require('node:assert/strict')
const { test } = require('node:test')
const { syncMamiLowPrices } = require('./mamiPriceSync')

function createDatabase(offers) {
  const updates = []
  return {
    updates,
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    lt: async () => ({ data: offers, error: null }),
                  }
                },
              }
            },
          }
        },
        update(values) {
          return {
            eq: async (_column, id) => {
              updates.push({ table, id, values })
              return { error: null }
            },
          }
        },
      }
    },
  }
}

function candidate({ price = 1.19, name = 'LIMON X KG.', sourceProductId = 'prod3390086' } = {}) {
  return {
    id: 'offer-1',
    product_id: 'product-1',
    cash_price: price,
    supermarket: 'Mami',
    products: {
      id: 'product-1',
      name,
      source: 'mami',
      source_product_id: sourceProductId,
      source_url: 'https://www.supermami.com.ar/super/producto/limon-x-kg/_/A-3390086-3390086-s',
    },
  }
}

test('repairs only a visible source price with matching product identity', async () => {
  const database = createDatabase([candidate()])
  const history = []
  const result = await syncMamiLowPrices({
    database,
    historyRecorder: async (entry) => history.push(entry),
    fetchProductById: async () => ({
      sourceProductId: 'prod3390086',
      name: 'LIMON X KG.',
      price: 3490,
      priceEvidence: 'visible_page',
    }),
  })

  assert.equal(result.updated.length, 1)
  assert.equal(database.updates[0].values.cash_price, 3490)
  assert.equal(history[0].cashPrice, 3490)
})

test('does not alter prices without visible price evidence or matching identity', async () => {
  const database = createDatabase([candidate(), candidate({ name: 'YERBA MATE' })])
  const result = await syncMamiLowPrices({
    database,
    historyRecorder: async () => {},
    fetchProductById: async (_id, url) => url.includes('limon')
      ? { sourceProductId: 'prod3390086', name: 'LIMON X KG.', price: 3490, priceEvidence: 'structured_data' }
      : { sourceProductId: 'prod3390086', name: 'LIMON X KG.', price: 3490, priceEvidence: 'visible_page' },
  })

  assert.equal(result.updated.length, 0)
  assert.equal(result.skipped.length, 2)
  assert.equal(database.updates.length, 0)
})
