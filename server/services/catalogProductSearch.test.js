const test = require('node:test')
const assert = require('node:assert/strict')
const { rankCatalogSearchResults, searchCatalogProducts } = require('./catalogProductSearch')

test('search fallback matches terms across product names and brand names', () => {
  const results = rankCatalogSearchResults([
    { id: 1, name: 'Gaseosa Cola 1.5 L', brands: { name: 'Coca Cola' } },
    { id: 2, name: 'Coca Cola Zero 2.25 L', brands: { name: 'Coca Cola' } },
    { id: 3, name: 'Agua mineral 2 L', brands: { name: 'Otra' } },
  ], 'coca', 20)

  assert.deepEqual(results.map((product) => product.id), [2, 1])
})

test('search fallback deduplicates results and honors the result limit', () => {
  const results = rankCatalogSearchResults([
    { id: 1, name: 'Coca Cola Zero' },
    { id: 1, name: 'Coca Cola Zero' },
    { id: 2, name: 'Coca Cola Light' },
  ], 'coca', 1)

  assert.deepEqual(results.map((product) => product.id), [2])
})

test('database search fetches products by name and matching brand', async () => {
  const products = [
    { id: 1, name: 'Coca Cola Zero 2.25 L', brand_id: 'brand-coca', brands: { name: 'Coca Cola' } },
    { id: 2, name: 'Gaseosa Cola 1.5 L', brand_id: 'brand-coca', brands: { name: 'Coca Cola' } },
    { id: 3, name: 'Agua mineral 2 L', brand_id: 'brand-water', brands: { name: 'Agua' } },
  ]
  const brands = [
    { id: 'brand-coca', name: 'Coca Cola' },
    { id: 'brand-water', name: 'Agua' },
  ]

  const client = {
    from(table) {
      const filters = []
      const builder = {
        select() { return this },
        ilike(column, pattern) { filters.push({ type: 'ilike', column, pattern }); return this },
        in(column, values) { filters.push({ type: 'in', column, values }); return this },
        order() { return this },
        limit() { return this },
        then(resolve, reject) {
          const rows = table === 'brands' ? brands : products
          const data = rows.filter((row) => filters.every((filter) => {
            if (filter.type === 'in') return filter.values.includes(row[filter.column])
            const value = String(row[filter.column] || '').toLowerCase()
            return value.includes(filter.pattern.replaceAll('%', '').toLowerCase())
          }))
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  }

  const results = await searchCatalogProducts(client, 'coca', 20)
  assert.deepEqual(results.map((product) => product.id), [1, 2])
})
