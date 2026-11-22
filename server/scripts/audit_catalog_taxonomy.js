const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const database = require('../supabaseAdmin')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')

const pageSize = 1000
const resultLabels = [
  'sin_cambios',
  'sugerencia_diferente',
  'conflicto_entre_reglas',
  'evidencia_insuficiente',
  'sugerencia_fuera_taxonomia',
]

function getOutputPath() {
  const outputIndex = process.argv.indexOf('--output')
  if (outputIndex !== -1) {
    const outputPath = process.argv[outputIndex + 1]
    if (!outputPath) throw new Error('Debe indicar una ruta después de --output')
    return path.resolve(outputPath)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(os.tmpdir(), `ar-price-catalog-taxonomy-audit-${timestamp}.csv`)
}

function toCsvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function getResult(mapping, currentCategory, currentSubcategory, taxonomyKeys) {
  if (mapping.status === 'ambiguous') return 'conflicto_entre_reglas'
  if (mapping.status === 'insufficient_evidence') return 'evidencia_insuficiente'
  if (mapping.status !== 'determined') {
    throw new Error(`Estado taxonómico inesperado: ${mapping.status}`)
  }

  const key = `${mapping.category}:${mapping.subcategory}`
  if (!taxonomyKeys.has(key)) return 'sugerencia_fuera_taxonomia'

  return mapping.category === currentCategory && mapping.subcategory === currentSubcategory
    ? 'sin_cambios'
    : 'sugerencia_diferente'
}

async function fetchAll(table, columns) {
  const records = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await database
      .from(table)
      .select(columns)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw error
    records.push(...(data || []))
    if (!data || data.length < pageSize) return records
  }
}

async function main() {
  const [
    { data: categories, error: categoriesError },
    { data: subcategories, error: subcategoriesError },
    products,
  ] = await Promise.all([
    database.from('categories').select('id,name'),
    database.from('subcategories').select('id,name,category_id'),
    fetchAll('products', 'id,name,category_id,subcategory_id,source_category,source_subcategory'),
  ])
  if (categoriesError) throw categoriesError
  if (subcategoriesError) throw subcategoriesError

  const categoryById = new Map((categories || []).map((item) => [String(item.id), item.name]))
  const subcategoryById = new Map((subcategories || []).map((item) => [String(item.id), item.name]))
  const taxonomyKeys = new Set((subcategories || []).map((item) => (
    `${categoryById.get(String(item.category_id))}:${item.name}`
  )))
  const counts = Object.fromEntries(resultLabels.map((label) => [label, 0]))
  const examples = Object.fromEntries(resultLabels.map((label) => [label, []]))
  const rows = []

  for (const product of products) {
    const currentCategory = categoryById.get(String(product.category_id)) || ''
    const currentSubcategory = subcategoryById.get(String(product.subcategory_id)) || ''
    const mapping = suggestCatalogMapping(product)
    const result = getResult(mapping, currentCategory, currentSubcategory, taxonomyKeys)
    counts[result]++

    const row = {
      product_id: product.id,
      product_name: product.name,
      source_category: product.source_category,
      source_subcategory: product.source_subcategory,
      current_category: currentCategory,
      current_subcategory: currentSubcategory,
      suggested_category: mapping.category,
      suggested_subcategory: mapping.subcategory,
      suggestion_status: mapping.status,
      confidence: mapping.confidence,
      reason: mapping.reason,
      rule: mapping.rule,
      result,
      needs_manual_review: result !== 'sin_cambios',
    }
    rows.push(row)

    if (examples[result].length < 10) {
      examples[result].push({
        product_id: product.id,
        product_name: product.name,
        current: `${currentCategory} / ${currentSubcategory}`,
        suggested: mapping.category && mapping.subcategory
          ? `${mapping.category} / ${mapping.subcategory}`
          : null,
        status: mapping.status,
        reason: mapping.reason,
      })
    }
  }

  const outputPath = getOutputPath()
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const columns = [
    'product_id',
    'product_name',
    'source_category',
    'source_subcategory',
    'current_category',
    'current_subcategory',
    'suggested_category',
    'suggested_subcategory',
    'suggestion_status',
    'confidence',
    'reason',
    'rule',
    'result',
    'needs_manual_review',
  ]
  const csv = [
    columns.map(toCsvValue).join(','),
    ...rows.map((row) => columns.map((column) => toCsvValue(row[column])).join(',')),
  ].join('\r\n')
  fs.writeFileSync(outputPath, `\uFEFF${csv}\r\n`, 'utf8')

  const summaryPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}.summary.json`,
  )
  const summary = {
    readOnly: true,
    scanned: products.length,
    counts,
    manualReviewCount: rows.length - counts.sin_cambios,
    examples,
    outputPath,
    summaryPath,
  }
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch((error) => {
  console.error('Catalog taxonomy audit failed:', error.message)
  process.exitCode = 1
})
