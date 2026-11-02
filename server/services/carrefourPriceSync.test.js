const assert = require('node:assert/strict')
const test = require('node:test')
const { syncCarrefourPrices } = require('./carrefourPriceSync')

function createDatabase(offers) {
  const updates = []
  const logs = []
  const state = { last_offer_id: null }
  const queries = []
  const database = {
    from(table) {
      return {
        select() {
          if (table === 'carrefour_sync_state') {
            return {
              eq: () => ({
                maybeSingle: async () => ({ data: { ...state }, error: null }),
              }),
            }
          }
          let afterId = null
          const query = {
            gt(_column, id) {
              afterId = id
              return query
            },
            order(_column, options) {
              return {
                limit: async (count) => {
                  const sorted = [...offers].sort((a, b) => compareIds(a.id, b.id))
                  const filtered = sorted.filter((offer) => afterId === null || compareIds(offer.id, afterId) > 0)
                  queries.push({ afterId, limit: count, ascending: options.ascending })
                  return { data: filtered.slice(0, count), error: null }
                },
              }
            },
          }
          return { eq: () => query }
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
          return Promise.resolve().then(() => {
            if (table === 'price_update_log') logs.push(values)
            return { error: null }
          })
        },
        upsert(values) {
          Object.assign(state, values)
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { database, updates, logs, state, queries }
}

function compareIds(left, right) {
  return BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0
}

function makeOffer(overrides = {}) {
  return {
    id: 1,
    product_id: 'product-1',
    supermarket: 'Carrefour',
    source_product_id: '122140',
    source_sku: '9547',
    source_url: 'https://www.carrefour.com.ar/producto-122140/p',
    cash_price: 100,
    list_price: 120,
    products: {
      id: 'product-1',
      name: 'Producto Carrefour',
      source: 'carrefour',
      source_product_id: '122140',
      ean: '7798033333907',
    },
    ...overrides,
  }
}

function makeCurrent(overrides = {}) {
  return {
    sourceProductId: '122140',
    sourceSku: '9547',
    sourceUrl: 'https://www.carrefour.com.ar/producto-122140/p',
    ean: '7798033333907',
    variantCount: 1,
    sellerName: 'CARREFOUR',
    price: 110,
    listPrice: 125,
    available: true,
    stock: 5,
    ...overrides,
  }
}

function runSync(offers, current, additions = {}) {
  const state = createDatabase(offers)
  const history = []
  let catalogChanges = 0
  const promise = syncCarrefourPrices({
    database: state.database,
    historyRecorder: async (entry) => history.push(entry),
    postalCode: '5186',
    fetchProductById: async () => current,
    onCatalogChange: () => { catalogChanges += 1 },
    ...additions,
  })
  return { ...state, history, get catalogChanges() { return catalogChanges }, promise }
}

test('refreshes current regional prices and records price history', async () => {
  const state = runSync([makeOffer()], makeCurrent())
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].updatedCashPrice, 110)
  assert.equal(state.updates[0].values.cash_price, 110)
  assert.equal(state.updates[0].values.list_price, 125)
  assert.equal(state.updates[0].values.source_product_id, '122140')
  assert.equal(state.history[0].source, 'carrefour_sync')
  assert.equal(state.catalogChanges, 1)
  assert.equal(state.logs[0].filters.postal_code, '5186')
})

test('uses saved product identity for legacy Carrefour offers but does not guess identity for other sources', async () => {
  const legacy = makeOffer({ source_product_id: null, source_sku: null, source_url: null })
  const state = runSync([
    legacy,
    makeOffer({
      id: 2,
      product_id: 'product-2',
      source_product_id: null,
      products: { id: 'product-2', source: 'disco', source_product_id: 'disco-42', ean: '7798033333907' },
    }),
  ], makeCurrent())
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.unavailable[0].reason, 'missing_carrefour_source_id')
  assert.equal(state.updates.length, 1)
  assert.equal(state.updates[0].values.source_product_id, '122140')
})

test('does not update an offer when GTIN identity conflicts', async () => {
  const state = runSync([makeOffer()], makeCurrent({ ean: '7791337007253' }))
  const result = await state.promise

  assert.equal(result.identityMismatch.length, 1)
  assert.equal(result.identityMismatch[0].reason, 'gtin_mismatch')
  assert.equal(state.updates.length, 0)
  assert.equal(state.history.length, 0)
})

test('requires a current real GTIN and SKU before refreshing a price', async () => {
  const state = runSync([makeOffer()], makeCurrent({ ean: '7791337007254', sourceSku: '' }))
  const result = await state.promise

  assert.equal(result.needsReview[0].reason, 'invalid_current_identity')
  assert.equal(state.updates.length, 0)
  assert.equal(state.history.length, 0)
})

test('leaves unavailable offers unchanged and reports them for review', async () => {
  const state = runSync([makeOffer()], makeCurrent({ available: false, stock: 0 }))
  const result = await state.promise

  assert.equal(result.unavailable[0].reason, 'out_of_stock')
  assert.equal(state.updates.length, 0)
  assert.equal(state.history.length, 0)
})

test('does not overwrite prices when official price changes by the suspicious threshold', async () => {
  const state = runSync([makeOffer({ cash_price: 100 })], makeCurrent({ price: 300 }))
  const result = await state.promise

  assert.equal(result.suspicious.length, 1)
  assert.equal(state.updates.length, 0)
  assert.equal(state.history.length, 0)
})

test('does not create history or write when price and list price are unchanged', async () => {
  const state = runSync([makeOffer({ cash_price: 110, list_price: 125 })], makeCurrent())
  const result = await state.promise

  assert.equal(result.unchanged.length, 1)
  assert.equal(state.updates.length, 0)
  assert.equal(state.history.length, 0)
})

test('stores official Carrefour identity when prices are unchanged', async () => {
  const state = runSync([
    makeOffer({ cash_price: 110, list_price: 125, source_sku: null, source_url: null }),
  ], makeCurrent())
  const result = await state.promise

  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].identityChanged, true)
  assert.equal(result.updated[0].priceChanged, false)
  assert.equal(state.updates[0].values.source_sku, '9547')
  assert.equal(state.updates[0].values.source_url, 'https://www.carrefour.com.ar/producto-122140/p')
  assert.equal(state.history.length, 0)
  assert.equal(state.logs[0].products_updated, 0)
})

