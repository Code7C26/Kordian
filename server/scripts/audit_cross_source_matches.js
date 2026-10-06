const fs = require('node:fs')
const database = require('../supabaseAdmin')
const { auditCrossSourceProducts } = require('../services/crossSourceProductMatcher')

async function readProductsBySource(source) {
  const products = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await database
      .from('products')
      .select('id,name,image,source,source_product_id,source_sku,ean,category_id,subcategory_id,brands(name),categories(name),subcategories(name),offers(supermarket,cash_price)')
      .eq('source', source)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    products.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return products
}

async function main() {
  const [mamiProducts, discoProducts] = await Promise.all([
    readProductsBySource('mami'),
    readProductsBySource('disco'),
  ])
  const report = auditCrossSourceProducts(mamiProducts, discoProducts)
  const outputPath = process.env.CROSS_SOURCE_MATCH_AUDIT_OUTPUT
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  const compactExamples = Object.fromEntries(Object.entries(report.examples).map(([category, pairs]) => [
    category,
    pairs.slice(0, 1).map((pair) => ({
      status: pair.status,
      confidence: pair.confidence,
      reasonCodes: pair.reasonCodes,
      matchedAttributes: pair.matchedAttributes,
      mismatchedAttributes: pair.mismatchedAttributes,
      uncertainAttributes: pair.uncertainAttributes,
      mami: {
        id: pair.products.mami.id,
        name: pair.products.mami.name,
        attributes: pair.normalizedAttributes.mami,
        offers: pair.products.mami.offers,
      },
      disco: {
        id: pair.products.disco.id,
        name: pair.products.disco.name,
        attributes: pair.normalizedAttributes.disco,
        offers: pair.products.disco.offers,
      },
      priceSignal: pair.priceSignal,
      storeConstraint: pair.storeConstraint,
    })),
  ]))

  console.log(JSON.stringify({
    ...report.summary,
    examples: compactExamples,
    outputPath: outputPath || null,
    writeSafety: report.writeSafety,
  }, null, 2))
}

main().catch((error) => {
  console.error('Cross-source matching audit failed:', error.message)
  process.exitCode = 1
})