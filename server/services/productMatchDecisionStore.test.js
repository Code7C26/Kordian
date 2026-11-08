const assert = require('node:assert/strict')
const test = require('node:test')

if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'http://127.0.0.1:54321'
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const {
  approvedMatchCompatibilityIssues,
  buildIdentitySnapshot,
  createDecisionKey,
  isProductMatchDecisionCurrent,
  listProductMatchDecisions,
  upsertProductMatchDecision,
} = require('./productMatchDecisionStore')

const sourceProduct = {
  source: 'carrefour',
  sourceProductId: '680457',
  sourceSku: '52798',
  ean: '7790742348302',
  name: 'Leche Entera 3% La Serenisima 1 L',
  brand: 'La Serenisima',
}
const localProduct = {
  id: 100,
  source: 'disco',
  source_product_id: 'disco-100',
  source_sku: 'local-100',
  ean: '7790742348302',
  name: 'Leche Entera 3% La Serenisima 1 L',
  brands: { name: 'La Serenisima' },
}

function approvedDecision(overrides = {}) {
  return {
    id: 'decision-1',
    source: 'carrefour',
    source_product_id: sourceProduct.sourceProductId,
    local_product_id: localProduct.id,
    decision_type: 'match',
    status: 'approved',
    source_snapshot: buildIdentitySnapshot(sourceProduct),
    local_snapshot: buildIdentitySnapshot(localProduct),
    ...overrides,
  }
}

test('reuses an approved match only while both source and local snapshots remain unchanged', () => {
  const result = isProductMatchDecisionCurrent(approvedDecision(), sourceProduct, localProduct)

  assert.equal(result.current, true)
  assert.deepEqual(result.reasons, [])
})

test('invalidates an approved decision when product presentation changes', () => {
  const changedSource = {
    ...sourceProduct,
    name: 'Leche Entera 3% La Serenisima 500 Ml',
  }
  const result = isProductMatchDecisionCurrent(approvedDecision(), changedSource, localProduct)

  assert.equal(result.current, false)
  assert.ok(result.reasons.includes('PRESENTACION_CAMBIADA'))
})

test('rejects and invalidates approved matches with contradictory valid GTINs', () => {
  const mismatchedProduct = { ...localProduct, ean: '7790742448309' }
  const issues = approvedMatchCompatibilityIssues(
    buildIdentitySnapshot(sourceProduct),
    buildIdentitySnapshot(mismatchedProduct),
  )
  const result = isProductMatchDecisionCurrent(
    approvedDecision(),
    sourceProduct,
    mismatchedProduct,
  )

  assert.ok(issues.includes('GTIN_INCOMPATIBLE'))
  assert.equal(result.current, false)
  assert.ok(result.reasons.includes('GTIN_INCOMPATIBLE'))
})

test('does not reuse a rejected decision', () => {
  const result = isProductMatchDecisionCurrent(
    approvedDecision({ status: 'rejected' }),
    sourceProduct,
    localProduct,
  )

  assert.equal(result.current, false)
  assert.ok(result.reasons.includes('DECISION_NO_APROBADA'))
})

test('keeps a rejected no-match candidate suppressed while both snapshots are unchanged', () => {
  const result = isProductMatchDecisionCurrent(
    approvedDecision({
      decision_type: 'no_match',
      status: 'rejected',
    }),
    sourceProduct,
    localProduct,
  )

  assert.equal(result.current, true)
  assert.deepEqual(result.reasons, [])
})

test('invalidates a rejected no-match candidate when either product identity changes', () => {
  const result = isProductMatchDecisionCurrent(
    approvedDecision({
      decision_type: 'no_match',
      status: 'rejected',
    }),
    sourceProduct,
    { ...localProduct, name: 'Leche Entera 3% La Serenisima 500 Ml' },
  )

  assert.equal(result.current, false)
  assert.ok(result.reasons.includes('PRESENTACION_CAMBIADA'))
})

test('reuses an approved no-comparable decision only for the same source identity', () => {
  const sourceSnapshot = buildIdentitySnapshot(sourceProduct)
  const decision = {
    source: 'carrefour',
    source_product_id: sourceProduct.sourceProductId,
    decision_type: 'no_comparable',
    status: 'approved',
    source_snapshot: sourceSnapshot,
  }

  assert.equal(isProductMatchDecisionCurrent(decision, sourceProduct).current, true)
  assert.equal(isProductMatchDecisionCurrent(decision, {
    ...sourceProduct,
    sourceSku: 'different-source-sku',
  }).current, false)
})

test('keys decisions by source, source-scoped product ID, and local product ID', () => {
  assert.equal(createDecisionKey({
    source: 'carrefour',
    sourceProductId: '680/457',
    localProductId: 100,
  }), 'carrefour:680%2F457:100')
  assert.equal(createDecisionKey({
    source: 'carrefour',
    sourceProductId: '680457',
    localProductId: null,
  }), 'carrefour:680457:no-comparable')
})

test('lists decisions using read-only queries and upserts only the decision table', async () => {
  const operations = []
  const database = {
    from(table) {
      operations.push({ table, operation: 'from' })
      const query = {
        select() {
          operations.push({ table, operation: 'select' })
          return this
        },
        eq(column, value) {
          operations.push({ table, operation: 'eq', column, value })
          return this
        },
        in(column, values) {
          operations.push({ table, operation: 'in', column, values })
          return Promise.resolve({ data: [], error: null })
        },
        upsert(payload, options) {
          operations.push({ table, operation: 'upsert', payload, options })
          return this
        },
        single() {
          return Promise.resolve({ data: { id: 'decision-1' }, error: null })
        },
      }
      return query
    },
  }

  await listProductMatchDecisions({
    source: 'carrefour',
    sourceProductIds: ['680457', '680458'],
    database,
  })
  await upsertProductMatchDecision({
    source: 'carrefour',
    sourceProductId: '680457',
    sourceSku: '52798',
    localProductId: 100,
    decisionType: 'match',
    status: 'approved',
    sourceSnapshot: buildIdentitySnapshot(sourceProduct),
    localSnapshot: buildIdentitySnapshot(localProduct),
    reviewedBy: 'admin',
  }, database)

  assert.ok(operations.some((operation) => operation.operation === 'select'))
  assert.equal(operations.filter((operation) => operation.operation === 'upsert').length, 1)
  assert.equal(operations.find((operation) => operation.operation === 'upsert').table, 'product_match_review_decisions')
})
