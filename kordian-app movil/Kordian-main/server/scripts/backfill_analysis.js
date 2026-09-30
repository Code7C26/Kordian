const supabase = require('../supabaseAdmin')

const taxonomyModule = import('../../src/data/taxonomy.js')

const categoryAliases = {
  alimentos: ['almacen', 'lacteos', 'canasta basica'],
  salud: ['medicamentos', 'salud'],
  'electrodomesticos-tecnologia': ['electrodomesticos', 'tecnologia'],
  limpieza: ['limpieza'],
}

const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function resolveCategoryId(product, categories, classification) {
  if (product.category_id && categories.some((category) => String(category.id) === String(product.category_id))) {
    return product.category_id
  }

  const aliases = categoryAliases[classification.categoryId] || []
  return categories.find((category) => aliases.some((alias) => normalize(category.name).includes(alias)))?.id || null
}

async function getOrCreate(table, filters, values) {
  let query = supabase.from(table).select('id').match(filters).limit(1)
  const { data: existing, error: findError } = await query
  if (findError) throw findError
  if (existing?.[0]) return existing[0].id

  const { data, error } = await supabase.from(table).insert(values).select('id').single()
  if (error) throw error
  return data.id
}

async function main() {
  const { suggestTaxonomy } = await taxonomyModule
  const [{ data: products, error: productsError }, { data: categories, error: categoriesError }, { data: offers, error: offersError }] = await Promise.all([
    supabase.from('products').select('*').order('id'),
    supabase.from('categories').select('id,name'),
    supabase.from('offers').select('id,product_id,cash_price').order('product_id'),
  ])
  if (productsError) throw productsError
  if (categoriesError) throw categoriesError
  if (offersError) throw offersError

  const offersByProduct = new Map()
  for (const offer of offers || []) {
    const productOffers = offersByProduct.get(String(offer.product_id)) || []
    productOffers.push(offer)
    offersByProduct.set(String(offer.product_id), productOffers)
  }

  const { data: existingHistory, error: historyError } = await supabase
    .from('price_history')
    .select('offer_id, cash_price')
  if (historyError) throw historyError

  const historyKeys = new Set((existingHistory || []).map((point) => `${point.offer_id}:${point.cash_price}`))
  let initialHistory = 0
  let historyCandidates = 0
  for (const product of products || []) {
    for (const offer of offersByProduct.get(String(product.id)) || []) {
      const cashPrice = Number(offer.cash_price)
      const key = `${offer.id}:${cashPrice}`
      if (!Number.isFinite(cashPrice) || cashPrice <= 0 || historyKeys.has(key)) continue
      historyCandidates += 1
      const { error } = await supabase.from('price_history').insert({
        product_id: product.id,
        offer_id: offer.id,
        cash_price: cashPrice,
        source: 'initial_catalog',
      })
      if (error) throw error
      historyKeys.add(key)
      initialHistory += 1
    }
  }

  let classified = 0
  let unresolved = 0
  for (const product of products || []) {
    const classification = suggestTaxonomy({
      ...product,
      brand: product.brand || product.brands?.name,
    })
    const categoryId = resolveCategoryId(product, categories || [], classification)
    if (!categoryId || !classification.subcategoryId) {
      unresolved += 1
      console.log(`Unresolved product ${product.id}: ${product.name}`)
      continue
    }

    const subcategoryId = await getOrCreate(
      'subcategories',
      { category_id: categoryId, name: classification.subcategoryId },
      { category_id: categoryId, name: classification.subcategoryId },
    )
    const { error: updateError } = await supabase.from('products').update({
      subcategory_id: subcategoryId,
      classification_source: 'automatic',
      classification_confidence: classification.confidence,
    }).eq('id', product.id)
    if (updateError) throw updateError
    classified += 1
  }

  console.log(JSON.stringify({
    classified,
    unresolved,
    initialHistory,
    diagnostics: {
      productsRead: products?.length || 0,
      offersRead: offers?.length || 0,
      existingHistory: existingHistory?.length || 0,
      historyCandidates,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error('Analysis backfill failed:', error.message)
  process.exitCode = 1
})