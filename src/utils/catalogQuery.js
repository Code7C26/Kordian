export function buildProductsQuery({ page = 1, limit = 20, searchQuery = '', category = 'todos', store = 'todos' }) {
  const params = new URLSearchParams();

  params.set('page', String(Number(page) || 1));
  params.set('limit', String(Number(limit) || 20));

  const safeSearch = String(searchQuery || '').trim();
  if (safeSearch) params.set('search', safeSearch);

  if (category && category !== 'todos') params.set('category', String(category));
  if (store && store !== 'todos') params.set('supermarket', String(store));

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
