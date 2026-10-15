const fs = require('node:fs')
const database = require('../supabaseAdmin')
const { auditProductIdentities } = require('../services/productIdentityAudit')

async function readAllProducts() {
  const products = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await database
      .from('products')
      .select('id,name,image,source,source_product_id,source_sku,ean,category_id,subcategory_id,brands(name),categories(name),subcategories(name),offers(supermarket,cash_price)')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    products.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return products
}

async function main() {
  const products = await readAllProducts()
  const pairArgument = process.argv.find((argument) => argument.startsWith('--ids='))
  const includePairIds = pairArgument
    ? pairArgument.slice('--ids='.length).split(',').map((value) => value.trim()).filter(Boolean)
    : null
  const report = auditProductIdentities(products, { includePairIds })
  const outputPath = process.env.PRODUCT_IDENTITY_AUDIT_OUTPUT
  const summaryOnly = process.argv.includes('--summary-only')
  if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))

  const output = {
    ...report.summary,
    outputPath: outputPath || null,
  }
  if (!summaryOnly) {
    output.candidates = report.candidates.slice(0, 100)
    output.candidatesShown = Math.min(report.candidates.length, 100)
  } else {
    output.sampleCandidates = report.candidates.slice(0, 10).map((candidate) => ({
      decision: candidate.decision,
      evidenceTier: candidate.evidenceTier,
      score: candidate.score,
      matchedSignals: candidate.matchedSignals,
      conflicts: candidate.conflicts,
      products: candidate.products.map((product) => ({
        id: product.id,
        source: product.source,
        name: product.name,
        brand: product.brand,
        ean: product.ean,
        sourceSku: product.sourceSku,
        attributes: product.attributes,
      })),
    }))
  }
  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error('Product identity audit failed:', error.message)
  process.exitCode = 1
})