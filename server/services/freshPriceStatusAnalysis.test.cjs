const assert = require('node:assert/strict')
const test = require('node:test')
const {
  createFreshPriceStatusAnalyzer,
  readLegacyComparableProducts,
} = require('./freshPriceStatusAnalysis')

function createDatabase(state, selections = []) {
  return {
    from(table) {
      const query = {
        filters: [],
        select(selection) {
          selections.push({ table, selection })
          return this
        },
        in(column, values) {
          this.filters.push((row) => values.map(String).includes(String(row[column])))
          return this
        },
        or() {
          this.filters.push((row) => !row.category_id || !row.subcategory_id)
          return this
        },
        order() { return this },
        range(start, end) {
          return this.execute(start, end)
        },
        async execute(start, end) {
          const rows = (state[table] || [])
            .filter((row) => this.filters.every((filter) => filter(row)))
            .slice(start, end + 1)
          return { data: rows, error: null }
        },
      }
      return query
    },
    async rpc(name, args) {
      assert.equal(name, 'get_product_price_status_refresh_history')
      assert.deepEqual(args.p_product_ids, [1])
      return { data: state.updateLogs || [], error: null }
    },
  }
}

function createAnalyzer(state, onAnalyze, options = {}) {
  return createFreshPriceStatusAnalyzer({
    database: createDatabase(state),
    ...options,
    async createAnalysisContext(products) {
      return { productIds: products.map((product) => String(product.id)) }
    },
    async analyzeProduct(product, products, history, categoryName, context) {
      return onAnalyze({ product, products, history, categoryName, context })
    },
  })
}

test('fresh analysis finds a product created after the analyzer was constructed', async () => {
  const state = { products: [], price_history: [] }
  const analyzer = createAnalyzer(state, ({ product }) => ({ product, classification: 'OFERTA' }))
  state.products.push({ id: 1, name: 'Nuevo', offers: [], category_id: 'c1', subcategory_id: 's1' })
  state.product_price_status_comparable_group_memberships = [
    { product_id: 1, group_key: '["ids","c1","s1"]' },
  ]

  const result = await analyzer.analyzeProductIds([1])
  assert.equal(result[0].product.name, 'Nuevo')
})

test('fresh analysis reads offers changed outside the process and includes current comparables', async () => {
  const state = {
    products: [{
      id: 1,
      name: 'Arroz 1kg',
      category_id: 'c1',
      subcategory_id: 's1',
      categories: { name: 'Alimentos' },
      offers: [{ id: 1, cash_price: 150 }],
    }, {
      id: 2,
      name: 'Arroz 2kg',
      category_id: 'c1',
      subcategory_id: 's1',
      offers: [{ id: 2, cash_price: 300 }],
    }],
    product_price_status_comparable_group_memberships: [
      { product_id: 1, group_key: '["ids","c1","s1"]' },
      { product_id: 2, group_key: '["ids","c1","s1"]' },
    ],
    price_history: [],
  }
  const analyzer = createAnalyzer(state, ({ product, products, categoryName, context }) => ({
    product,
    currentPrice: product.offers[0].cash_price,
    comparablePrice: products.find((candidate) => candidate.id === 2).offers[0].cash_price,
    categoryName,
    context,
  }))

  state.products[0].offers[0].cash_price = 175
  const [result] = await analyzer.analyzeProductIds([1])
  assert.equal(result.currentPrice, 175)
  assert.equal(result.comparablePrice, 300)
  assert.equal(result.categoryName, 'Alimentos')
})

test('existing products without offers are still analyzed rather than treated as empty work', async () => {
  const state = {
    products: [{ id: 1, name: 'Sin oferta', offers: [], category_id: 'c1', subcategory_id: 's1' }],
    product_price_status_comparable_group_memberships: [
      { product_id: 1, group_key: '["ids","c1","s1"]' },
    ],
    price_history: [],
  }
  const analyzer = createAnalyzer(state, ({ product }) => ({
    product,
    classification: product.offers.length ? 'OFERTA' : 'INFORMACION_INSUFICIENTE',
  }))

  const [result] = await analyzer.analyzeProductIds([1])
  assert.equal(result.classification, 'INFORMACION_INSUFICIENTE')
})

test('missing products reject instead of producing an empty successful result', async () => {
  const analyzer = createAnalyzer({ products: [], price_history: [] }, () => null)
  await assert.rejects(
    analyzer.analyzeProductIds([1]),
    (error) => error.code === 'PRICE_STATUS_PRODUCT_MISSING',
  )
})

