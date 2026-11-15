const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createAdminAuth } = require('../adminAuth')
const { matchCrossSourcePair } = require('./crossSourceProductMatcher')
const {
  MAX_DECISION_IDS,
  ReevaluationInputError,
  createCrossSourceDecisionReevaluationService,
  createReevaluationHandler,
  getIdentitySnapshot,
  getImplementationVersions,
} = require('./crossSourceDecisionReevaluation')

const decisionId = '2c61246e-5910-44e0-8e63-4cd9f84dbcb1'
const gtin = '7790742348302'

function products({ mamiEan = gtin, discoEan = gtin, mamiName, discoName, mamiSku = 'mami-sku-1' } = {}) {
  return [
    {
      id: 101,
      source: 'mami',
      source_product_id: 'prod-101',
      source_sku: mamiSku,
      ean: mamiEan,
      brand_id: 1,
      name: mamiName || 'LECHE LA SERENISIMA FRESCA ENTERA CLASICA 3% GRASA SACHET X 1 LT.',
    },
    {
      id: 202,
      source: 'disco',
      source_product_id: 'disco-202',
      source_sku: 'disco-sku-202',
      ean: discoEan,
      brand_id: 1,
      name: discoName || 'Leche Entera 3% Sachet 1 Lts La Serenísima',
    },
  ]
}

function makeDecision(productsForPair = products(), overrides = {}) {
  const [mamiWithBrand, discoWithBrand] = productsForPair.map((product) => ({
    ...product,
    brands: { name: 'LA SERENISIMA' },
  }))
  const currentMatch = matchCrossSourcePair(mamiWithBrand, discoWithBrand)
  return {
    id: decisionId,
    pair_key: 'cross_source:101:202',
    source: 'cross_source',
    mami_product_id: 101,
    disco_product_id: 202,
    status: 'match',
    reason_codes: ['exact_valid_gtin'],
    confidence: 'alta',
    evidence: {
      matchedAttributes: currentMatch.matchedAttributes,
      mismatchedAttributes: currentMatch.mismatchedAttributes,
      identitySnapshots: {
        mami: getIdentitySnapshot(mamiWithBrand),
        disco: getIdentitySnapshot(discoWithBrand),
      },
      parserVersion: 'parser-v1',
      matcherVersion: 'matcher-v1',
      origin: { type: 'manual', actor: 'admin' },
    },
    admin_username: 'admin',
    created_at: '2026-10-05T13:00:00.000Z',
    updated_at: '2026-10-05T13:00:00.000Z',
    ...overrides,
  }
}

function fakeDatabase({ decisions = [], productRows = products(), errors = {} } = {}) {
  const reads = []
  const rowsByTable = {
    cross_source_review_decisions: decisions,
    products: productRows,
    brands: [{ id: 1, name: 'LA SERENISIMA' }],
  }
  const writeOperations = []
  const database = {
    from(table) {
      const query = { table, columns: null, column: null, values: null }
      const builder = {
        select(columns) {
          query.columns = columns
          return this
        },
        in(column, values) {
          query.column = column
          query.values = values
          reads.push(query)
          if (errors[table]) return Promise.resolve({ data: null, error: errors[table] })
          const wanted = new Set(values.map(String))
          const data = (rowsByTable[table] || []).filter((row) => wanted.has(String(row[column])))
          return Promise.resolve({ data, error: null })
        },
        insert() { writeOperations.push('insert'); return this },
        upsert() { writeOperations.push('upsert'); return this },
        update() { writeOperations.push('update'); return this },
        delete() { writeOperations.push('delete'); return this },
      }
      return builder
    },
  }
  return { database, reads, rowsByTable, writeOperations }
}

function createService(options = {}) {
  return createCrossSourceDecisionReevaluationService({
    getVersions: () => ({ parser: 'parser-v1', matcher: 'matcher-v1' }),
    now: () => '2026-11-07T20:00:00.000Z',
    ...options,
  })
}

