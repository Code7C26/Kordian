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
          const query = {
            eq() {
              return query
            },
            order() {
              return query
            },
            range(from, to) {
              return Promise.resolve({ data: products.slice(from, to + 1), error: null })
            },
          }
          return query
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
    ean: '7791234567898',
    offers: [{ id: 'offer-1', supermarket: 'Disco', cash_price: cashPrice, list_price: null }],
  }
}

function optionsFor(products, sourcePrice, additions = {}) {
  const state = createDatabase(products)
  const history = []
  const promise = syncDiscoPrices({
    database: state.database,
    historyRecorder: async (entry) => history.push(entry),
    fetchProductById: async () => ({ price: sourcePrice, available: true, ean: '7791234567898' }),
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
    fetchProductById: async () => ({ price: 90, listPrice: 120, available: true, ean: '7791234567898' }),
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
    fetchProductById: async () => ({ price: 100, listPrice: 100, available: true, ean: '7791234567898' }),
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

test('clears and reports an excessive source list price without changing the cash price', async () => {
  const product = productWithPrice(1050)
  product.offers[0].list_price = 86777
  const listPriceWarning = {
    reason: 'list_price_ratio_exceeds_limit',
    cashPrice: 1050,
    maximumRatio: 10,
    rejectedPrices: [{ field: 'ListPrice', value: 86777, ratio: 82.64 }],
  }
  const state = optionsFor([product], 1050, {
    fetchProductById: async () => ({
      price: 1050,
      listPrice: 0,
      listPriceWarning,
      available: true,
      ean: '7791234567898',
    }),
  })
  const result = await state.promise

  assert.deepEqual(result.promotionsUpdated, [{
    offerId: 'offer-1',
    previousListPrice: 86777,
    updatedListPrice: null,
  }])
  assert.equal(result.updated.length, 0)
  assert.equal(result.listPriceWarnings.length, 1)
  assert.equal(result.listPriceWarnings[0].reason, 'list_price_ratio_exceeds_limit')
  assert.equal(state.rpcCalls[0].args.p_updates.length, 0)
  assert.equal(state.rpcCalls[0].args.p_promotion_updates[0].updatedListPrice, null)
  assert.equal(
    state.rpcCalls[0].args.p_promotion_updates[0].listPriceWarning.rejectedPrices[0].value,
    86777,
  )
})

test('continues reporting an excessive source list price after the stored reference is cleared', async () => {
  const state = optionsFor([productWithPrice(1050)], 1050, {
    dryRun: true,
    fetchProductById: async () => ({
      price: 1050,
      listPrice: 0,
      listPriceWarning: {
        reason: 'list_price_ratio_exceeds_limit',
        cashPrice: 1050,
        maximumRatio: 10,
        rejectedPrices: [{ field: 'ListPrice', value: 86777, ratio: 82.64 }],
      },
      available: true,
      ean: '7791234567898',
    }),
  })
  const result = await state.promise

  assert.equal(result.listPriceWarnings.length, 1)
  assert.deepEqual(result.proposed.promotions, [])
  assert.equal(state.rpcCalls.length, 0)
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

test('accepts the reviewed 89.47x Disco scale correction when the EAN matches', async () => {
  const state = optionsFor([productWithPrice(85000)], 950)
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].updatedCashPrice, 950)
})

test('corrects a Disco token-scale price when normal price changes move the ratio beyond five percent', async () => {
  const state = optionsFor([productWithPrice(285000)], 2700)
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].updatedCashPrice, 2700)
  assert.equal(state.rpcCalls[0].args.p_updates[0].updatedCashPrice, 2700)
})

test('does not correct a scale price when the current source EAN conflicts', async () => {
  const state = optionsFor([productWithPrice(85000)], 950, {
    fetchProductById: async () => ({ price: 950, available: true, ean: '7790000000000' }),
  })
  const result = await state.promise

  assert.equal(result.updated.length, 0)
  assert.equal(result.identityMismatch[0].reason, 'ean_mismatch')
  assert.deepEqual(state.visibilityUpdates, [{
    values: { is_catalog_visible: false },
    ids: ['offer-1'],
  }])
})

test('dry-run reports proposed writes without making any database or cache changes', async () => {
  let catalogChanges = 0
  const state = optionsFor([productWithPrice(85000)], 950, {
    dryRun: true,
    onCatalogChange: () => { catalogChanges += 1 },
    fetchProductById: async () => ({
      price: 950,
      listPrice: 1200,
      available: true,
      ean: '7791234567898',
    }),
  })
  const result = await state.promise

  assert.equal(result.dryRun, true)
  assert.equal(result.scanned, 1)
  assert.deepEqual(result.updated, [])
  assert.equal(result.proposed.updates.length, 1)
  assert.equal(result.proposed.updates[0].updatedCashPrice, 950)
  assert.equal(result.proposed.promotions.length, 1)
  assert.equal(result.proposed.promotions[0].expectedCashPrice, 950)
  assert.equal(result.proposed.promotions[0].productEan, '7791234567898')
  assert.equal(result.proposed.promotions[0].sourceEan, '7791234567898')
  assert.equal(state.rpcCalls.length, 0)
  assert.deepEqual(state.visibilityUpdates, [])
  assert.equal(catalogChanges, 0)
})

test('dry-run records source fetch errors and continues the audit', async () => {
  const state = optionsFor([productWithPrice(100)], 100, {
    dryRun: true,
    fetchProductById: async () => { throw new Error('source unavailable') },
  })
  const result = await state.promise

  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].reason, 'source unavailable')
  assert.equal(state.rpcCalls.length, 0)
})

test('loads every page when the Disco catalog exceeds the database page limit', async () => {
  const products = Array.from({ length: 1001 }, (_, index) => ({
    ...productWithPrice(100),
    id: index + 1,
    source_product_id: `source-${index + 1}`,
    offers: [{
      id: index + 1,
      supermarket: 'Disco',
      cash_price: 100,
      list_price: null,
      is_catalog_visible: true,
    }],
  }))
  const state = optionsFor(products, 100, {
    dryRun: true,
    fetchProductById: async () => ({ price: 100, available: true, ean: '7791234567898' }),
  })

  const result = await state.promise

  assert.equal(result.scanned, 1001)
  assert.equal(result.unchanged.length, 1001)
  assert.equal(state.rpcCalls.length, 0)
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

test('hides an offer when Disco marks it available but reports zero stock', async () => {
  const state = optionsFor([productWithPrice(72)], null, {
    fetchProductById: async () => ({ available: true, stock: 0 }),
  })
  const result = await state.promise

  assert.equal(result.unavailable[0].reason, 'out_of_stock')
  assert.deepEqual(state.visibilityUpdates, [{
    values: { is_catalog_visible: false },
    ids: ['offer-1'],
  }])
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
      return {
        price: id === 'source-1' ? 905.19 : 900,
        available: true,
        ean: '7791234567898',
      }
    },
  })

  const result = await state.promise

  assert.deepEqual(fetchedIds, ['source-1', 'source-2'])
  assert.equal(result.updated.length, 2)
  assert.equal(state.rpcCalls[0].args.p_updates.length, 2)
  assert.equal(state.rpcCalls[0].args.p_updates[0].updatedCashPrice, 905.19)
  assert.equal(state.rpcCalls[0].args.p_updates[1].updatedCashPrice, 900)
})
