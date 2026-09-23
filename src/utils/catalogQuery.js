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
