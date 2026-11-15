const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const { createAdminAuth } = require('./adminAuth')
const {
  createCategoryIntegrityHandlers,
  resolveCatalogClassification,
  validateProductClassification,
} = require('./services/categoryIntegrity')

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')
const migration = fs.readFileSync(
  path.join(__dirname, 'migrations', '20261108_category_subcategory_integrity.sql'),
  'utf8',
)
const productClassificationMigration = fs.readFileSync(
  path.join(__dirname, 'migrations', '20261110_product_classification_rpc.sql'),
  'utf8',
)
const deleteSubcategoryMigration = fs.readFileSync(
  path.join(__dirname, 'migrations', '20261112_delete_catalog_subcategory_rpc.sql'),
  'utf8',
)
const categorySubcategoryPreflight = fs.readFileSync(
  path.join(__dirname, 'scripts', 'preflight_category_subcategory_supabase.sql'),
  'utf8',
)
const categoryId = '00000000-0000-0000-0000-000000000002'
const subcategoryId = '00000000-0000-0000-0000-000000000010'

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

function createHandlers(responseForRpc, { database = {} } = {}) {
  const calls = []
  const errors = []
  database.rpc = async (functionName, args) => {
    calls.push({ functionName, args })
    return responseForRpc(functionName, args)
  }
  return {
    calls,
    errors,
    handlers: createCategoryIntegrityHandlers({
      database,
      logger: { error: (...args) => errors.push(args) },
    }),
  }
}

test('subcategory update and delete routes remain protected by requireAdmin', async () => {
  assert.match(serverSource, /app\.post\('\/subcategories', requireAdmin,/)
  assert.match(serverSource, /app\.put\('\/subcategories\/:id', requireAdmin, categoryIntegrityHandlers\.update\)/)
  assert.match(serverSource, /app\.delete\('\/subcategories\/:id', requireAdmin, categoryIntegrityHandlers\.remove\)/)
  assert.match(serverSource, /supabaseAdmin\.from\('subcategories'\)\s*\.insert/)

  const auth = createAdminAuth({ sessionSecret: 'category-integrity-test-secret' })
  const reject = createResponse()
  let continued = false
  auth.requireAdmin({ headers: {} }, reject, () => { continued = true })
  assert.equal(reject.statusCode, 401)
  assert.deepEqual(reject.payload, { error: 'Authentication required' })
  assert.equal(continued, false)

  const accept = createResponse()
  const token = auth.createAdminToken('test-admin')
  auth.requireAdmin({ headers: { authorization: `Bearer ${token}` } }, accept, () => { continued = true })
  assert.equal(continued, true)
})

test('updates a subcategory and preserves the existing response body', async () => {
  const { handlers, calls } = createHandlers(async () => ({
    data: {
      status: 'updated',
      subcategory: { id: subcategoryId, name: 'Lácteos', category_id: categoryId },
    },
    error: null,
  }))
  const response = createResponse()

  await handlers.update({
    params: { id: subcategoryId },
    body: { name: '  Lácteos  ', category_id: categoryId },
  }, response)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.payload, {
    id: subcategoryId,
    name: 'Lácteos',
    category_id: categoryId,
  })
  assert.deepEqual(calls, [{
    functionName: 'update_catalog_subcategory',
    args: {
      p_subcategory_id: subcategoryId,
      p_name: 'Lácteos',
      p_category_id: categoryId,
    },
  }])
})

test('rejects a parent change with associated products and reports the count', async () => {
  const { handlers, calls } = createHandlers(async () => ({
    data: { status: 'products_associated', product_count: 3 },
    error: null,
  }))
  const response = createResponse()

  await handlers.update({
    params: { id: subcategoryId },
    body: { name: 'Lácteos', category_id: categoryId },
  }, response)

  assert.equal(response.statusCode, 409)
  assert.equal(response.payload.product_count, 3)
  assert.match(response.payload.error, /reasignarse/)
  assert.equal(calls.length, 1)
})

