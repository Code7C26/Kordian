const DEFAULT_CATALOG_FILTERS = {
  category: 'todos',
  searchQuery: '',
  store: 'todos',
  subcategory: 'todos',
  priceStatus: 'todos',
  sortBy: 'discount-desc',
  maxPrice: 1000000,
}

export function hasActiveCatalogFilters(filters) {
  return (
    filters.category !== 'todos'
    || filters.subcategory !== 'todos'
    || Boolean(filters.searchQuery.trim())
    || filters.store !== 'todos'
    || filters.priceStatus !== 'todos'
    || filters.sortBy !== DEFAULT_CATALOG_FILTERS.sortBy
    || filters.maxPrice !== DEFAULT_CATALOG_FILTERS.maxPrice
  )
}

export function resetCatalogFilters(filters, { preserveCategory = false } = {}) {
  return {
    ...DEFAULT_CATALOG_FILTERS,
    ...(preserveCategory ? { category: filters.category } : {}),
  }
}
