const assert = require('node:assert/strict')
const { test } = require('node:test')
const { syncDiscoPrices } = require('./discoPriceSync')

function createDatabase(products) {
  const rpcCalls = []
  const logs = []
  const visibilityUpdates = []
  const database = {
    from(table) {
      if (table === 'offers') {
        return {
          update(values) {
            return {
              in(column, ids) {
                assert.equal(column, 'id')
                return {
                  eq(filterColumn, filterValue) {
                    assert.equal(filterColumn, 'supermarket')
                    assert.equal(filterValue, 'Disco')
                    return {
                      select: async () => {
                        visibilityUpdates.push({ values, ids })
                        return { data: ids.map((id) => ({ id })), error: null }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      return {
        select() {
          return {
            eq: async () => ({ data: products, error: null }),
          }
        },
      }
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args })
      if (args.p_log) logs.push(args.p_log)
      return { error: null }
    },
  }
  return { database, rpcCalls, logs, visibilityUpdates }
}

function productWithPrice(cashPrice) {
  return {
    id: 'product-1',
    name: 'Producto Disco',
    source: 'disco',
    source_product_id: 'source-1',
    offers: [{ id: 'offer-1', supermarket: 'Disco', cash_price: cashPrice, list_price: null }],
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
  assert.equal(state.rpcCalls.length, 0)
  assert.equal(state.history.length, 0)
})

test('syncs a promotional and regular price together', async () => {
  const state = optionsFor([productWithPrice(100)], 90, {
    fetchProductById: async () => ({ price: 90, listPrice: 120, available: true }),
  })
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.deepEqual(result.promotionsUpdated, [{
    offerId: 'offer-1',
    previousListPrice: null,
    updatedListPrice: 120,
  }])
  assert.deepEqual(state.rpcCalls.map(({ name }) => name), ['apply_catalog_price_promotion_sync'])
  assert.equal(state.rpcCalls[0].args.p_supermarket, 'Disco')
  assert.equal(state.rpcCalls[0].args.p_source, 'disco_sync')
  assert.equal(state.rpcCalls[0].args.p_updates[0].updatedCashPrice, 90)
  assert.equal(state.rpcCalls[0].args.p_promotion_updates[0].expectedCashPrice, 90)
  assert.equal(state.rpcCalls[0].args.p_promotion_updates[0].updatedListPrice, 120)
  assert.equal(state.logs[0].filters.promotionChanges.length, 1)
})

test('clears a stale regular price when the current Disco price is no longer promotional', async () => {
  const product = productWithPrice(100)
  product.offers[0].list_price = 120
  const state = optionsFor([product], 100, {
    fetchProductById: async () => ({ price: 100, listPrice: 100, available: true }),
  })
  const result = await state.promise

  assert.deepEqual(result.promotionsUpdated, [{
    offerId: 'offer-1',
    previousListPrice: 120,
    updatedListPrice: null,
  }])
  assert.deepEqual(state.rpcCalls.map(({ name }) => name), ['apply_catalog_price_promotion_sync'])
  assert.equal(state.rpcCalls[0].args.p_promotion_updates[0].updatedListPrice, null)
  assert.equal(state.history.length, 0)
})

test('skips and reports suspicious upward changes instead of persisting inflated prices', async () => {
  const state = optionsFor([productWithPrice(8613)], 861300)
  const result = await state.promise

  assert.equal(result.updated.length, 0)
  assert.equal(result.suspicious.length, 1)
  assert.equal(state.rpcCalls.length, 1)
  assert.equal(state.history.length, 0)
  assert.equal(state.logs[0].filters.suspicious.length, 1)
  assert.equal(state.logs[0].products_updated, 0)
})

test('automatically corrects a prior 100x scale inflation from the authoritative source price', async () => {
  const state = optionsFor([productWithPrice(861300)], 8613)
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].updatedCashPrice, 8613)
  assert.equal(state.rpcCalls[0].name, 'apply_catalog_price_promotion_sync')
  assert.equal(state.rpcCalls[0].args.p_updates[0].updatedCashPrice, 8613)
  assert.equal(state.logs[0].filters.source, 'disco_sync')
  assert.equal(state.logs[0].percentage, -99)
})

test('corrects a Disco token-scale price when normal price changes move the ratio beyond five percent', async () => {
  const state = optionsFor([productWithPrice(285000)], 2700)
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].updatedCashPrice, 2700)
  assert.equal(state.rpcCalls[0].args.p_updates[0].updatedCashPrice, 2700)
})

test('shares an active sync so concurrent callers cannot duplicate history writes', async () => {
  let releaseFetch
  const fetchPromise = new Promise((resolve) => {
    releaseFetch = resolve
  })
  const state = createDatabase([productWithPrice(100)])
  const options = {
    database: state.database,
    fetchProductById: async () => fetchPromise,
  }
  const first = syncDiscoPrices(options)
  const second = syncDiscoPrices(options)

  assert.equal(first, second)
  releaseFetch({ price: 110, available: true })
  const result = await first
  assert.equal(result.updated.length, 1)
  assert.equal(state.rpcCalls.length, 1)
})

test('does not remove an existing offer when Disco returns an invalid price', async () => {
  const state = optionsFor([productWithPrice(100)], 0)
  const result = await state.promise

  assert.equal(result.unavailable[0].reason, 'invalid_price')
  assert.equal(state.rpcCalls.length, 0)
})

test('hides an unavailable offer without deleting it and restores it when a valid price returns', async () => {
  const unavailableProduct = productWithPrice(72)
  unavailableProduct.offers[0].is_catalog_visible = true
  const hiddenState = optionsFor([unavailableProduct], null, {
    fetchProductById: async () => ({ available: false }),
  })
  const hiddenResult = await hiddenState.promise

  assert.equal(hiddenResult.unavailable[0].hiddenOfferId, 'offer-1')
  assert.deepEqual(hiddenState.visibilityUpdates, [{
    values: { is_catalog_visible: false },
    ids: ['offer-1'],
  }])
  assert.deepEqual(hiddenState.rpcCalls[0].args.p_updates, [])
  assert.deepEqual(hiddenState.rpcCalls[0].args.p_promotion_updates, [])
  assert.deepEqual(hiddenState.rpcCalls[0].args.p_removals, [])

  const hiddenProduct = productWithPrice(72)
  hiddenProduct.offers[0].is_catalog_visible = false
  const restoredState = optionsFor([hiddenProduct], 72)
  const restoredResult = await restoredState.promise

  assert.equal(restoredResult.unchanged.length, 1)
  assert.deepEqual(restoredState.visibilityUpdates, [{
    values: { is_catalog_visible: true },
    ids: ['offer-1'],
  }])
  assert.equal(restoredState.rpcCalls[0].name, 'apply_catalog_price_promotion_sync')
})

test('hides a Disco offer when its source product cannot be found', async () => {
  const product = productWithPrice(72)
  const state = optionsFor([product], null, {
    fetchProductById: async () => null,
  })

  const result = await state.promise

  assert.equal(result.unavailable[0].hiddenOfferId, 'offer-1')
  assert.deepEqual(state.visibilityUpdates, [{
    values: { is_catalog_visible: false },
    ids: ['offer-1'],
  }])
})

test('requires a privileged database before reading or writing prices', async () => {
  await assert.rejects(syncDiscoPrices({ database: null }), {
    code: 'SERVICE_ROLE_NOT_CONFIGURED',
    status: 503,
  })
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
  assert.equal(state.rpcCalls.length, 0)
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
  assert.equal(state.rpcCalls[0].args.p_updates.length, 2)
  assert.equal(state.rpcCalls[0].args.p_updates[0].updatedCashPrice, 905.19)
  assert.equal(state.rpcCalls[0].args.p_updates[1].updatedCashPrice, 900)
})