test('translates concurrent subcategory update integrity errors into a conflict', async () => {
  const { handlers, errors } = createHandlers(async () => ({
    data: null,
    error: { code: '23503', message: 'foreign key violation' },
  }))
  const response = createResponse()

  await handlers.update({
    params: { id: subcategoryId },
    body: { name: 'Lácteos', category_id: categoryId },
  }, response)

  assert.equal(response.statusCode, 409)
  assert.match(response.payload.error, /cambió durante la operación/)
  assert.equal(errors.length, 1)
})

test('maps subcategory update check violations to a generic integrity conflict', async () => {
  const { handlers } = createHandlers(async () => ({
    data: null,
    error: { code: '23514', message: 'check constraint violation' },
  }))
  const response = createResponse()

  await handlers.update({
    params: { id: subcategoryId },
    body: { name: 'Lácteos', category_id: categoryId },
  }, response)

  assert.equal(response.statusCode, 409)
  assert.match(response.payload.error, /conflicto de integridad/)
  assert.doesNotMatch(response.payload.error, /productos asociados/)
})

test('rejects a missing destination category without a partial update', async () => {
  const { handlers, calls } = createHandlers(async () => ({
    data: { status: 'category_not_found' },
    error: null,
  }))
  const response = createResponse()

  await handlers.update({
    params: { id: subcategoryId },
    body: { name: 'Lácteos', category_id: '00000000-0000-0000-0000-000000000003' },
  }, response)

  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.payload, { error: 'Category not found' })
  assert.equal(calls.length, 1)
})

test('rejects a malformed category identifier before calling the database', async () => {
  const { handlers, calls } = createHandlers(async () => ({ data: null, error: null }))
  const response = createResponse()

  await handlers.update({
    params: { id: subcategoryId },
    body: { name: 'Lácteos', category_id: 'not-a-uuid' },
  }, response)

  assert.equal(response.statusCode, 400)
  assert.deepEqual(calls, [])
})

test('rejects malformed subcategory identifiers before calling the database', async () => {
  const { handlers, calls } = createHandlers(async () => ({ data: null, error: null }))
  const response = createResponse()

  await handlers.remove({ params: { id: 'not-a-uuid' } }, response)

  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.payload, { error: 'Invalid subcategory_id' })
  assert.deepEqual(calls, [])
})

test('deletes an unreferenced subcategory and preserves its response contract', async () => {
  const { handlers, calls } = createHandlers(async () => ({
    data: { status: 'deleted' },
    error: null,
  }))
  const response = createResponse()

  await handlers.remove({ params: { id: subcategoryId } }, response)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.payload, { success: true })
  assert.equal(calls[0].functionName, 'delete_catalog_subcategory')
})

test('rejects deletion with associated products and reports the count', async () => {
  const { handlers, calls } = createHandlers(async () => ({
    data: { status: 'products_associated', product_count: 7 },
    error: null,
  }))
  const response = createResponse()

  await handlers.remove({ params: { id: subcategoryId } }, response)

  assert.equal(response.statusCode, 409)
  assert.equal(response.payload.product_count, 7)
  assert.match(response.payload.error, /productos asociados/)
  assert.equal(calls.length, 1)
})

test('rejects deletion with associated comparable groups and reports the count', async () => {
  const { handlers } = createHandlers(async () => ({
    data: { status: 'comparable_groups_associated', comparable_group_count: 2 },
    error: null,
  }))
  const response = createResponse()

  await handlers.remove({ params: { id: subcategoryId } }, response)

  assert.equal(response.statusCode, 409)
  assert.equal(response.payload.comparable_group_count, 2)
  assert.match(response.payload.error, /grupos comparables asociados/)
})

test('returns not found when the delete RPC reports an unknown subcategory', async () => {
  const { handlers } = createHandlers(async () => ({
    data: { status: 'not_found' },
    error: null,
  }))
  const response = createResponse()

  await handlers.remove({ params: { id: subcategoryId } }, response)

  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.payload, { error: 'Subcategory not found' })
})

