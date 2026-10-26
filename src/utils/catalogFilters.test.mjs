import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasActiveCatalogFilters, resetCatalogFilters } from './catalogFilters.js'

const defaultFilters = {
  category: 'todos',
  searchQuery: '',
  store: 'todos',
  subcategory: 'todos',
  priceStatus: 'todos',
  sortBy: 'discount-desc',
  maxPrice: 1000000,
}

test('shows reset actions when any catalog filter or sort is active', () => {
  for (const [key, value] of Object.entries({
    category: 'category-1',
    searchQuery: 'milk',
    store: 'Supermarket',
    subcategory: 'subcategory-1',
    priceStatus: 'OFERTA',
    sortBy: 'price-asc',
    maxPrice: 5000,
  })) {
    assert.equal(hasActiveCatalogFilters({ ...defaultFilters, [key]: value }), true, key)
  }
  assert.equal(hasActiveCatalogFilters({ ...defaultFilters, searchQuery: '  ' }), false)
})

test('resets every filter and can preserve the selected category', () => {
  const activeFilters = {
    category: 'category-1',
    searchQuery: 'milk',
    store: 'Supermarket',
    subcategory: 'subcategory-1',
    priceStatus: 'OFERTA',
    sortBy: 'price-asc',
    maxPrice: 5000,
  }

  assert.deepEqual(resetCatalogFilters(activeFilters), defaultFilters)
  assert.deepEqual(resetCatalogFilters(activeFilters, { preserveCategory: true }), {
    ...defaultFilters,
    category: 'category-1',
  })
})
