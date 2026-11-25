const assert = require('node:assert/strict')
const test = require('node:test')
const {
  PRICE_STATUS_RULES_VERSION,
  buildCurrentPriceStatusRows,
  buildPriceFingerprint,
  createPriceStatusRefreshQueue,
  isPersistablePriceStatusRow,
  saveCurrentPriceStatuses,
} = require('./currentPriceStatus')

function createAnalysis({ price = 100, comparablePrice = 200 } = {}) {
  return {
    product: { id: 10, offers: [{ id: 3, cash_price: price }] },
    classification: 'precio_justo',
    score: 12,
    offerScore: 20,
    confidence: 'alta',
    confidencePercentage: 85,
    dataQuality: { historyPoints: 0, supermarkets: 2, comparables: 1, quality: 'media' },
    indicators: { percentageVariation: null, inflationDeviation: null, signals: [] },
    references: {
      level: 'subcategoria',
      references: [{ id: 20, price: comparablePrice, unitPrice: 10 }],
    },
    priceHistory: [],
    pricePeriods: [],
    populatedPeriods: 0,
    evolutionAvailable: false,
  }
}

test('price fingerprint includes the product and comparable prices', () => {
  const original = createAnalysis()
  assert.notEqual(
    buildPriceFingerprint(original.product, original.references),
    buildPriceFingerprint(createAnalysis({ comparablePrice: 210 }).product, createAnalysis({ comparablePrice: 210 }).references),
  )
  assert.notEqual(
    buildPriceFingerprint(original.product, original.references),
    buildPriceFingerprint(createAnalysis({ price: 101 }).product, original.references),
  )
})

test('fingerprint exposes catalog-compatible offers while retaining analysis inputs', () => {
  const fingerprint = JSON.parse(buildPriceFingerprint({
    id: 10,
    source: 'mami',
    offers: [{ id: 3, cash_price: 3.49 }],
  }))

  assert.equal(fingerprint.rules_version, PRICE_STATUS_RULES_VERSION)
  assert.deepEqual(fingerprint.offers, [{ offer_id: '3', cash_price: 349 }])
  assert.match(fingerprint.analysis_fingerprint, /^[a-f0-9]{64}$/)
})

test('hidden offers do not affect the current price fingerprint', () => {
  const product = {
    id: 10,
    source: 'disco',
    offers: [
      { id: 3, cash_price: 1500, is_catalog_visible: true },
      { id: 4, cash_price: 3650, is_catalog_visible: false },
    ],
  }
  const changedHiddenPrice = {
    ...product,
    offers: [product.offers[0], { ...product.offers[1], cash_price: 301653 }],
  }

  assert.equal(
    buildPriceFingerprint(product),
    buildPriceFingerprint(changedHiddenPrice),
  )
})

test('price fingerprint includes current taxonomy and analysis inputs', () => {
  const analysis = createAnalysis()
  const original = buildPriceFingerprint(analysis.product, analysis.references, analysis)
  const renamedCategory = {
    ...analysis.product,
    categories: { name: 'Otro nombre' },
  }
  const changedPreviousPrice = {
    ...analysis.product,
    offers: [{ id: 3, cash_price: 100, previous_price: 80 }],
  }

  assert.notEqual(buildPriceFingerprint(renamedCategory, analysis.references, analysis), original)
  assert.notEqual(buildPriceFingerprint(changedPreviousPrice, analysis.references, analysis), original)
})

test('status rows retain comparable ids and analysis details', () => {
  const [row] = buildCurrentPriceStatusRows([createAnalysis()], '2026-10-10T00:00:00.000Z')
  assert.deepEqual(row.comparable_product_ids, ['10', '20'])
  assert.equal(row.classification, 'precio_justo')
  assert.equal(row.confidence_percentage, 85)
  assert.equal(row.analyzed_at, '2026-10-10T00:00:00.000Z')
  assert.equal(isPersistablePriceStatusRow(row), true)
})

test('rows without complete analysis details are not persistable', () => {
  const [row] = buildCurrentPriceStatusRows([createAnalysis()])
  assert.equal(isPersistablePriceStatusRow({ ...row, analysis_details: {} }), false)
  assert.equal(isPersistablePriceStatusRow({ ...row, data_quality: {} }), false)
})

test('statuses are upserted only when the price fingerprint or rules version changes', async () => {
  const analysis = createAnalysis()
  const [completeRow] = buildCurrentPriceStatusRows([analysis])
  const stored = {
    product_id: '10',
    price_fingerprint: buildPriceFingerprint(analysis.product, analysis.references, analysis),
    rules_version: PRICE_STATUS_RULES_VERSION,
    analysis_details: completeRow.analysis_details,
    data_quality: completeRow.data_quality,
  }
  let upserts = 0
  const database = {
    from() {
      return {
        select() {
          return {
            in: async () => ({ data: [stored], error: null }),
          }
        },
        upsert: async () => {
          upserts += 1
          return { error: null }
        },
      }
    },
  }

  assert.equal(await saveCurrentPriceStatuses(database, [analysis]), 0)
  assert.equal(upserts, 0)
  assert.equal(await saveCurrentPriceStatuses(database, [createAnalysis({ price: 101 })]), 1)
  assert.equal(upserts, 1)
})