test('requires administrative confirmation even when stored evidence claims manual origin', async () => {
  const pair = products()
  const decision = makeDecision(pair)
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.equal(result.results[0].currentMatcher.status, 'match')
  assert.equal(result.results[0].outcome, 'manual_confirmation_required')
  assert.equal(result.results[0].baseline.available, true)
  assert.equal(result.results[0].versions.changed.parser, false)
  assert.equal(result.results[0].signals.includes('manual_origin_unverified'), true)
  assert.equal(result.readOnly, true)
})

test('marks missing GTIN and baseline as outdated evidence without claiming conflict', async () => {
  const pair = products({ mamiEan: null, discoEan: gtin })
  const decision = makeDecision(pair, { evidence: { matchedAttributes: [], mismatchedAttributes: [] } })
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])
  const evaluated = result.results[0]

  assert.equal(evaluated.outcome, 'evidence_outdated')
  assert.ok(evaluated.signals.includes('gtin_missing'))
  assert.ok(evaluated.signals.includes('sku_not_verified_as_gtin'))
  assert.ok(evaluated.signals.includes('baseline_snapshot_missing'))
  assert.equal(evaluated.currentMatcher.status, 'revisión')
  assert.equal(evaluated.currentMatcher.mismatchedAttributes.length, 0)
})

test('reports a concrete measure difference as an identity conflict', async () => {
  const pair = products({
    mamiName: 'LECHE ENTERA SACHET X 500 ML LA SERENISIMA',
    discoName: 'Leche Entera 1 L Sachet La Serenísima',
  })
  const decision = makeDecision(pair)
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.equal(result.results[0].outcome, 'identity_conflict')
  assert.ok(result.results[0].signals.includes('measure_conflict'))
})

test('treats two different valid GTINs as a concrete identity conflict', async () => {
  const pair = products({ mamiEan: '7790742448309', discoEan: gtin })
  const decision = makeDecision(pair)
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.equal(result.results[0].products.mami.gtin.status, 'valid')
  assert.equal(result.results[0].products.disco.gtin.status, 'valid')
  assert.equal(result.results[0].outcome, 'identity_conflict')
})

test('distinguishes invalid GTIN from missing GTIN and never promotes SKU to GTIN', async () => {
  const pair = products({ mamiEan: '1234567890123', discoEan: null, mamiSku: gtin })
  const decision = makeDecision(pair, { evidence: {} })
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])
  const evaluated = result.results[0]

  assert.equal(evaluated.products.mami.gtin.status, 'invalid')
  assert.equal(evaluated.products.mami.gtin.validValue, null)
  assert.equal(evaluated.products.disco.gtin.status, 'missing')
  assert.ok(evaluated.signals.includes('gtin_invalid'))
  assert.ok(evaluated.signals.includes('gtin_missing'))
  assert.ok(evaluated.signals.includes('sku_not_verified_as_gtin'))
  assert.equal(evaluated.products.mami.gtin.validValue, null)
})

test('reports missing identity attributes without treating them as contradictions', async () => {
  const pair = products({
    mamiName: 'LECHE LA SERENISIMA ENTERA',
    discoName: 'Leche Entera La Serenísima',
    mamiEan: null,
    discoEan: null,
  })
  const decision = makeDecision(pair, { status: 'revisión', evidence: {} })
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.notEqual(result.results[0].outcome, 'identity_conflict')
  assert.ok(result.results[0].signals.includes('identity_attributes_missing'))
  assert.equal(result.results[0].currentMatcher.mismatchedAttributes.length, 0)
})

test('marks old stored evidence as outdated when the recalculated attributes differ', async () => {
  const pair = products({ mamiEan: null, discoEan: null })
  const decision = makeDecision(pair, {
    evidence: {
      matchedAttributes: ['brand', 'family'],
      mismatchedAttributes: [{ field: 'measure', mami: { amount: 0.001 }, disco: { amount: 1 } }],
    },
  })
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.ok(result.results[0].signals.includes('evidence_outdated'))
  assert.deepEqual(result.results[0].evidenceDifferences, ['stored_attribute_evidence_differs'])
  assert.equal(result.results[0].outcome, 'evidence_outdated')
})

