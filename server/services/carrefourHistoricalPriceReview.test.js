const assert = require('node:assert/strict')
const test = require('node:test')
const {
  applyHistoricalPriceReview,
  buildHistoricalPriceIndex,
  HISTORICAL_PRICE_MAX_AGE_HOURS,
  HISTORICAL_PRICE_MAX_CHANGE_RATIO,
} = require('./carrefourHistoricalPriceReview')

const currentTimestamp = '2026-11-05T12:00:00.000Z'
const referenceTimestamp = '2026-11-03T16:00:00.000Z'

function historicalRow(overrides = {}) {
  return {
    source_product_id: '719377',
    source_sku: '141554',
    gtin: '7791337007253',
    name: 'Leche chocolatada Cindor 1 l',
    price: '1000',
    capture_timestamp: referenceTimestamp,
    identity_source: 'historical_validated',
    gtin_extraction_method: 'historical_strict_match',
    gtin_validation_status: 'valid',
    identity_match_method: 'exact_id_name_sku_presentation',
    historical_source_product_id: '719377',
    historical_source_sku: '141554',
    historical_source_gtin: '7791337007253',
    historical_source_name: 'Leche chocolatada Cindor 1 l',
    historical_source_enrichment_status: 'validated',
    historical_source_capture_timestamp: referenceTimestamp,
    ...overrides,
  }
}

function reportRow(overrides = {}) {
  return {
    rowNumber: 2,
    sourceProductId: '719377',
    ean: '7791337007253',
    name: 'Leche chocolatada Cindor 1 l',
    capturedPrice: 1100,
    status: 'manual_review_price_no_reference',
    reasons: ['No hay otra oferta local para comparar; verificar el precio en Carrefour'],
    existingProduct: null,
    existingCarrefourPrice: null,
    proposedTaxonomyExists: true,
    ...overrides,
  }
}

function captureRow(overrides = {}) {
  return {
    source_product_id: '719377',
    gtin: '7791337007253',
    name: 'Leche chocolatada Cindor 1 l',
    price: '1100',
    capture_timestamp: currentTimestamp,
    ...overrides,
  }
}

test('accepts a current exact-GTIN and same-package historical price within ±20%', () => {
  const [result] = applyHistoricalPriceReview(
    [reportRow()],
    [captureRow()],
    [historicalRow()],
  )

  assert.equal(result.status, 'ready_new_product')
  assert.deepEqual(result.reasons, [])
  assert.equal(result.historicalPriceReview.status, 'within_tolerance')
  assert.equal(result.historicalPriceReview.changeRatio, 0.1)
  assert.equal(result.historicalPriceReview.maxAgeHours, HISTORICAL_PRICE_MAX_AGE_HOURS)
  assert.equal(result.historicalPriceReview.maxChangeRatio, HISTORICAL_PRICE_MAX_CHANGE_RATIO)
})

test('keeps price changes above ±20% in a separate review bucket', () => {
  const [result] = applyHistoricalPriceReview(
    [reportRow({ capturedPrice: 1250 })],
    [captureRow({ price: '1250' })],
    [historicalRow()],
  )

  assert.equal(result.status, 'manual_review_price_deviation')
  assert.match(result.historicalPriceReview.reason, /\+25\.0%/)
  assert.equal(result.historicalPriceReview.status, 'outside_tolerance')
})

test('does not waive price review without an exact validated historical GTIN', () => {
  const [result] = applyHistoricalPriceReview(
    [reportRow()],
    [captureRow()],
    [historicalRow({ gtin: '7791337007254', historical_source_gtin: '7791337007254' })],
  )

  assert.equal(result.status, 'manual_review_price_no_reference')
  assert.equal(result.historicalPriceReview.status, 'missing_reference')
})

test('does not use a historical price older than 72 hours', () => {
  const staleTimestamp = '2026-11-01T12:00:00.000Z'
  const [result] = applyHistoricalPriceReview(
    [reportRow()],
    [captureRow()],
    [historicalRow({
      capture_timestamp: staleTimestamp,
      historical_source_capture_timestamp: staleTimestamp,
    })],
  )

  assert.equal(result.status, 'manual_review_price_no_reference')
  assert.equal(result.historicalPriceReview.status, 'stale_reference')
})

test('keeps presentation reviews unchanged by the historical price policy', () => {
  const presentationReview = reportRow({ status: 'manual_review_presentation' })
  const [result] = applyHistoricalPriceReview(
    [presentationReview],
    [captureRow()],
    [historicalRow()],
  )

  assert.equal(result.status, 'manual_review_presentation')
  assert.equal(result.historicalPriceReview, undefined)
})

test('indexes only rows with validated historical identity evidence', () => {
  const index = buildHistoricalPriceIndex([
    historicalRow(),
    historicalRow({
      gtin: '7791337007254',
      historical_source_gtin: '7791337007254',
      identity_match_method: 'unverified_method',
    }),
  ])

  assert.deepEqual([...index.keys()], ['7791337007253'])
})
