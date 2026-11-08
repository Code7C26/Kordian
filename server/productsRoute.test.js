const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const { createCatalogPageCache } = require('./services/catalogPageCache')

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')
const paginationMigration = fs.readFileSync(
  path.join(__dirname, 'migrations', '20261108_catalog_page_only.sql'),
  'utf8',
)

function extractRouteHandler(source, method, routePath) {
  const routeStart = source.indexOf(`app.${method}('${routePath}'`)
  assert.notEqual(routeStart, -1, `Expected GET ${routePath} route`)

  const handlerStart = source.indexOf('async (req, res) => {', routeStart)
  const bodyStart = source.indexOf('{', handlerStart)
  let depth = 0
  let quote = null
  let escaped = false

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character
    } else if (character === '{') {
      depth += 1
    } else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return vm.runInNewContext(`(${source.slice(handlerStart, index + 1)})`, {})
      }
    }
  }

  assert.fail(`Could not find the end of GET ${routePath} route`)
}

function createRouteHarness() {
  const pendingImmediate = []
  const rpcCalls = []
  const scheduleCalls = []
  const handler = extractRouteHandler(serverSource, 'get', '/products')
  const context = {
    analysisWriter: {
      rpc: async (functionName, args) => {
        rpcCalls.push({ functionName, args })
        assert.equal(functionName, 'catalog_products_page')
        return {
          data: {
            data: [{ id: args.p_page * 100, name: `Página ${args.p_page}` }],
            total: 41,
            page: args.p_page,
            limit: args.p_limit,
          },
          error: null,
        }
      },
    },
    catalogPageCache: createCatalogPageCache(),
    catalogSortVersion: 'test-sort',
    priceStatusRulesVersion: 'test-rules',
    scheduleDiscoSearchResults: (search) => scheduleCalls.push(search),
    setImmediate: (callback) => pendingImmediate.push(callback),
    console,
  }
  const route = vm.runInNewContext(`(${handler.toString()})`, context)
  const createResponse = () => ({
    headers: {},
    statusCode: 200,
    set(name, value) {
      this.headers[name] = value
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
  })

  const normalizeJson = (value) => JSON.parse(JSON.stringify(value))
  return {
    async request(query = {}) {
      const response = createResponse()
      await route({ query }, response)
      for (const callback of pendingImmediate) callback()
      pendingImmediate.length = 0
      return response
    },
    normalizeJson,
    pendingImmediate,
    rpcCalls,
    scheduleCalls,
  }
}

test('public catalog search returns one RPC page and its total without an ordered ID array', async () => {
  const harness = createRouteHarness()

  const response = await harness.request({ search: 'leche', page: '1', limit: '20' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(harness.normalizeJson(response.payload), {
    data: [{ id: 100, name: 'Página 1' }],
    total: 41,
    page: 1,
    limit: 20,
  })
  assert.equal(response.headers['X-Catalog-Cache'], 'MISS')
  assert.deepEqual(harness.scheduleCalls, [])
  assert.deepEqual(harness.pendingImmediate, [])
  assert.deepEqual(harness.rpcCalls.map((call) => call.functionName), ['catalog_products_page'])
})

test('catalog endpoint preserves all active filter and ordering arguments', async () => {
  const harness = createRouteHarness()

  await harness.request({
    search: 'leche entera',
    category: '12',
    subcategory: '23',
    brand: '34',
    supermarket: 'Disco',
    status: 'OFERTA',
    sort: 'price-asc',
    maxPrice: '5000',
    favoritesOnly: 'true',
    favorites: '9,4,9',
    catalogOnly: 'true',
    page: '3',
    limit: '15',
  })

  assert.deepEqual(harness.normalizeJson(harness.rpcCalls[0].args), {
    p_search: 'leche entera',
    p_category: '12',
    p_subcategory: '23',
    p_brand: '34',
    p_supermarket: 'Disco',
    p_price_status: 'OFERTA',
    p_sort: 'price-asc',
    p_max_price: 5000,
    p_favorites_only: true,
    p_favorite_ids: [9, 4],
    p_valid_only: true,
    p_rules_version: 'test-rules',
    p_page: 3,
    p_limit: 15,
  })
  assert.deepEqual(harness.scheduleCalls, [])
})

test('sequential page requests fetch only requested pages without hydration or prefetch', async () => {
  const harness = createRouteHarness()

  const first = await harness.request({ search: 'leche', page: '1', limit: '20' })
  const second = await harness.request({ search: 'leche', page: '2', limit: '20' })

  assert.equal(first.payload.page, 1)
  assert.equal(second.payload.page, 2)
  assert.equal(second.payload.data[0].id, 200)
  assert.equal(second.payload.total, 41)
  assert.deepEqual(harness.scheduleCalls, [])
  assert.deepEqual(harness.pendingImmediate, [])
  assert.deepEqual(harness.rpcCalls.map((call) => call.args.p_page), [1, 2])
})

test('same query and page reuse cache while different filters use separate entries', async () => {
  const harness = createRouteHarness()
  const first = await harness.request({ search: 'leche', page: '1', limit: '20' })
  const repeated = await harness.request({ search: 'leche', page: '1', limit: '20' })
  const filtered = await harness.request({
    search: 'leche',
    category: '12',
    page: '1',
    limit: '20',
  })

  assert.equal(first.headers['X-Catalog-Cache'], 'MISS')
  assert.equal(repeated.headers['X-Catalog-Cache'], 'HIT')
  assert.equal(filtered.headers['X-Catalog-Cache'], 'MISS')
  assert.equal(harness.rpcCalls.length, 2)
})

test('pagination migration removes the all-results ID CTE and response field', () => {
  assert.match(paginationMigration, /catalog_products_page\(integer, integer, text/)
  assert.match(paginationMigration, /ordered_cte_start := strpos\(function_definition, 'ordered_ids AS \('\)/)
  assert.match(paginationMigration, /strpos\(function_definition, '''orderedIds'''\)/)
  assert.match(paginationMigration, /substring\(function_definition FROM page_rows_start\)/)
  assert.match(paginationMigration, /ordered_ids_field text := \$field\$[\s\S]*?'orderedIds', \(SELECT ids FROM ordered_ids\),/)
  assert.match(paginationMigration, /page_rows AS \(/)
  assert.match(paginationMigration, /'''total'', \(SELECT total FROM counted\)'/)
  assert.match(paginationMigration, /'''page'', \(SELECT page FROM params\)'/)
  assert.match(paginationMigration, /'''limit'', \(SELECT page_limit FROM params\)'/)
  assert.match(paginationMigration, /IF strpos\(function_definition, 'ordered_ids'\) > 0\s+OR strpos\(function_definition, '''orderedIds'''\) > 0 THEN/)
})

test('Disco preview and selected-product import routes remain admin-protected', () => {
  assert.match(serverSource, /app\.get\('\/admin\/import\/disco\/preview', requireAdmin,/)
  assert.match(serverSource, /app\.post\('\/admin\/import\/disco', requireAdmin,/)
})

test('Disco preview route returns mocked preview and local-match results', async () => {
  const previewProduct = { sourceProductId: 'disco-preview-1', name: 'Licuadora' }
  const matchedProduct = { ...previewProduct, possibleDuplicate: false }
  const handler = extractRouteHandler(serverSource, 'get', '/admin/import/disco/preview')
  const context = {
    fetchDiscoPreviewReport: async (options) => {
      assert.deepEqual(JSON.parse(JSON.stringify(options)), { query: 'licuadora', from: 0, to: 99 })
      return { products: [previewProduct], discarded: [] }
    },
    readAllProductsForImport: async (select) => {
      assert.equal(select, 'id, name, source, source_product_id, ean')
      return { data: [], error: null }
    },
    findPreviewMatches: (products, localProducts) => {
      assert.deepEqual(localProducts, [])
      return products.map(() => matchedProduct)
    },
    console,
  }
  const response = {
    statusCode: 200,
    json(payload) {
      this.payload = payload
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
  }
  const route = vm.runInNewContext(`(${handler.toString()})`, context)

  await route({ query: { query: 'licuadora' } }, response)

  assert.equal(response.statusCode, 200)
  assert.equal(response.payload.source, 'Disco')
  assert.deepEqual(JSON.parse(JSON.stringify(response.payload.products)), [matchedProduct])
})

test('admin import route imports selected products using mocked database writes', async () => {
  const selectedProduct = {
    sourceProductId: 'disco-selected-1',
    name: 'Licuadora',
    brand: 'Marca',
    price: 25000,
    ean: '7790000000001',
  }
  const writes = []
  const invalidations = []
  const insertResults = {
    products: { id: 101 },
    offers: { id: 202 },
  }
  const database = {
    from(table) {
      return {
        select() {
          return this
        },
        then(resolve, reject) {
          const data = table === 'categories'
            ? [{ id: 1, name: 'Electrodomésticos' }]
            : table === 'subcategories'
              ? [{ id: 2, name: 'Licuadoras', category_id: 1 }]
              : []
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
        insert(payload) {
          writes.push({ table, payload })
          return {
            select() {
              return this
            },
            single: async () => ({ data: insertResults[table], error: null }),
          }
        },
      }
    },
  }
  const route = vm.runInNewContext(`(${extractRouteHandler(serverSource, 'post', '/admin/import/disco').toString()})`, {
    analysisWriter: database,
    readAllRowsForImport: async (table) => ({
      data: table === 'brands' ? [{ id: 5, name: 'Marca' }] : [],
      error: null,
    }),
    readAllProductsForImport: async () => ({ data: [], error: null }),
    isValidDiscoProduct: () => true,
    getDiscoProductClassification: () => ({
      proposedCategory: 'Electrodomésticos',
      proposedSubcategory: 'Licuadoras',
    }),
    suggestCatalogMapping: () => ({
      status: 'determined',
      category: 'Electrodomésticos',
      subcategory: 'Licuadoras',
    }),
    normalizeBrandName: (name) => String(name || '').trim().toLowerCase(),
    findCrossSourceProductMatch: () => null,
    buildDiscoProductTaxonomyFields: () => ({}),
    recordPriceHistory: async (entry) => {
      assert.equal(entry.source, 'disco_import')
      return 303
    },
    sameMoneyValue: (first, second) => Number(first) === Number(second),
    invalidateCatalogPageCache: () => invalidations.push('catalog'),
    invalidateAnalysisCache: () => invalidations.push('analysis'),
    console,
  })
  const response = {
    statusCode: 200,
    json(payload) {
      this.payload = payload
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
  }

  await route({ body: { products: [selectedProduct] } }, response)

  assert.equal(response.statusCode, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(response.payload.imported)), [
    { productId: 101, sourceProductId: 'disco-selected-1' },
  ])
  assert.deepEqual(writes.map((write) => write.table), ['products', 'offers'])
  assert.deepEqual(invalidations, ['catalog', 'analysis'])
})
