const assert = require('node:assert/strict')
const { test } = require('node:test')
const { syncMamiLowPrices } = require('./mamiPriceSync')

function createDatabase(offers) {
  const rpcCalls = []
  return {
    rpcCalls,
    from() {
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
      }
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args })
      return { error: null }
    },
  }
}

function candidate({
  price = 1.19,
  listPrice = null,
  name = 'LIMON X KG.',
  sourceProductId = 'prod3390086',
} = {}) {
  return {
    id: 'offer-1',
    product_id: 'product-1',
    cash_price: price,
    list_price: listPrice,
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
  assert.equal(database.rpcCalls[0].name, 'apply_catalog_price_promotion_sync')
  assert.equal(database.rpcCalls[0].args.p_updates[0].updatedCashPrice, 3490)
  assert.deepEqual(database.rpcCalls[0].args.p_promotion_updates, [])
  assert.equal(database.rpcCalls[0].args.p_log.changes[0].updatedCashPrice, 3490)
  assert.equal(history.length, 0)
})

test('repairs a Mami price and stores its higher regular price atomically', async () => {
  const database = createDatabase([candidate()])
  const result = await syncMamiLowPrices({
    database,
    fetchProductById: async () => ({
      sourceProductId: 'prod3390086',
      name: 'LIMON X KG.',
      price: 1999,
      listPrice: 3019,
      priceEvidence: 'visible_page',
    }),
  })

  assert.equal(result.updated.length, 1)
  assert.deepEqual(result.promotionsUpdated, [{
    offerId: 'offer-1',
    previousListPrice: null,
    updatedListPrice: 3019,
  }])
  assert.equal(database.rpcCalls[0].name, 'apply_catalog_price_promotion_sync')
  assert.equal(database.rpcCalls[0].args.p_supermarket, 'Mami')
  assert.equal(database.rpcCalls[0].args.p_promotion_updates[0].expectedCashPrice, 1999)
  assert.equal(database.rpcCalls[0].args.p_promotion_updates[0].updatedListPrice, 3019)
  assert.equal(database.rpcCalls[0].args.p_log.filters.promotionChanges.length, 1)
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
  assert.equal(database.rpcCalls.length, 0)
})

test('requires a privileged database before reading or writing prices', async () => {
  await assert.rejects(syncMamiLowPrices({ database: null }), {
    code: 'SERVICE_ROLE_NOT_CONFIGURED',
    status: 503,
  })
})
