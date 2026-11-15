const database = require('../supabaseAdmin')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')
const { resolveCatalogClassification } = require('../services/categoryIntegrity')
const {
  isCatalogProductWriteBlocked,
  isManualCatalogClassification,
} = require('../services/catalogMaintenance')

async function main() {
  const [
    { data: categories, error: categoriesError },
    { data: subcategories, error: subcategoriesError },
    { data: reviewDecisions, error: reviewDecisionsError },
  ] = await Promise.all([
    database.from('categories').select('id,name'),
    database.from('subcategories').select('id,name,category_id'),
    database.from('catalog_taxonomy_review_decisions').select('product_id'),
  ])

  if (categoriesError) throw categoriesError
  if (subcategoriesError) throw subcategoriesError
  if (reviewDecisionsError) throw reviewDecisionsError

  const products = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data: page, error: productsError } = await database
      .from('products')
      .select('id,name,source,source_product_id,source_category,source_subcategory,category_id,subcategory_id,classification_source,brands(name),offers(supermarket)')
      .range(from, from + pageSize - 1)
    if (productsError) throw productsError
    products.push(...(page || []))
    if (!page || page.length < pageSize) break
  }

  const reviewedProductIds = new Set((reviewDecisions || []).map((decision) => String(decision.product_id)))
  let updated = 0
  let skipped = 0

  for (const product of products || []) {
    if (isManualCatalogClassification(product) || isCatalogProductWriteBlocked(product)) {
      skipped++
      continue
    }
    if (reviewedProductIds.has(String(product.id))) {
      skipped++
      continue
    }

    const mapping = suggestCatalogMapping({ ...product, brand: product.brands?.name })
    if (mapping.status !== 'determined') {
      skipped++
      continue
    }

    const classification = resolveCatalogClassification({
      source: product.source || product.source_category || 'catalog',
      sourceProductId: product.source_product_id || product.id,
      proposedCategory: mapping.category,
      proposedSubcategory: mapping.subcategory,
      categories: categories || [],
      subcategories: subcategories || [],
      allowWithoutSubcategory: true,
    })
    if (!classification.valid) {
      console.error(`Skipping product ${product.id} during taxonomy backfill: ${classification.reason}`)
      skipped++
      continue
    }

    if (
      String(product.category_id) === String(classification.category.id)
      && String(product.subcategory_id || '') === String(classification.subcategory?.id || '')
    ) continue

    const { error } = await database.from('products').update({
      category_id: classification.category.id,
      subcategory_id: classification.subcategory?.id || null,
      classification_source: 'automatic',
      classification_confidence: mapping.confidence,
    }).eq('id', product.id)
    if (error) {
      throw new Error(
        `Could not update taxonomy for product ${product.id} (${product.source || product.source_category || 'unknown source'}): ${error.message}`,
      )
    }
    updated++
  }

  console.log(JSON.stringify({ updated, skipped }, null, 2))
}

main().catch((error) => {
  console.error('Catalog taxonomy backfill failed:', error.message)
  process.exitCode = 1
})