test('translates concurrent subcategory delete integrity errors into a conflict', async () => {
  const { handlers, errors } = createHandlers(async () => ({
    data: null,
    error: { code: '23503', message: 'foreign key violation' },
  }))
  const response = createResponse()

  await handlers.remove({ params: { id: subcategoryId } }, response)

  assert.equal(response.statusCode, 409)
  assert.match(response.payload.error, /productos asociados o cambió/)
  assert.equal(errors.length, 1)
})

test('maps unknown check violations to a generic integrity conflict', async () => {
  const { handlers } = createHandlers(async () => ({
    data: null,
    error: { code: '23514', message: 'check constraint violation' },
  }))
  const response = createResponse()

  await handlers.remove({ params: { id: subcategoryId } }, response)

  assert.equal(response.statusCode, 409)
  assert.match(response.payload.error, /conflicto de integridad/)
  assert.doesNotMatch(response.payload.error, /productos asociados/)
})

test('reports RPC errors and missing service-role configuration without fallback writes', async () => {
  const rpcError = new Error('database unavailable')
  const { handlers, errors } = createHandlers(async () => ({ data: null, error: rpcError }))
  const failedResponse = createResponse()

  await handlers.remove({ params: { id: subcategoryId } }, failedResponse)
  assert.equal(failedResponse.statusCode, 500)
  assert.deepEqual(failedResponse.payload, { error: 'Error deleting subcategory' })
  assert.equal(errors.length, 1)

  const missingRpc = createHandlers(async () => ({
    data: null,
    error: { code: 'PGRST202', message: 'function not found' },
  }))
  const missingRpcResponse = createResponse()
  await missingRpc.handlers.remove({ params: { id: subcategoryId } }, missingRpcResponse)
  assert.equal(missingRpcResponse.statusCode, 503)
  assert.equal(missingRpcResponse.payload.code, 'integrity_rpc_unavailable')
  const missingUpdateRpc = createHandlers(async () => ({
    data: null,
    error: { code: 'PGRST202', message: 'function not found' },
  }))
  const missingUpdateRpcResponse = createResponse()
  await missingUpdateRpc.handlers.update({
    params: { id: subcategoryId },
    body: { name: 'Lácteos', category_id: categoryId },
  }, missingUpdateRpcResponse)
  assert.equal(missingUpdateRpcResponse.statusCode, 503)
  assert.equal(missingUpdateRpcResponse.payload.code, 'integrity_rpc_unavailable')

  const unavailable = createCategoryIntegrityHandlers({ database: null, logger: { error() {} } })
  const unavailableResponse = createResponse()
  await unavailable.update({
    params: { id: subcategoryId },
    body: { name: 'Lácteos', category_id: categoryId },
  }, unavailableResponse)
  assert.equal(unavailableResponse.statusCode, 503)
})

test('migration preflights and adds the composite category-subcategory integrity constraints', () => {
  assert.match(migration, /SET LOCAL lock_timeout = '3s'/)
  assert.match(migration, /Expected classification\/subcategory RPCs from their dedicated migrations/)
  assert.match(migration, /ADD CONSTRAINT products_subcategory_category_integrity_fkey\s+FOREIGN KEY \(subcategory_id, category_id\)\s+REFERENCES public\.subcategories \(id, category_id\)\s+MATCH SIMPLE\s+ON UPDATE NO ACTION\s+ON DELETE NO ACTION\s+NOT VALID/)
  assert.match(migration, /ADD CONSTRAINT products_subcategory_requires_category_check\s+CHECK \(subcategory_id IS NULL OR category_id IS NOT NULL\)\s+NOT VALID/)
  assert.match(migration, /ALTER TABLE public\.products VALIDATE CONSTRAINT/)
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.update_catalog_product_classification/)
})

