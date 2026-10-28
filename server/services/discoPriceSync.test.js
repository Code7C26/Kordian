const assert = require('node:assert/strict')
const { test } = require('node:test')
const { syncDiscoPrices } = require('./discoPriceSync')

function createDatabase(products) {
  const updates = []
  const logs = []
  const database = {
    from(table) {
      return {
        select() {
          return {
            eq: async () => ({ data: products, error: null }),
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
        insert(values) {
          return {
            then(resolve, reject) {
              if (table === 'price_update_log') logs.push(values)
              return Promise.resolve({ error: null }).then(resolve, reject)
            },
          }
        },
      }
    },
  }
  return { database, updates, logs }
}

function productWithPrice(cashPrice) {
  return {
    id: 'product-1',
    name: 'Producto Disco',
    source: 'disco',
    source_product_id: 'source-1',
    offers: [{ id: 'offer-1', supermarket: 'Disco', cash_price: cashPrice }],
  }
}

function optionsFor(products, sourcePrice, additions = {}) {
  const state = createDatabase(products)
  const history = []
  const promise = syncDiscoPrices({
    database: state.database,
    historyRecorder: async (entry) => history.push(entry),
    fetchProductById: async () => ({ price: sourcePrice, available: true }),
    ...additions,
  })
  return { ...state, history, promise }
}

test('rounds to cents before comparing to avoid no-op price updates', async () => {
  const state = optionsFor([productWithPrice(1650)], 1650.004)
  const result = await state.promise

  assert.deepEqual(result.updated, [])
  assert.equal(result.unchanged.length, 1)
  assert.equal(state.updates.length, 0)
  assert.equal(state.history.length, 0)
})

test('skips and reports suspicious upward changes instead of persisting inflated prices', async () => {
  const state = optionsFor([productWithPrice(8613)], 861300)
  const result = await state.promise

  assert.equal(result.updated.length, 0)
  assert.equal(result.suspicious.length, 1)
  assert.equal(state.updates.length, 0)
  assert.equal(state.history.length, 0)
  assert.equal(state.logs[0].filters.suspicious.length, 1)
  assert.equal(state.logs[0].products_updated, 0)
})

test('automatically corrects a prior 100x scale inflation from the authoritative source price', async () => {
  const state = optionsFor([productWithPrice(861300)], 8613)
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].updatedCashPrice, 8613)
  assert.equal(state.updates[0].values.cash_price, 8613)
  assert.equal(state.history[0].cashPrice, 8613)
  assert.equal(state.logs[0].percentage, -99)
})

test('shares an active sync so concurrent callers cannot duplicate history writes', async () => {
  let releaseFetch
  const fetchPromise = new Promise((resolve) => {
    releaseFetch = resolve
  })
  const state = createDatabase([productWithPrice(100)])
  const options = {
    database: state.database,
    historyRecorder: async () => {},
    fetchProductById: async () => fetchPromise,
  }
  const first = syncDiscoPrices(options)
  const second = syncDiscoPrices(options)

  assert.equal(first, second)
  releaseFetch({ price: 110, available: true })
  const result = await first
  assert.equal(result.updated.length, 1)
  assert.equal(state.updates.length, 1)
})

test('does not remove an existing offer when Disco returns an invalid price', async () => {
  const state = optionsFor([productWithPrice(100)], 0)
  const result = await state.promise

  assert.equal(result.unavailable[0].reason, 'invalid_price')
  assert.equal(state.updates.length, 0)
})

test('limits low-price verification to positive offers below the configured maximum', async () => {
  const products = [
    productWithPrice(999.99),
    { ...productWithPrice(1000), id: 'product-2', source_product_id: 'source-2' },
    { ...productWithPrice(0), id: 'product-3', source_product_id: 'source-3' },
  ]
  const fetchedIds = []
  const state = optionsFor(products, 999.99, {
    maxCurrentPrice: 1000,
    fetchProductById: async (id) => {
      fetchedIds.push(id)
      return { price: 999.99, available: true }
    },
  })

  const result = await state.promise

  assert.deepEqual(fetchedIds, ['source-1'])
  assert.equal(result.unchanged.length, 1)
  assert.equal(state.updates.length, 0)
})

test('reports products without source IDs as unavailable instead of throwing', async () => {
  const product = { ...productWithPrice(100), source_product_id: null }
  const state = optionsFor([product], 110)
  const result = await state.promise

  assert.equal(result.unavailable.length, 1)
  assert.equal(result.unavailable[0].productId, 'product-1')
})

test('limits high-price verification to offers at or above the configured minimum', async () => {
  const products = [
    productWithPrice(90519),
    { ...productWithPrice(90000), id: 'product-2', source_product_id: 'source-2' },
    { ...productWithPrice(49999), id: 'product-3', source_product_id: 'source-3' },
  ]
  const fetchedIds = []
  const state = optionsFor(products, 905.19, {
    minCurrentPrice: 50000,
    fetchProductById: async (id) => {
      fetchedIds.push(id)
      return { price: id === 'source-1' ? 905.19 : 900, available: true }
    },
  })

  const result = await state.promise

  assert.deepEqual(fetchedIds, ['source-1', 'source-2'])
  assert.equal(result.updated.length, 2)
  assert.equal(state.updates[0].values.cash_price, 905.19)
  assert.equal(state.updates[1].values.cash_price, 900)
})
