const database = require('../supabaseAdmin')
const { auditCatalog } = require('../services/catalogAudit')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')
const { isCatalogProductWriteBlocked } = require('../services/catalogMaintenance')

async function main() {
  const checkRemoteImages = !process.argv.includes('--skip-images')
  const report = await auditCatalog({ database, taxonomyMapper: suggestCatalogMapping, checkRemoteImages })
  if (process.argv.includes('--fix-images')) {
    const fixCandidates = report.items.filter((entry) => entry.findings.some((finding) => ['placeholder_image', 'image_name_mismatch'].includes(finding.type)))
    const productIds = fixCandidates.map((item) => item.id)
    const { data: products, error: productsError } = productIds.length
      ? await database.from('products').select('id,source,offers(supermarket)').in('id', productIds)
      : { data: [], error: null }
    if (productsError) throw productsError
    const productById = new Map((products || []).map((product) => [String(product.id), product]))
    let cleared = 0
    for (const item of fixCandidates) {
      if (isCatalogProductWriteBlocked(productById.get(String(item.id)))) continue
      const { error } = await database.from('products').update({ image: null }).eq('id', item.id)
      if (error) throw error
      cleared++
    }
    report.imagesCleared = cleared
  }
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error('Catalog audit failed:', error.message)
  process.exitCode = 1
})