test('statuses with a matching fingerprint but missing details are refreshed', async () => {
  const analysis = createAnalysis()
  const stored = {
    product_id: '10',
    price_fingerprint: buildPriceFingerprint(analysis.product, analysis.references, analysis),
    rules_version: PRICE_STATUS_RULES_VERSION,
    analysis_details: {},
    data_quality: {},
  }
  let upserts = 0
  const database = {
    from() {
      return {
        select() {
          return {
            in: async () => ({ data: [stored], error: null }),
          }
        },
        upsert: async () => {
          upserts += 1
          return { error: null }
        },
      }
    },
  }

  assert.equal(await saveCurrentPriceStatuses(database, [analysis]), 1)
  assert.equal(upserts, 1)
})

test('startup queues current-version statuses with incomplete details', async () => {
  const { enqueueIncompletePriceStatuses } = require('./currentPriceStatus')
  let productPageRead = false
  const database = {
    from(table) {
      if (table === 'products') {
        return {
          select: () => ({
            order: () => ({
              range: async () => {
                if (productPageRead) return { data: [], error: null }
                productPageRead = true
                return { data: [{ id: 10 }], error: null }
              },
            }),
          }),
        }
      }
      return {
        select: () => ({
          in: async () => ({
            data: [{
              product_id: 10,
              rules_version: PRICE_STATUS_RULES_VERSION,
              analysis_details: {},
              data_quality: {},
            }],
            error: null,
          }),
          neq: () => ({
            order: () => ({
              range: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }
    },
  }
  const enqueued = []
  await enqueueIncompletePriceStatuses(database, { enqueue: (ids) => enqueued.push(...ids) })

  assert.deepEqual(enqueued, [10])
})

test('startup without the details check reads lightweight columns and queues stale products', async () => {
  const { enqueueIncompletePriceStatuses } = require('./currentPriceStatus')
  let productPageRead = false
  let staleStatusPageRead = false
  const selectedStatusColumns = []
  const database = {
    from(table) {
      if (table === 'products') {
        return {
          select: () => ({
            order: () => ({
              range: async () => {
                if (productPageRead) return { data: [], error: null }
                productPageRead = true
                return { data: [{ id: 10 }, { id: 11 }, { id: 12 }], error: null }
              },
            }),
          }),
        }
      }
      return {
        select: (columns) => {
          selectedStatusColumns.push(columns)
          return {
            in: async () => ({
              data: [
                {
                  product_id: 10,
                  rules_version: PRICE_STATUS_RULES_VERSION,
                  analysis_details: {},
                  data_quality: {},
                },
                { product_id: 11, rules_version: 'old-version' },
              ],
              error: null,
            }),
            neq: () => ({
              order: () => ({
                range: async () => {
                  if (staleStatusPageRead) return { data: [], error: null }
                  staleStatusPageRead = true
                  return { data: [{ product_id: 11 }], error: null }
                },
              }),
            }),
          }
        },
      }
    },
  }
  const enqueued = new Set()
  await enqueueIncompletePriceStatuses(
    database,
    { enqueue: (ids) => ids.forEach((id) => enqueued.add(id)) },
    undefined,
    { checkDetails: false },
  )

  assert.ok(selectedStatusColumns.includes('product_id, rules_version'))
  assert.ok(!selectedStatusColumns.some((columns) => columns.includes('analysis_details')))
  assert.deepEqual([...enqueued].sort((left, right) => left - right), [11, 12])
})

test('refresh queue retries failed batches without dropping product ids', async () => {
  let attempts = 0
  let resolveRetry
  const retried = new Promise((resolve) => {
    resolveRetry = resolve
  })
  const loggedErrors = []
  const queue = createPriceStatusRefreshQueue({
    retryDelayMs: 1,
    refreshBatch: async (ids) => {
      attempts += 1
      assert.deepEqual(ids, ['10', '11'])
      if (attempts === 1) throw new Error('temporary database failure')
      resolveRetry()
    },
    logger: { error: (...args) => loggedErrors.push(args) },
  })

  queue.enqueue([10, 11])
  await retried

  assert.equal(attempts, 2)
  assert.equal(loggedErrors.length, 1)
  assert.deepEqual(loggedErrors[0][0], 'Unable to refresh current price statuses for 2 products')
})
