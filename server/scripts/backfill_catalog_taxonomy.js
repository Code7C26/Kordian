const database = require('../supabaseAdmin')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')

async function main() {
  const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] = await Promise.all([
    database.from('categories').select('id,name'),
    database.from('subcategories').select('id,name,category_id'),
  ])

  if (categoriesError) throw categoriesError
  if (subcategoriesError) throw subcategoriesError

  const products = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data: page, error: productsError } = await database
      .from('products')
      .select('id,name,source_category,source_subcategory,category_id,subcategory_id,brands(name)')
      .range(from, from + pageSize - 1)
    if (productsError) throw productsError
    products.push(...(page || []))
    if (!page || page.length < pageSize) break
  }

  const categoryByName = new Map((categories || []).map((category) => [category.name, category]))
  const subcategoryByKey = new Map((subcategories || []).map((subcategory) => [`${subcategory.category_id}:${subcategory.name}`, subcategory]))
  let updated = 0
  let skipped = 0

  for (const product of products || []) {
    const mapping = suggestCatalogMapping({ ...product, brand: product.brands?.name })
    const category = mapping && categoryByName.get(mapping.category)
    const subcategory = category && subcategoryByKey.get(`${category.id}:${mapping.subcategory}`)
    if (!category || !subcategory) {
      skipped++
      continue
    }

    if (String(product.category_id) === String(category.id) && String(product.subcategory_id) === String(subcategory.id)) continue

    const { error } = await database.from('products').update({
      category_id: category.id,
      subcategory_id: subcategory.id,
      classification_source: 'automatic',
      classification_confidence: 'high',
    }).eq('id', product.id)
    if (error) throw error
    updated++
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2))
}

main().catch((error) => {
  console.error('Catalog taxonomy backfill failed:', error.message)
  process.exitCode = 1
})