test('changes the primary outcome when an identity snapshot no longer matches', async () => {
  const pair = products()
  const decision = makeDecision(pair)
  pair[0].name += ' EDICION NUEVA'
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])
  const evaluated = result.results[0]

  assert.ok(evaluated.signals.includes('identity_snapshot_changed'))
  assert.equal(evaluated.outcome, 'evidence_outdated')
})

test('does not classify a missing attribute as an identity contradiction', async () => {
  const pair = products({ mamiEan: null, discoEan: null, mamiName: 'Leche entera', discoName: 'Leche entera' })
  const decision = makeDecision(pair, { status: 'revisión', evidence: {} })
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.notEqual(result.results[0].outcome, 'identity_conflict')
  assert.ok(result.results[0].signals.includes('identity_attributes_missing'))
  assert.equal(result.results[0].signals.includes('measure_conflict'), false)
})

test('rejects unsupported decision sources and products not from both supermarkets', async () => {
  const pair = products()
  const wrongDecisionSource = makeDecision(pair, { source: 'other_source' })
  const wrongDecisionRead = fakeDatabase({ decisions: [wrongDecisionSource], productRows: pair })
  const wrongDecisionResult = await createService({ database: wrongDecisionRead.database }).reevaluate([decisionId])
  assert.equal(wrongDecisionResult.results[0].outcome, 'needs_review')
  assert.ok(wrongDecisionResult.results[0].signals.includes('unsupported_decision_source'))
  assert.equal(wrongDecisionResult.results[0].currentMatcher, null)

  const wrongProducts = products()
  wrongProducts[0].source = 'carrefour'
  const wrongProductsRead = fakeDatabase({
    decisions: [makeDecision(pair)],
    productRows: wrongProducts,
  })
  const wrongProductsResult = await createService({ database: wrongProductsRead.database }).reevaluate([decisionId])
  assert.equal(wrongProductsResult.results[0].outcome, 'needs_review')
  assert.ok(wrongProductsResult.results[0].signals.includes('association_source_mismatch'))
  assert.equal(wrongProductsResult.results[0].currentMatcher, null)
})

test('maps products by their actual sources rather than numeric ID order', async () => {
  const [mami, disco] = products()
  const decision = makeDecision([mami, disco], {
    mami_product_id: disco.id,
    disco_product_id: mami.id,
  })
  const { database } = fakeDatabase({ decisions: [decision], productRows: [mami, disco] })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.equal(result.results[0].products.mami.id, mami.id)
  assert.equal(result.results[0].products.disco.id, disco.id)
  assert.equal(result.results[0].currentMatcher.status, 'match')
})

test('selects only schema-backed product columns and reports name-derived measures', async () => {
  const pair = products({
    mamiName: 'Leche entera La Serenisima 500 ml',
    discoName: 'Leche entera La Serenisima 500 ml',
    mamiEan: null,
    discoEan: null,
  })
  const decision = makeDecision(pair, { status: 'revisión', evidence: {} })
  const { database, reads, rowsByTable } = fakeDatabase({
    decisions: [decision],
    productRows: pair,
  })
  const beforeProducts = structuredClone(rowsByTable.products)
  const result = await createService({ database }).reevaluate([decisionId])
  const productRead = reads.find((read) => read.table === 'products')
  const selectedFields = productRead.columns.split(',')
  const mamiReport = result.results[0].products.mami

  for (const field of [
    'id',
    'source',
    'name',
    'source_product_id',
    'source_sku',
    'ean',
    'brand_id',
  ]) {
    assert.ok(selectedFields.includes(field), `${field} must be selected`)
  }
  for (const field of ['description', 'presentation', 'unit']) {
    assert.ok(!selectedFields.includes(field), `${field} must not be selected`)
    assert.equal(mamiReport.parserInputAvailability[field], 'not_in_products_schema')
  }
  assert.deepEqual(rowsByTable.products, beforeProducts)
  assert.equal(mamiReport.measure.normalizedAmount, 0.5)
  assert.equal(mamiReport.attributeEvidence.measure.status, 'extracted_from_name')
  assert.equal(mamiReport.attributeEvidence.family.status, 'extracted_from_name')
  assert.equal(mamiReport.attributeEvidence.brand.status, 'available_from_brands_table')
})

