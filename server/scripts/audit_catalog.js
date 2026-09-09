const database = require('../supabaseAdmin')
const { auditCatalog } = require('../services/catalogAudit')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')

async function main() {
  const checkRemoteImages = !process.argv.includes('--skip-images')
  const report = await auditCatalog({ database, taxonomyMapper: suggestCatalogMapping, checkRemoteImages })
  if (process.argv.includes('--fix-images')) {
    let cleared = 0
    for (const item of report.items.filter((entry) => entry.findings.some((finding) => ['placeholder_image', 'image_name_mismatch'].includes(finding.type)))) {
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
