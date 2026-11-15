const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const { createDiscoSearchImportHandler } = require('./discoSearchImportHandler')

function createResponse() {
  return {
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
}

test('rejects a missing service-role client before starting Disco import', async () => {
  let importStarted = false
  const response = createResponse()
  const handler = createDiscoSearchImportHandler({
    database: null,
    importSearchResults: async () => { importStarted = true },
    logger: { error() {} },
  })

  await handler({ body: { search: 'yerba' }, admin: 'admin1' }, response)

  assert.equal(response.statusCode, 503)
  assert.equal(response.payload.code, 'SERVICE_ROLE_NOT_CONFIGURED')
  assert.equal(importStarted, false)
})

test('runs an explicitly requested Disco import with the authenticated administrator', async () => {
  const database = { from() {} }
  const calls = []
  const response = createResponse()
  const handler = createDiscoSearchImportHandler({
    database,
    importSearchResults: async (...args) => {
      calls.push(args)
      return { imported: 2, updated: 1, discarded: 0 }
    },
    logger: { error() {} },
  })

  await handler({ body: { search: '  yerba  ' }, admin: 'admin1' }, response)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(calls, [['yerba', 'admin1']])
  assert.deepEqual(response.payload, {
    query: 'yerba',
    imported: 2,
    updated: 1,
    discarded: 0,
  })
})

test('returns a recognizable capacity error when an import enqueue is rejected', async () => {
  const response = createResponse()
  const handler = createDiscoSearchImportHandler({
    database: { from() {} },
    importSearchResults: async () => {
      const error = new Error('PRICE_STATUS_QUEUE_CAPACITY_EXCEEDED')
      error.code = 'P7501'
      throw error
    },
    logger: { error() {} },
  })

  await handler({ body: { search: 'yerba' }, admin: 'admin1' }, response)

  assert.equal(response.statusCode, 503)
  assert.equal(response.payload.code, 'price_status_queue_capacity_exceeded')
  assert.equal(response.payload.partialWriteState, 'unknown')
  assert.match(response.payload.error, /revisa el catálogo antes de reintentar/)
})

test('public product GET routes do not invoke Disco imports and admin import routes are protected', () => {
  const root = path.resolve(__dirname, '..', '..')
  const file = path.join(root, 'server', 'server.js')
  const source = fs.readFileSync(file, 'utf8')
  const routeStart = source.indexOf("app.get('/products',")
  assert.notEqual(routeStart, -1, `${file} has a public products route`)
  const nextRoute = source.indexOf('\napp.', routeStart + 1)
  const route = source.slice(routeStart, nextRoute === -1 ? source.length : nextRoute)
  assert.doesNotMatch(route, /importDiscoSearchResults|scheduleDiscoSearchResults/)
  assert.match(
    source,
    /app\.post\('\/admin\/import\/disco\/search',\s*requireAdmin,\s*requireCatalogWritesFor\('Disco'\),\s*discoSearchImportHandler\)/,
  )
  assert.match(source, /createDiscoSearchImportHandler\(\{\s*database:\s*supabaseAdmin/)

  const importStart = source.indexOf('async function importDiscoSearchResults')
  const fetchStart = source.indexOf('await fetchDiscoPreviewReport', importStart)
  assert.ok(importStart >= 0 && fetchStart > importStart)
  assert.ok(source.indexOf('requireServiceRoleDatabase(database)', importStart) < fetchStart)
})