test('reports absent parser inputs without inventing measures or identity conflicts', async () => {
  const pair = products({
    mamiName: 'Leche entera La Serenisima',
    discoName: 'Leche entera La Serenisima',
    mamiEan: null,
    discoEan: null,
  })
  const decision = makeDecision(pair, { status: 'revisión', evidence: {} })
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])
  const evaluated = result.results[0]

  assert.equal(evaluated.products.mami.measure, null)
  assert.equal(evaluated.products.mami.attributeEvidence.measure.status, 'absent')
  assert.equal(evaluated.products.mami.parserInputAvailability.description, 'not_in_products_schema')
  assert.ok(evaluated.signals.includes('identity_attributes_missing'))
  assert.equal(evaluated.signals.includes('measure_conflict'), false)
  assert.notEqual(evaluated.outcome, 'identity_conflict')
})

test('detects saved matcher and parser versions without overwriting the decision', async () => {
  const pair = products()
  const decision = makeDecision(pair, {
    evidence: {
      identitySnapshots: {
        mami: getIdentitySnapshot(pair[0]),
        disco: getIdentitySnapshot(pair[1]),
      },
      parserVersion: 'parser-old',
      matcherVersion: 'matcher-old',
    },
  })
  const before = structuredClone(decision)
  const { database, reads } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.ok(result.results[0].signals.includes('parser_changed'))
  assert.ok(result.results[0].signals.includes('matcher_changed'))
  assert.equal(result.results[0].outcome, 'evidence_outdated')
  assert.deepEqual(decision, before)
  assert.deepEqual(reads.map((read) => read.table), ['cross_source_review_decisions', 'products', 'brands'])
})

test('requires manual confirmation if the approval origin cannot be verified', async () => {
  const pair = products()
  const baselineEvidence = makeDecision(pair).evidence
  const decision = makeDecision(pair, {
    evidence: {
      identitySnapshots: baselineEvidence.identitySnapshots,
      parserVersion: 'parser-v1',
      matcherVersion: 'matcher-v1',
    },
  })
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const result = await createService({ database }).reevaluate([decisionId])

  assert.equal(result.results[0].outcome, 'manual_confirmation_required')
  assert.ok(result.results[0].signals.includes('manual_origin_unverified'))
})

test('reports nonexistent decision IDs and deleted products without broadening reads', async () => {
  const missingId = '9f45f9fe-1714-4e10-9a09-a9f130a194b0'
  const decision = makeDecision(products())
  const { database, reads } = fakeDatabase({
    decisions: [decision],
    productRows: [products()[0]],
  })
  const result = await createService({ database }).reevaluate([decisionId, missingId])

  assert.deepEqual(result.missingDecisionIds, [missingId])
  assert.equal(result.results[0].outcome, 'needs_review')
  assert.ok(result.results[0].signals.includes('product_missing'))
  assert.deepEqual(reads[0].values, [decisionId, missingId])
  assert.deepEqual(reads[1].values, ['101', '202'])
  assert.equal(result.queryCounts.offerRowsRead, 0)
  assert.equal(result.queryCounts.priceHistoryRowsRead, 0)
})

test('evaluates the audited set of 26 decisions with bounded batched reads', async () => {
  const decisions = []
  const productRows = []
  const ids = []
  for (let index = 0; index < 26; index += 1) {
    const uuid = `${String(index + 1).padStart(8, '0')}-0000-0000-0000-000000000000`
    const [mami, disco] = products()
    mami.id = 1000 + index * 2
    disco.id = 1001 + index * 2
    const decision = makeDecision([mami, disco], {
      id: uuid,
      pair_key: `cross_source:${mami.id}:${disco.id}`,
      mami_product_id: mami.id,
      disco_product_id: disco.id,
    })
    decisions.push(decision)
    productRows.push(mami, disco)
    ids.push(uuid)
  }
  const { database, reads } = fakeDatabase({ decisions, productRows })
  const result = await createService({ database }).reevaluate(ids)

  assert.equal(result.summary.evaluated, 26)
  assert.equal(result.queryCounts.productsRequested, 52)
  assert.equal(reads.length, 3)
  assert.deepEqual(reads.map((read) => read.table), ['cross_source_review_decisions', 'products', 'brands'])
})

