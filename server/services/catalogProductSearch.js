function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function getSearchTerms(query) {
  return [...new Set(normalizeSearchText(query).trim().split(/\s+/).filter(Boolean))]
}

function escapeLikeTerm(term) {
  return term.replace(/[\\%_]/g, '\\$&')
}

function getProductSearchText(product) {
  return normalizeSearchText([
    product.name,
    product.brands?.name,
    product.categories?.name,
    product.subcategories?.name,
  ].filter(Boolean).join(' '))
}

function rankCatalogSearchResults(products, query, limit) {
  const normalizedQuery = normalizeSearchText(query).trim()
  const terms = getSearchTerms(query)
  const uniqueProducts = new Map()

  for (const product of products) {
    if (!product || product.id === null || product.id === undefined || !String(product.name || '').trim()) continue
    uniqueProducts.set(String(product.id), product)
  }

  return [...uniqueProducts.values()]
    .filter((product) => {
      const searchableText = getProductSearchText(product)
      return terms.every((term) => searchableText.includes(term))
    })
    .sort((first, second) => {
      const firstName = normalizeSearchText(first.name)
      const secondName = normalizeSearchText(second.name)
      const firstRank = firstName === normalizedQuery ? 0
        : firstName.startsWith(normalizedQuery) ? 1
          : getProductSearchText(first).includes(normalizedQuery) ? 2 : 3
      const secondRank = secondName === normalizedQuery ? 0
        : secondName.startsWith(normalizedQuery) ? 1
          : getProductSearchText(second).includes(normalizedQuery) ? 2 : 3
      return firstRank - secondRank || firstName.localeCompare(secondName)
    })
    .slice(0, limit)
}

async function searchCatalogProducts(client, query, limit = 20) {
  const terms = getSearchTerms(query).slice(0, 6)
  if (!terms.length) return []

  const productSelect = 'id, name, image, brand_id, category_id, subcategory_id, offers(id, product_id, supermarket, cash_price, list_price), brands(name), categories(name), subcategories(name)'
  const perTermLimit = Math.min(Math.max(limit * 10, 100), 500)
  const productQueries = terms.map(async (term) => {
    const { data, error } = await client
      .from('products')
      .select(productSelect)
      .ilike('name', `%${escapeLikeTerm(term)}%`)
      .order('name')
      .limit(perTermLimit)
    if (error) throw error
    return data || []
  })
  const brandQueries = terms.map(async (term) => {
    const { data, error } = await client
      .from('brands')
      .select('id')
      .ilike('name', `%${escapeLikeTerm(term)}%`)
      .limit(100)
    if (error) throw error
    return (data || []).map((brand) => brand.id).filter(Boolean)
  })

  const [productsByName, brandIdsByTerm] = await Promise.all([
    Promise.all(productQueries),
    Promise.all(brandQueries),
  ])
  const brandIds = [...new Set(brandIdsByTerm.flat().map(String))]
  let productsByBrand = []
  if (brandIds.length) {
    const { data, error } = await client
      .from('products')
      .select(productSelect)
      .in('brand_id', brandIds)
      .order('name')
      .limit(perTermLimit)
    if (error) throw error
    productsByBrand = data || []
  }

  return rankCatalogSearchResults(
    [...productsByName.flat(), ...productsByBrand],
    query,
    limit,
  )
}

module.exports = {
  getSearchTerms,
  rankCatalogSearchResults,
  searchCatalogProducts,
}