test('database read errors are propagated instead of becoming empty analyses', async () => {
  const failure = new Error('fresh product read failed')
  const analyzer = createFreshPriceStatusAnalyzer({
    database: {
      from() {
        return {
          select() { return this },
          in() { return this },
          order() { return this },
          async range() { return { data: null, error: failure } },
        }
      },
    },
    analyzeProduct: async () => null,
    createAnalysisContext: async () => ({}),
  })

  await assert.rejects(analyzer.analyzeProductIds([1]), failure)
})

test('calculation errors are propagated to the durable retry path', async () => {
  const failure = new Error('price calculation failed')
  const analyzer = createAnalyzer({
    products: [{ id: 1, name: 'Producto', offers: [], category_id: 'c1', subcategory_id: 's1' }],
    product_price_status_comparable_group_memberships: [
      { product_id: 1, group_key: null },
    ],
    price_history: [],
  }, () => {
    throw failure
  })

  await assert.rejects(analyzer.analyzeProductIds([1]), failure)
})

test('history and bulk update logs are loaded freshly for the target product', async () => {
  const state = {
    products: [{ id: 1, name: 'Producto', offers: [], category_id: 'c1', subcategory_id: 's1' }],
    product_price_status_comparable_group_memberships: [
      { product_id: 1, group_key: '["ids","c1","s1"]' },
    ],
    price_history: [{ product_id: 1, offer_id: 9, observed_at: '2026-01-01', cash_price: 100 }],
    updateLogs: [{
      updated_at: '2026-02-01',
      changes: [{ productId: 1, offerId: 9, updatedCashPrice: 120 }],
    }],
  }
  const analyzer = createAnalyzer(state, ({ history }) => ({ history }))

  const [result] = await analyzer.analyzeProductIds([1])
  assert.deepEqual(result.history.map((point) => point.cash_price), [100, 120])
})

test('fresh analysis uses persisted inferred groups without scanning unrelated unclassified products', async () => {
  const inferredGroup = '["classification","alimentos","golosinas"]'
  const state = {
    products: [{
      id: 1,
      name: 'Alfajor de chocolate',
      offers: [],
    }, {
      id: 2,
      name: 'Alfajor clásico',
      offers: [{ id: 2, cash_price: 250 }],
    }, {
      id: 3,
      name: 'Producto sin clasificación',
      offers: [{ id: 3, cash_price: 500 }],
    }],
    product_price_status_comparable_group_memberships: [
      { product_id: 1, group_key: inferredGroup },
      { product_id: 2, group_key: inferredGroup },
      { product_id: 3, group_key: null },
    ],
    price_history: [],
  }
  const analyzer = createAnalyzer(state, ({ product, products }) => ({
    productId: product.id,
    analyzedProductIds: products.map((candidate) => candidate.id),
  }))

  const [result] = await analyzer.analyzeProductIds([1])
  assert.deepEqual(result.analyzedProductIds, [1, 2])
})

test('analysis fails closed when a target has no persisted comparability mapping', async () => {
  const analyzer = createAnalyzer({
    products: [{ id: 1, name: 'Producto', offers: [] }],
    product_price_status_comparable_group_memberships: [],
    price_history: [],
  }, () => null)

  await assert.rejects(
    analyzer.analyzeProductIds([1]),
    (error) => error.code === 'PRICE_STATUS_COMPARABILITY_MAPPING_MISSING',
  )
})

test('legacy in-memory analysis does not require the durable membership table', async () => {
  const state = {
    products: [{
      id: 1,
      name: 'Arroz 1kg',
      category_id: 'c1',
      subcategory_id: 's1',
      offers: [],
    }, {
      id: 2,
      name: 'Arroz 2kg',
      category_id: 'c1',
      subcategory_id: 's1',
      offers: [],
    }],
    price_history: [],
  }
  const analyzer = createAnalyzer(state, ({ products }) => ({
    analyzedProductIds: products.map((product) => product.id),
  }), { loadComparableProducts: readLegacyComparableProducts })

  const [result] = await analyzer.analyzeProductIds([1])
  assert.deepEqual(result.analyzedProductIds, [1, 2])
})

test('fresh analysis selects subcategories through the category-integrity foreign key', async () => {
  const selections = []
  const database = createDatabase({
    products: [{
      id: 1,
      category_id: 'c1',
      subcategory_id: 's1',
      offers: [],
    }],
    price_history: [],
  }, selections)
  const analyzer = createFreshPriceStatusAnalyzer({
    database,
    analyzeProduct: async (product) => ({ product, classification: 'OFERTA' }),
    createAnalysisContext: async () => ({}),
    loadComparableProducts: readLegacyComparableProducts,
    loadPriceUpdateLogs: async () => [],
  })

  await analyzer.analyzeProductIds([1])

  assert.ok(selections.some(({ table, selection }) => (
    table === 'products'
      && selection.includes('subcategories!products_subcategory_category_integrity_fkey(name)')
  )))
})
