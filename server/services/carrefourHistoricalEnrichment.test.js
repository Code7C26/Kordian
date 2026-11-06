const assert = require('node:assert/strict')
const test = require('node:test')
const {
  arePackageSizesEqual,
  comparePackageSizes,
  enrichRowsWithHistoricalIdentity,
  validateHistoricalIdentityEvidence,
} = require('./carrefourHistoricalEnrichment')

function currentRow(overrides = {}) {
  return {
    source_product_id: '122140',
    source_sku: '9547',
    gtin: '',
    name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    ...overrides,
  }
}

function historicalRow(overrides = {}) {
  return {
    enrichment_status: 'validated',
    enriched_source_product_id: '122140',
    enriched_source_sku: '9547',
    enriched_gtin: '7798033333907',
    enriched_name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    capture_timestamp: '2026-10-29T17:02:31.540Z',
    ...overrides,
  }
}

test('only enriches when ID, normalized name, SKU, package size, and GTIN all match', () => {
  const result = enrichRowsWithHistoricalIdentity(
    [currentRow()],
    [historicalRow()],
  )

  assert.deepEqual(result.counts, { matched: 1 })
  assert.equal(result.rows[0].gtin, '7798033333907')
  assert.equal(result.rows[0].identity_source, 'historical_validated')
  assert.equal(result.rows[0].identity_match_method, 'exact_id_name_sku_presentation')
  assert.equal(result.rows[0].historical_source_product_id, '122140')
  assert.equal(result.rows[0].historical_source_sku, '9547')
  assert.equal(result.rows[0].historical_source_enrichment_status, 'validated')
  assert.equal(validateHistoricalIdentityEvidence(result.rows[0]), true)
})

test('normalizes accents, punctuation, and equivalent package-size units', () => {
  const result = enrichRowsWithHistoricalIdentity(
    [currentRow({
      name: 'Aceite de girasol Carrefour Classic pet 1.5 lts',
      source_product_id: '680457',
      source_sku: '52798',
    })],
    [historicalRow({
      enriched_source_product_id: '680457',
      enriched_source_sku: '52798',
      enriched_gtin: '7791720025123',
      enriched_name: 'Aceite de girasol carrefour classic pet 1,5 lts',
    })],
  )

  assert.deepEqual(result.counts, { matched: 1 })
  assert.equal(arePackageSizesEqual('Aceite 1.5 l', 'Aceite 1500 ml'), true)
  assert.equal(arePackageSizesEqual('Aceite 0.9 l', 'Aceite 900 cc'), true)
  assert.equal(comparePackageSizes('Aceite sin tamaño', 'Aceite 1 l'), 'unverified')
  assert.equal(comparePackageSizes('Aceite 500 ml', 'Aceite 500 g'), 'mismatch')
})

test('rejects size mismatches and missing package evidence', () => {
  const result = enrichRowsWithHistoricalIdentity(
    [
      currentRow({
        source_product_id: '680457',
        source_sku: '52798',
        name: 'Aceite de girasol Carrefour Classic pet 1.5 lts',
      }),
      currentRow({
        source_product_id: '700952',
        source_sku: '12345',
        name: 'Aceite de girasol Legitimo 1.5 lts',
      }),
      currentRow({
        source_product_id: '700953',
        source_sku: '12346',
        name: 'Aceite de girasol Legitimo',
      }),
    ],
    [
      historicalRow({
        enriched_source_product_id: '680457',
        enriched_source_sku: '52798',
        enriched_gtin: '7791720025123',
        enriched_name: 'Aceite de girasol Carrefour Classic pet 15 lts',
      }),
      historicalRow({
        enriched_source_product_id: '700952',
        enriched_source_sku: '12345',
        enriched_gtin: '7798316700815',
        enriched_name: 'Aceite de girasol Legitimo 15 lts',
      }),
      historicalRow({
        enriched_source_product_id: '700953',
        enriched_source_sku: '12346',
        enriched_gtin: '7798316700815',
        enriched_name: 'Aceite de girasol Legitimo',
      }),
    ],
  )

  assert.deepEqual(result.counts, { presentation_mismatch: 2, presentation_unverified: 1 })
  assert.ok(result.rows.every((row) => row.gtin === ''))
})

test('rejects mismatched SKU, name, invalid GTIN, and unvalidated historical data', () => {
  const current = [
    currentRow({ source_product_id: '1', source_sku: 'different' }),
    currentRow({ source_product_id: '2', name: 'Otro producto 170 grs' }),
    currentRow({ source_product_id: '3' }),
    currentRow({ source_product_id: '4' }),
  ]
  const history = [
    historicalRow({ enriched_source_product_id: '1' }),
    historicalRow({ enriched_source_product_id: '2' }),
    historicalRow({ enriched_source_product_id: '3', enriched_gtin: '7798033333908' }),
    historicalRow({ enriched_source_product_id: '4', enrichment_status: 'needs_review' }),
  ]

  const result = enrichRowsWithHistoricalIdentity(current, history)

  assert.deepEqual(result.counts, {
    sku_mismatch: 1,
    name_mismatch: 1,
    invalid_historical_gtin: 1,
    history_not_validated: 1,
  })
  assert.ok(result.rows.every((row) => row.gtin === ''))
})

test('does not replace a current GTIN or assign a duplicated historical GTIN', () => {
  const result = enrichRowsWithHistoricalIdentity(
    [
      currentRow({ gtin: '7798033333907' }),
      currentRow({ source_product_id: '1', source_sku: 'sku-1', name: 'Producto 1 500 g' }),
      currentRow({ source_product_id: '2', source_sku: 'sku-2', name: 'Producto 2 500 g' }),
    ],
    [
      historicalRow({ source_product_id: '122140' }),
      historicalRow({
        enriched_source_product_id: '1',
        enriched_source_sku: 'sku-1',
        enriched_name: 'Producto 1 500 g',
      }),
      historicalRow({
        enriched_source_product_id: '2',
        enriched_source_sku: 'sku-2',
        enriched_name: 'Producto 2 500 g',
      }),
    ],
  )

  assert.deepEqual(result.counts, {
    current_gtin_present: 1,
    duplicate_historical_gtin: 2,
  })
  assert.equal(result.rows[0].gtin, '7798033333907')
  assert.equal(result.rows[1].gtin, '')
  assert.equal(result.rows[2].gtin, '')
})

test('rejects fabricated or altered historical identity evidence', () => {
  const [row] = enrichRowsWithHistoricalIdentity([currentRow()], [historicalRow()]).rows
  assert.equal(validateHistoricalIdentityEvidence(row), true)
  assert.equal(validateHistoricalIdentityEvidence({ ...row, historical_source_sku: 'other' }), false)
  assert.equal(validateHistoricalIdentityEvidence({ ...row, name: 'Otro producto 170 grs' }), false)
  assert.equal(validateHistoricalIdentityEvidence({ ...row, identity_confidence: '0.1' }), true)
})
