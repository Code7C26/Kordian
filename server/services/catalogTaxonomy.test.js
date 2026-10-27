const test = require('node:test')
const assert = require('node:assert/strict')
const { suggestCatalogMapping } = require('./catalogTaxonomy')

test('matches category terms as whole words instead of substrings', () => {
  assert.deepEqual(
    suggestCatalogMapping({ name: 'Aceite de Girasol 1.5 Lts Legitimo' }),
    {
      category: 'Almacén y Alimentos',
      subcategory: 'Aceites, condimentos y aderezos',
    },
  )
})

test('prioritizes product type over a flavor or descriptive word', () => {
  assert.deepEqual(
    suggestCatalogMapping({ name: 'Tostaditas de Arroz Sabor Cuatro Quesos 95 Grs' }),
    {
      category: 'Almacén y Alimentos',
      subcategory: 'Golosinas y snacks',
    },
  )

  assert.deepEqual(
    suggestCatalogMapping({ name: 'Desodorante de Ambiente Lavanda 360 Ml' }),
    {
      category: 'Limpieza e Higiene',
      subcategory: 'Limpieza del hogar',
    },
  )

  assert.deepEqual(
    suggestCatalogMapping({ name: 'Aceite Johnson Baby 100 Ml' }),
    {
      category: 'Limpieza e Higiene',
      subcategory: 'Higiene infantil',
    },
  )

  assert.deepEqual(
    suggestCatalogMapping({ name: 'Chupetines Pico Dulce 5 U', source_subcategory: 'Infusiones' }),
    {
      category: 'Almacén y Alimentos',
      subcategory: 'Golosinas y snacks',
    },
  )
})

test('keeps ordinary dairy and cleaning products in their expected subcategories', () => {
  assert.deepEqual(
    suggestCatalogMapping({ name: 'Queso Cremoso 400 Grs' }),
    {
      category: 'Alimentos Frescos y Refrigerados',
      subcategory: 'Lácteos',
    },
  )

  assert.deepEqual(
    suggestCatalogMapping({ name: 'Detergente para ropa Ala 1 L' }),
    {
      category: 'Limpieza e Higiene',
      subcategory: 'Lavado de ropa',
    },
  )
})
