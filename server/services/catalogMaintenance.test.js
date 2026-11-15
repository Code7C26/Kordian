const test = require('node:test')
const assert = require('node:assert/strict')
const {
  assertCatalogWriteAllowed,
  getBlockedProductSupermarkets,
  getBlockedSupermarkets,
  isCatalogProductWriteBlocked,
  isManualCatalogClassification,
  isCatalogWriteBlocked,
  requireOfferWriteAllowed,
  requireProductWriteAllowed,
} = require('./catalogMaintenance')

const originalValue = process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS

test.after(() => {
  if (originalValue === undefined) delete process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS
  else process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = originalValue
})

test('maintenance gate blocks only configured supermarkets and is reversible', () => {
  process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = ' mami,DISCO '
  assert.deepEqual(getBlockedSupermarkets(), ['Mami', 'Disco'])
  assert.equal(isCatalogWriteBlocked('Mami'), true)
  assert.equal(isCatalogWriteBlocked('disco'), true)
  assert.equal(isCatalogWriteBlocked('Carrefour'), false)
  assert.throws(() => assertCatalogWriteAllowed('Mami'), { code: 'catalog_maintenance', status: 503 })
  assert.doesNotThrow(() => assertCatalogWriteAllowed('Carrefour'))

  process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = ''
  assert.equal(isCatalogWriteBlocked('Mami'), false)
})

test('product guard recognizes source and associated offer without blocking other retailers', () => {
  process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = 'Mami,Disco'
  assert.deepEqual(getBlockedProductSupermarkets({
    source: 'mami',
    offers: [{ supermarket: 'Carrefour' }],
  }), ['Mami'])
  assert.equal(isCatalogProductWriteBlocked({
    source: 'local',
    offers: [{ supermarket: 'Disco' }],
  }), true)
  assert.equal(isCatalogProductWriteBlocked({
    source: 'carrefour',
    offers: [{ supermarket: 'Carrefour' }],
  }), false)
})

test('manual catalog classifications are protected from automatic backfills', () => {
  assert.equal(isManualCatalogClassification({ classification_source: 'manual' }), true)
  assert.equal(isManualCatalogClassification({ classificationSource: 'MANUAL_OVERRIDE' }), true)
  assert.equal(isManualCatalogClassification({ classification_source: 'automatic' }), false)
  assert.equal(isManualCatalogClassification({ classification_source: null }), false)
})

test('route middleware returns 503 for paused writes and passes other supermarkets', () => {
  process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = 'Mami,Disco'
  const response = {
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
  let nextCalled = false
  const middleware = require('./catalogMaintenance').requireCatalogWritesFor('Mami')
  middleware({}, response, () => { nextCalled = true })
  assert.equal(response.statusCode, 503)
  assert.equal(response.payload.code, 'catalog_maintenance')
  assert.equal(nextCalled, false)

  const otherResponse = { ...response, statusCode: null, payload: null }
  require('./catalogMaintenance').requireCatalogWritesFor('Carrefour')({}, otherResponse, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true)
  assert.equal(otherResponse.statusCode, null)
})

test('generic product writes are checked only during maintenance and remain selective', async () => {
  const noGateDatabase = { from() { throw new Error('database should not be queried while the gate is disabled') } }
  process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = ''
  let nextCalled = false
  await requireProductWriteAllowed(noGateDatabase)({ params: { id: 1 } }, {}, () => { nextCalled = true })
  assert.equal(nextCalled, true)

  process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = 'Mami,Disco'
  const databaseFor = (product) => ({
    from() {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() { return { data: product, error: null } },
      }
    },
  })
  const response = {
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
  await requireProductWriteAllowed(databaseFor({
    source: 'disco',
    offers: [{ supermarket: 'Carrefour' }],
  }))({ params: { id: 2 } }, response, () => { nextCalled = true })
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.payload.blockedSupermarkets, ['Disco'])

  let otherStorePassed = false
  await requireProductWriteAllowed(databaseFor({
    source: 'carrefour',
    offers: [{ supermarket: 'Carrefour' }],
  }))({ params: { id: 3 } }, {}, () => { otherStorePassed = true })
  assert.equal(otherStorePassed, true)
})

test('generic offer writes block existing or requested paused supermarkets', async () => {
  process.env.CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS = 'Mami,Disco'
  const database = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() { return { data: { supermarket: 'Carrefour' }, error: null } },
      }
    },
  }
  const response = {
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
  await requireOfferWriteAllowed(database)(
    { params: { id: 1 }, method: 'PUT', body: { supermarket: 'Disco' } },
    response,
    () => assert.fail('paused retailer change must not continue'),
  )
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.payload.blockedSupermarkets, ['Disco'])

  const pausedOfferDatabase = {
    from() {
      return {
        select() { return this },
        eq() { return this },
        async maybeSingle() { return { data: { supermarket: 'Mami' }, error: null } },
      }
    },
  }
  const deleteResponse = {
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
  await requireOfferWriteAllowed(pausedOfferDatabase)(
    { params: { id: 2 }, method: 'DELETE', body: {} },
    deleteResponse,
    () => assert.fail('paused offer deletion must not continue'),
  )
  assert.equal(deleteResponse.statusCode, 503)
  assert.deepEqual(deleteResponse.payload.blockedSupermarkets, ['Mami'])
})
