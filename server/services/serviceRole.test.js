const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const {
  createServiceRoleMiddleware,
  getAdminAuthDatabase,
  getServiceRoleDatabase,
  requireServiceRoleDatabase,
} = require('./serviceRole')

test('missing service-role configuration rejects privileged access with a sanitized error', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_URL = 'https://example.invalid'
  delete process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    assert.throws(getServiceRoleDatabase, {
      code: 'SERVICE_ROLE_NOT_CONFIGURED',
      status: 503,
    })
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  }
})

test('privileged middleware returns an explicit 503 without leaking credentials', () => {
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

  createServiceRoleMiddleware(null)({}, response, () => { nextCalled = true })

  assert.equal(response.statusCode, 503)
  assert.equal(response.payload.code, 'SERVICE_ROLE_NOT_CONFIGURED')
  assert.match(response.payload.error, /acceso privado del servidor/)
  assert.equal(JSON.stringify(response.payload).includes('SUPABASE_SERVICE_ROLE_KEY'), false)
  assert.equal(nextCalled, false)
})

test('configured privileged clients pass the guard and are required by database services', () => {
  const client = { from() {}, rpc() {} }
  let nextCalled = false
  createServiceRoleMiddleware(client)({}, {}, () => { nextCalled = true })

  assert.equal(nextCalled, true)
  assert.equal(requireServiceRoleDatabase(client), client)
})

test('admin credential lookup uses service role in production and anon only in development', () => {
  const serviceRoleDatabase = { from() {} }
  const publicDatabase = { from() {} }

  assert.equal(getAdminAuthDatabase({
    serviceRoleDatabase,
    publicDatabase,
    nodeEnv: 'production',
  }), serviceRoleDatabase)
  assert.equal(getAdminAuthDatabase({
    serviceRoleDatabase: null,
    publicDatabase,
    nodeEnv: 'development',
  }), publicDatabase)
  assert.throws(() => getAdminAuthDatabase({
    serviceRoleDatabase: null,
    publicDatabase,
    nodeEnv: 'production',
  }), {
    code: 'SERVICE_ROLE_NOT_CONFIGURED',
    status: 503,
  })
  assert.throws(() => getAdminAuthDatabase({
    serviceRoleDatabase: null,
    publicDatabase,
    nodeEnv: undefined,
  }), {
    code: 'SERVICE_ROLE_NOT_CONFIGURED',
    status: 503,
  })
})

test('the backend keeps public and privileged clients separate', () => {
  const root = path.resolve(__dirname, '..', '..')
  const serverFiles = [path.join(root, 'server', 'server.js')]
  const publicClientFiles = [path.join(root, 'server', 'supabase.js')]

  for (const file of serverFiles) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /createServiceRoleMiddleware\(supabaseAdmin\)/)
    assert.match(source, /requireServiceRole\(req, res, next\)/)
    assert.match(source, /const analysisReader = supabase\s*(?:\r?\n|$)/)
    assert.match(source, /const analysisWriter = supabaseAdmin\s*(?:\r?\n|$)/)
    assert.match(source, /getAdminAuthDatabase\(\{/)
    assert.match(source, /app\.get\('\/categories'[\s\S]{0,300}supabase\.from\('categories'\)/)
    assert.match(source, /app\.get\('\/brands'[\s\S]{0,300}supabase\.from\('brands'\)/)
    assert.match(source, /app\.get\('\/supermarkets'[\s\S]{0,350}supabase\.from\('supermarkets'\)/)
    assert.doesNotMatch(
      source,
      /supabase\.from\(['"](?:offers|products|price_history|price_analysis|price_update_log|brands|categories|subcategories|supermarkets|admins)['"]\)\s*\.(?:insert|upsert|update|delete)\s*\(/,
    )
  }

  for (const file of publicClientFiles) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /SUPABASE_ANON_KEY/)
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/)
  }
})

test('admin credentials and private admin reads use the service-role client outside development', () => {
  const root = path.resolve(__dirname, '..', '..')
  const serverFiles = [path.join(root, 'server', 'server.js')]

  for (const file of serverFiles) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /getAdminAuthDatabase\(\{\s*serviceRoleDatabase:\s*supabaseAdmin/)
    assert.match(source, /app\.get\('\/admins',\s*requireAdmin,\s*requireServiceRole,[\s\S]{0,180}?supabaseAdmin\.from\('admins'\)/)
    assert.match(source, /app\.get\('\/admin\/price-history',\s*requireAdmin,\s*requireServiceRole,[\s\S]{0,220}?supabaseAdmin\s*\.from\('price_history'\)/)
    assert.match(source, /app\.get\('\/admin\/import\/disco\/sync-status',\s*requireAdmin,\s*requireServiceRole,[\s\S]{0,180}?supabaseAdmin\s*\.from\('price_update_log'\)/)
    assert.match(source, /app\.get\('\/admin\/import\/disco\/import-status',\s*requireAdmin,\s*requireServiceRole,[\s\S]{0,180}?supabaseAdmin\s*\.from\('price_update_log'\)/)
    assert.match(source, /app\.post\('\/admins',\s*requireAdmin,[\s\S]{0,300}?supabaseAdmin\.from\('admins'\)\.select\('id'\)/)
  }
})
