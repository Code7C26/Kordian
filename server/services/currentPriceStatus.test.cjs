const assert = require('node:assert/strict')
const test = require('node:test')
const {
  PRICE_STATUS_RULES_VERSION,
  buildCurrentPriceStatusRows,
  buildPriceFingerprint,
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
    dataQuality: { points: 5 },
    references: {
      level: 'subcategoria',
      references: [{ id: 20, price: comparablePrice, unitPrice: 10 }],
    },
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

test('status rows retain comparable ids and analysis details', () => {
  const [row] = buildCurrentPriceStatusRows([createAnalysis()], '2026-10-10T00:00:00.000Z')
  assert.deepEqual(row.comparable_product_ids, ['10', '20'])
  assert.equal(row.classification, 'precio_justo')
  assert.equal(row.confidence_percentage, 85)
  assert.equal(row.analyzed_at, '2026-10-10T00:00:00.000Z')
})

test('statuses are upserted only when the price fingerprint or rules version changes', async () => {
  const analysis = createAnalysis()
  const stored = {
    product_id: '10',
    price_fingerprint: buildPriceFingerprint(analysis.product, analysis.references, analysis),
    rules_version: PRICE_STATUS_RULES_VERSION,
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