test('product classification RPC remains isolated and service-role only', () => {
  assert.match(productClassificationMigration, /CREATE OR REPLACE FUNCTION public\.update_catalog_product_classification\(\s*p_product_id integer/)
  assert.match(productClassificationMigration, /SECURITY INVOKER/)
  assert.match(productClassificationMigration, /REVOKE ALL ON FUNCTION public\.update_catalog_product_classification\(integer, uuid\)\s+FROM PUBLIC, anon, authenticated/)
  assert.match(productClassificationMigration, /GRANT EXECUTE ON FUNCTION public\.update_catalog_product_classification\(integer, uuid\)\s+TO service_role/)
  assert.doesNotMatch(productClassificationMigration, /update_catalog_product_classification\(bigint, uuid\)/)
})

test('corrective delete RPC uses the current schema and preserves its restricted contract', () => {
  assert.match(deleteSubcategoryMigration, /SET LOCAL lock_timeout = '3s'/)
  assert.match(deleteSubcategoryMigration, /public\.products\.subcategory_id/)
  assert.match(deleteSubcategoryMigration, /CREATE OR REPLACE FUNCTION public\.delete_catalog_subcategory\(\s*p_subcategory_id uuid\s*\)/)
  assert.match(deleteSubcategoryMigration, /SECURITY INVOKER/)
  assert.match(deleteSubcategoryMigration, /SET search_path = pg_catalog, public/)
  assert.match(deleteSubcategoryMigration, /WHERE id = p_subcategory_id\s+FOR UPDATE/)
  assert.match(deleteSubcategoryMigration, /FROM public\.products\s+WHERE subcategory_id = p_subcategory_id/)
  assert.match(deleteSubcategoryMigration, /'status', 'products_associated',\s+'product_count', v_product_count/)
  assert.match(deleteSubcategoryMigration, /'comparable_group_count', v_comparable_group_count/)
  assert.match(deleteSubcategoryMigration, /FROM public\.comparable_groups\s+WHERE subcategory_id = p_subcategory_id/)
  assert.match(deleteSubcategoryMigration, /'status', 'comparable_groups_associated',\s+'comparable_group_count', v_comparable_group_count/)
  assert.match(deleteSubcategoryMigration, /confdeltype IN \('r', 'a'\)/)
  assert.match(deleteSubcategoryMigration, /convalidated/)
  assert.match(deleteSubcategoryMigration, /'status', 'not_found'/)
  assert.match(deleteSubcategoryMigration, /'status', 'deleted'/)
  assert.match(deleteSubcategoryMigration, /v_fk\.confdeltype = 'c'/)
  assert.match(deleteSubcategoryMigration, /ON DELETE RESTRICT NOT VALID/)
  assert.match(deleteSubcategoryMigration, /v_matching_fk_count > 1/)
  assert.match(deleteSubcategoryMigration, /expected CASCADE, RESTRICT, or NO ACTION/)
  assert.match(deleteSubcategoryMigration, /REVOKE ALL ON FUNCTION public\.delete_catalog_subcategory\(uuid\)\s+FROM PUBLIC, anon, authenticated/)
  assert.match(deleteSubcategoryMigration, /GRANT EXECUTE ON FUNCTION public\.delete_catalog_subcategory\(uuid\)\s+TO service_role/)
})

test('delete migration preserves the restrictive comparable-group contract', () => {
  assert.match(deleteSubcategoryMigration, /expected CASCADE, RESTRICT, or NO ACTION/)
})

test('read-only Supabase preflight requires a validated restrictive comparable-group foreign key', () => {
  assert.match(categorySubcategoryPreflight, /c\.confdeltype IN \('r', 'a'\)\s+AND c\.convalidated/)
  assert.match(categorySubcategoryPreflight, /'expected_on_delete', 'RESTRICT or NO ACTION'/)
  assert.doesNotMatch(categorySubcategoryPreflight, /'expected_on_delete', 'CASCADE'/)
})

function classificationDatabase({ categories = [], subcategories = [], failureTable } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      return {
        select() {
          return {
            eq(column, id) {
              return {
                async maybeSingle() {
                  calls.push({ table, column, id })
                  if (table === failureTable) return { data: null, error: new Error('database unavailable') }
                  const rows = table === 'categories' ? categories : subcategories
                  return { data: rows.find((row) => String(row.id) === String(id)) || null, error: null }
                },
              }
            },
          }
        },
      }
    },
  }
}

