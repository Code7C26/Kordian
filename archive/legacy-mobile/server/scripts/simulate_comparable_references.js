const database = require('../supabaseAdmin')
const fs = require('fs')

const modulesPromise = Promise.all([
  import('../../src/utils/comparableProducts.js'),
  import('../../src/utils/priceStatus.js'),
])

const LEVELS = [
  { id: 'same_product_stores', label: 'Mismo producto entre supermercados', weight: 45 },
  { id: 'same_brand_subcategory', label: 'Misma marca y subcategoría', weight: 30 },
  { id: 'same_subcategory', label: 'Otras marcas de la misma subcategoría', weight: 15 },
  { id: 'same_category', label: 'Misma categoría', weight: 7 },
  { id: 'general_inflation', label: 'Inflación general', weight: 3 },
]

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

async function readAll(table, select) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await database.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

function addToIndex(index, key, product) {
  if (!key) return
  const group = index.get(key) || []
  group.push(product)
  index.set(key, group)
}

function summarizeLevel(referenceProducts, product, normalizePrice) {
  const values = referenceProducts
    .map((reference) => normalizePrice(reference))
    .filter((value) => value > 0)
  const referencePrice = median(values)
  const currentPrice = normalizePrice(product)
  return {
    count: referenceProducts.length,
    referencePrice,
    differencePercentage: referencePrice && currentPrice
      ? ((currentPrice - referencePrice) / referencePrice) * 100
      : null,
    examples: referenceProducts.slice(0, 5).map((reference) => ({
      id: reference.id,
      name: reference.name,
      brand: reference.brand,
      price: reference.currentPrice,
      unitPrice: reference.unitPrice,
    })),
  }
}

async function main() {
  const [{ extractMeasure }, { calculateMedian }] = await modulesPromise
  const products = await readAll('products', 'id,name,category_id,subcategory_id,source,offers(id,supermarket,cash_price),brands(name),categories(name),subcategories(name)')
  const categories = await readAll('categories', 'id,name')
  const subcategories = await readAll('subcategories', 'id,name,category_id')
  const categoryNames = new Map(categories.map((category) => [String(category.id), category.name]))
  const subcategoryNames = new Map(subcategories.map((subcategory) => [String(subcategory.id), subcategory.name]))

  const normalizedProducts = products.map((product) => {
    const offers = (product.offers || [])
      .map((offer) => ({ ...offer, price: Number(offer.cash_price) }))
      .filter((offer) => Number.isFinite(offer.price) && offer.price > 0)
    const currentPrice = offers.length ? calculateMedian(offers.map((offer) => offer.price)) : 0
    const measure = extractMeasure(product)
    return {
      ...product,
      brand: product.brands?.name || product.brand || '',
      category: product.categories?.name || categoryNames.get(String(product.category_id)) || '',
      subcategory: product.subcategories?.name || subcategoryNames.get(String(product.subcategory_id)) || '',
      currentPrice,
      unitPrice: measure && currentPrice ? currentPrice / measure.normalizedAmount : null,
      baseUnit: measure?.baseUnit || null,
      brandKey: normalize(product.brands?.name || product.brand),
      categoryKey: normalize(product.categories?.name || categoryNames.get(String(product.category_id))),
      subcategoryKey: normalize(product.subcategories?.name || subcategoryNames.get(String(product.subcategory_id))),
    }
  }).filter((product) => product.currentPrice > 0)

  const byBrandSubcategory = new Map()
  const bySubcategory = new Map()
  const byCategory = new Map()
  for (const product of normalizedProducts) {
    const unitKey = product.baseUnit || 'unit'
    addToIndex(byBrandSubcategory, `${product.brandKey}|${product.subcategoryKey}|${unitKey}`, product)
    addToIndex(bySubcategory, `${product.subcategoryKey}|${unitKey}`, product)
    addToIndex(byCategory, `${product.categoryKey}|${unitKey}`, product)
  }

  const normalizePrice = (product) => product.unitPrice || product.currentPrice
  const reports = normalizedProducts.map((product) => {
    const unitKey = product.baseUnit || 'unit'
    const sameBrand = (byBrandSubcategory.get(`${product.brandKey}|${product.subcategoryKey}|${unitKey}`) || [])
      .filter((candidate) => candidate.id !== product.id)
    const sameSubcategory = (bySubcategory.get(`${product.subcategoryKey}|${unitKey}`) || [])
      .filter((candidate) => candidate.id !== product.id && candidate.brandKey !== product.brandKey)
    const sameCategory = (byCategory.get(`${product.categoryKey}|${unitKey}`) || [])
      .filter((candidate) => candidate.id !== product.id && candidate.subcategoryKey !== product.subcategoryKey)
    const levels = {
      same_product_stores: { count: product.offers.length > 1 ? product.offers.length : 0, referencePrice: product.offers.length > 1 ? median(product.offers.map((offer) => offer.price)) : 0, differencePercentage: null },
      same_brand_subcategory: summarizeLevel(sameBrand, product, normalizePrice),
      same_subcategory: summarizeLevel(sameSubcategory, product, normalizePrice),
      same_category: summarizeLevel(sameCategory, product, normalizePrice),
      general_inflation: { count: 0, referencePrice: 0, differencePercentage: null, examples: [] },
    }
    const availableLevels = LEVELS.filter((level) => levels[level.id].count > 0 && level.id !== 'general_inflation')
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      currentPrice: product.currentPrice,
      unitPrice: product.unitPrice,
      baseUnit: product.baseUnit,
      levels,
      suggestedLevel: availableLevels[0]?.id || 'general_inflation',
      availableLevelCount: availableLevels.length,
    }
  })

  const summary = {
    generatedAt: new Date().toISOString(),
    productsRead: products.length,
    productsWithPrice: reports.length,
    levels: LEVELS.map((level) => {
      const covered = reports.filter((report) => report.levels[level.id].count > 0).length
      return { ...level, coveredProducts: covered, coveragePercentage: reports.length ? Number((covered / reports.length * 100).toFixed(1)) : 0 }
    }),
    fallbackDistribution: reports.reduce((counts, report) => {
      counts[report.suggestedLevel] = (counts[report.suggestedLevel] || 0) + 1
      return counts
    }, {}),
    samples: reports.filter((report) => /tang|jugo|actimel|yogur/i.test(`${report.name} ${report.brand}`)).slice(0, 40),
    focusSamples: reports.filter((report) => /tang|jugo/i.test(`${report.name} ${report.brand}`)).slice(0, 60),
  }

  const output = JSON.stringify({ summary, reports: reports.slice(0, 200) }, null, 2)
  if (process.env.SIMULATION_OUTPUT) {
    fs.writeFileSync(process.env.SIMULATION_OUTPUT, output)
  }
  console.log(output)
}

main().catch((error) => {
  console.error('Comparable reference simulation failed:', error.message)
  process.exitCode = 1
})