test('rejects duplicate IDs, malformed IDs, empty input, and requests over the limit', async () => {
  const { database } = fakeDatabase()
  const service = createService({ database })
  await assert.rejects(service.reevaluate([]), ReevaluationInputError)
  await assert.rejects(service.reevaluate([decisionId, decisionId]), /duplicados/)
  await assert.rejects(service.reevaluate([decisionId, decisionId.toUpperCase()]), /duplicados/)
  await assert.rejects(service.reevaluate(['not-a-uuid']), /UUID válidos/)
  const overLimit = Array.from({ length: MAX_DECISION_IDS + 1 }, (_, index) => (
    `${String(index).padStart(8, '0')}-0000-0000-0000-000000000000`
  ))
  await assert.rejects(service.reevaluate(overLimit), /como máximo/)
})

test('surfaces database errors instead of returning a success-shaped fallback', async () => {
  const { database } = fakeDatabase({ errors: { cross_source_review_decisions: new Error('select failed') } })
  await assert.rejects(createService({ database }).reevaluate([decisionId]), /select failed/)

  const productRead = fakeDatabase({
    decisions: [makeDecision(products())],
    errors: { products: new Error('products select failed') },
  })
  await assert.rejects(createService({ database: productRead.database }).reevaluate([decisionId]), /products select failed/)

  const brandRead = fakeDatabase({
    decisions: [makeDecision(products())],
    errors: { brands: new Error('brands select failed') },
  })
  await assert.rejects(createService({ database: brandRead.database }).reevaluate([decisionId]), /brands select failed/)
})

test('does not mutate decision or product records during reevaluation', async () => {
  const pair = products()
  const decision = makeDecision(pair)
  const beforeDecision = structuredClone(decision)
  const beforeProducts = structuredClone(pair)
  const { database, reads, rowsByTable, writeOperations } = fakeDatabase({ decisions: [decision], productRows: pair })

  await createService({ database }).reevaluate([decisionId])

  assert.deepEqual(decision, beforeDecision)
  assert.deepEqual(rowsByTable.products, beforeProducts)
  assert.deepEqual(reads.map((read) => read.table), ['cross_source_review_decisions', 'products', 'brands'])
  assert.ok(reads.every((read) => read.columns && read.column === 'id'))
  assert.deepEqual(writeOperations, [])
})

test('handler returns validation errors and read-only reports', async () => {
  const pair = products()
  const decision = makeDecision(pair)
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const handler = createReevaluationHandler(createService({ database }))
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }

  await handler({ body: { decisionIds: [] } }, response)
  assert.equal(response.statusCode, 400)
  response.statusCode = 200
  await handler({ body: { decisionIds: [decisionId] } }, response)
  assert.equal(response.statusCode, 200)
  assert.equal(response.payload.readOnly, true)
  assert.equal(response.payload.results.length, 1)
})

test('exposes reproducible current parser and matcher fingerprints', () => {
  const versions = getImplementationVersions()
  assert.match(versions.parser, /^[\da-f]{64}$/)
  assert.match(versions.matcher, /^[\da-f]{64}$/)
})

test('protects the reevaluation route with the production requireAdmin middleware', async (t) => {
  const pair = products()
  const decision = makeDecision(pair)
  const { database } = fakeDatabase({ decisions: [decision], productRows: pair })
  const app = express()
  const auth = createAdminAuth({ sessionSecret: 'reevaluation-test-secret' })
  const handler = createReevaluationHandler(createService({ database }))
  app.use(express.json())
  app.post('/review/cross-source-decisions/reevaluate', auth.requireAdmin, handler)

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const url = `http://127.0.0.1:${server.address().port}/review/cross-source-decisions/reevaluate`
  const unauthenticated = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decisionIds: [decisionId] }),
  })
  assert.equal(unauthenticated.status, 401)

  const authorized = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${auth.createAdminToken('authorized-admin')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ decisionIds: [decisionId] }),
  })
  assert.equal(authorized.status, 200)
  const report = await authorized.json()
  assert.equal(report.readOnly, true)
  assert.equal(report.results[0].decisionId, decisionId)
})
