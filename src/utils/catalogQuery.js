export function buildProductsQuery({
  page = 1,
  limit = 20,
  searchQuery = '',
  category = 'todos',
  subcategory = 'todos',
  store = 'todos',
  status = 'todos',
  sortBy = 'default',
  favoritesOnly = false,
  favoriteIds = [],
  catalogOnly = true,
  maxPrice = 1000000,
}) {
  const params = new URLSearchParams();

  params.set('page', String(Number(page) || 1));
  params.set('limit', String(Number(limit) || 20));

  const safeSearch = String(searchQuery || '').trim();
  if (safeSearch) params.set('search', safeSearch);

  if (category && category !== 'todos') params.set('category', String(category));
  if (subcategory && subcategory !== 'todos') params.set('subcategory', String(subcategory));
  if (store && store !== 'todos') params.set('supermarket', String(store));
  if (status && status !== 'todos') params.set('status', String(status));
  if (sortBy && sortBy !== 'default') {
    params.set('sort', sortBy === 'discount' ? 'discount-desc' : String(sortBy));
  }
  if (favoritesOnly) {
    params.set('favoritesOnly', 'true');
    const ids = [...new Set(favoriteIds.map((id) => String(id)).filter(Boolean))].sort();
    if (ids.length) params.set('favorites', ids.join(','));
  }
  if (catalogOnly) params.set('catalogOnly', 'true');
  if (Number.isFinite(Number(maxPrice))) params.set('maxPrice', String(Number(maxPrice)));

  return params;
}

export function appendUniqueProducts(current = [], incoming = []) {
  const existingIds = new Set((Array.isArray(current) ? current : []).map((product) => String(product?.id)))
  const additions = []

  for (const product of Array.isArray(incoming) ? incoming : []) {
    const id = product?.id
    if (id === null || id === undefined) {
      additions.push(product)
      continue
    }

    const key = String(id)
    if (existingIds.has(key)) continue
    existingIds.add(key)
    additions.push(product)
  }

  return [...current, ...additions]
}
