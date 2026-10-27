const { suggestCatalogMapping } = require('./catalogTaxonomy')

function buildCatalogTaxonomyReview(products, decisions = []) {
  const decisionsByProductId = new Map(
    decisions.map((decision) => [String(decision.product_id), decision]),
  )

  return products
    .map((product) => {
      const suggestion = suggestCatalogMapping({
        ...product,
        brand: product.brands?.name,
      })
      if (!suggestion) return null

      const actualCategory = product.categories?.name || null
      const actualSubcategory = product.subcategories?.name || null
      if (
        actualCategory === suggestion.category
        && actualSubcategory === suggestion.subcategory
      ) return null

      const decision = decisionsByProductId.get(String(product.id)) || null
      return {
        id: product.id,
        name: product.name,
        brand: product.brands?.name || null,
        source: product.source || null,
        sourceCategory: product.source_category || null,
        sourceSubcategory: product.source_subcategory || null,
        actualCategoryId: product.category_id || null,
        actualCategory,
        actualSubcategoryId: product.subcategory_id || null,
        actualSubcategory,
        suggestedCategory: suggestion.category,
        suggestedSubcategory: suggestion.subcategory,
        classificationSource: product.classification_source || null,
        decision: decision?.status || 'pending',
        reviewedBy: decision?.admin_username || null,
        reviewedAt: decision?.updated_at || null,
      }
    })
    .filter(Boolean)
    .sort((left, right) => Number(left.id) - Number(right.id))
}

module.exports = { buildCatalogTaxonomyReview }