test('validates product category and subcategory pairs and infers category from a selected subcategory', async () => {
  const database = classificationDatabase({
    categories: [{ id: categoryId }],
    subcategories: [{ id: subcategoryId, category_id: categoryId }],
  })

  assert.deepEqual(await validateProductClassification(database, categoryId, subcategoryId), {
    valid: true,
    categoryId,
    subcategoryId,
  })
  assert.deepEqual(await validateProductClassification(database, null, subcategoryId), {
    valid: true,
    categoryId,
    subcategoryId,
  })
  assert.deepEqual(await validateProductClassification(database, categoryId, null), {
    valid: true,
    categoryId,
    subcategoryId: null,
  })
})

test('rejects invalid UUIDs, missing references, incompatible pairs, and database errors', async () => {
  const database = classificationDatabase({
    categories: [{ id: categoryId }],
    subcategories: [{ id: subcategoryId, category_id: categoryId }],
  })

  assert.equal((await validateProductClassification(database, 'bad-id', null)).status, 400)
  assert.equal((await validateProductClassification(database, categoryId, 'bad-id')).status, 400)
  assert.equal((await validateProductClassification(database, '00000000-0000-0000-0000-000000000099', null)).error, 'Category not found')
  assert.equal((await validateProductClassification(database, categoryId, '00000000-0000-0000-0000-000000000099')).error, 'Subcategory not found')
  assert.equal((await validateProductClassification(database, '00000000-0000-0000-0000-000000000003', subcategoryId)).status, 409)

  const failingDatabase = classificationDatabase({ failureTable: 'categories' })
  assert.equal((await validateProductClassification(failingDatabase, categoryId, null)).status, 500)
})

test('allows category-only classifications for Mami, Disco, and Carrefour while rejecting incompatible subcategories', () => {
  const categories = [{ id: categoryId, name: 'Alimentos' }]
  const subcategories = [{ id: subcategoryId, category_id: categoryId, name: 'Lácteos' }]

  for (const source of ['Mami', 'Disco', 'Carrefour']) {
    const categoryOnly = resolveCatalogClassification({
      source,
      sourceProductId: `${source}-1`,
      proposedCategory: 'Alimentos',
      proposedSubcategory: null,
      categories,
      subcategories,
      allowWithoutSubcategory: true,
    })
    assert.equal(categoryOnly.valid, true)
    assert.equal(categoryOnly.subcategory, null)

    const valid = resolveCatalogClassification({
      source,
      sourceProductId: `${source}-2`,
      proposedCategory: 'Alimentos',
      proposedSubcategory: 'Lácteos',
      categories,
      subcategories,
    })
    assert.equal(valid.valid, true)

    const invalid = resolveCatalogClassification({
      source,
      sourceProductId: `${source}-3`,
      proposedCategory: 'Alimentos',
      proposedSubcategory: 'Bebidas',
      categories,
      subcategories,
    })
    assert.equal(invalid.valid, false)
    assert.match(invalid.reason, new RegExp(source))
  }

  assert.equal((serverSource.match(/allowWithoutSubcategory: true/g) || []).length, 4)
})

test('product classification routes remain admin-only and update both identifiers atomically', () => {
  assert.match(serverSource, /app\.put\('\/products\/:id\/classification', requireAdmin,/)
  assert.match(serverSource, /app\.post\('\/products', requireAdmin,/)
  assert.match(serverSource, /app\.put\('\/products\/:id', requireAdmin,/)
  assert.match(serverSource, /supabaseAdmin\.rpc\('update_catalog_product_classification'/)
  assert.match(serverSource, /changes\.category_id = classification\.categoryId\s+changes\.subcategory_id = classification\.subcategoryId/)
  assert.match(serverSource, /A category is required when a subcategory is selected/)
  assert.match(serverSource, /error\.code === '23503' \|\| error\.code === '23514'/)
})