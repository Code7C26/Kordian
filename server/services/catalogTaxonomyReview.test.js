const test = require('node:test')
const assert = require('node:assert/strict')
const { buildCatalogTaxonomyReview } = require('./catalogTaxonomyReview')

test('returns only mismatches and preserves saved review decisions', () => {
  const products = [
    {
      id: 1,
      name: 'Aceite Johnson Baby 100 Ml',
      source: 'disco',
      category_id: 'food',
      subcategory_id: 'oils',
      categories: { name: 'Almacén y Alimentos' },
      subcategories: { name: 'Aceites, condimentos y aderezos' },
      brands: { name: 'Johnson Baby' },
    },
    {
      id: 2,
      name: 'Queso Cremoso 400 Grs',
      category_id: 'dairy',
      subcategory_id: 'cheese',
      categories: { name: 'Alimentos Frescos y Refrigerados' },
      subcategories: { name: 'Lácteos' },
    },
    {
      id: 3,
      name: 'Producto sin regla',
      categories: { name: 'Hogar y Otros' },
      subcategories: { name: 'Juguetes' },
    },
  ]

  const result = buildCatalogTaxonomyReview(products, [
    { product_id: 1, status: 'dismissed', admin_username: 'admin', updated_at: '2026-10-27T00:00:00Z' },
  ])

  assert.equal(result.length, 1)
  assert.equal(result[0].id, 1)
  assert.equal(result[0].decision, 'dismissed')
  assert.equal(result[0].reviewedBy, 'admin')
  assert.equal(result[0].suggestedSubcategory, 'Higiene infantil')
})