test('limits each run and persists the cursor for the next ordered batch', async () => {
  const offers = [1, 2, 3].map((id) => makeOffer({ id, source_product_id: String(122140 + id) }))
  const state = runSync(offers, makeCurrent(), { maxOffersPerRun: 2 })
  const result = await state.promise

  assert.equal(result.checked, 2)
  assert.equal(result.batchLimit, 2)
  assert.equal(result.nextOfferId, 2)
  assert.deepEqual(state.queries[0], { afterId: null, limit: 2, ascending: true })
  assert.equal(state.state.last_offer_id, 2)
})

test('wraps the cursor to the first batch after reaching the final offer', async () => {
  const offers = [1, 2].map((id) => makeOffer({ id, source_product_id: String(122140 + id) }))
  const state = createDatabase(offers)
  state.state.last_offer_id = 2
  const result = await syncCarrefourPrices({
    database: state.database,
    historyRecorder: async () => {},
    postalCode: '5186',
    fetchProductById: async () => makeCurrent(),
    maxOffersPerRun: 1,
  })

  assert.equal(result.wrapped, true)
  assert.equal(result.nextOfferId, 1)
  assert.deepEqual(state.queries.map(({ afterId }) => afterId), [2, null])
})

test('keeps the cursor before a transient fetch error so it is retried', async () => {
  const offers = [1, 2].map((id) => makeOffer({ id, source_product_id: String(122140 + id) }))
  const state = createDatabase(offers)
  const result = await syncCarrefourPrices({
    database: state.database,
    historyRecorder: async () => {},
    postalCode: '5186',
    fetchProductById: async (id) => {
      if (id === '122142') throw new Error('temporary error')
      return makeCurrent({ sourceProductId: id })
    },
    maxOffersPerRun: 2,
  })

  assert.equal(result.errors.length, 1)
  assert.equal(result.nextOfferId, 1)
  assert.equal(state.state.last_offer_id, 1)
})

test('rejects invalid postal codes, concurrency, and batch limits', async () => {
  const state = createDatabase([makeOffer()])
  await assert.rejects(
    syncCarrefourPrices({ database: state.database, historyRecorder: async () => {}, postalCode: '1' }),
    /código postal válido/,
  )
  await assert.rejects(
    syncCarrefourPrices({ database: state.database, historyRecorder: async () => {}, postalCode: '5186', concurrency: 6 }),
    /concurrencia debe ser un entero/,
  )
  await assert.rejects(
    syncCarrefourPrices({ database: state.database, historyRecorder: async () => {}, postalCode: '5186', maxOffersPerRun: 101 }),
    /máximo de ofertas por ejecución/,
  )
})
