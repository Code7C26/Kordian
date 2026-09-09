const INVALID_NAME_PATTERN = /\b(envio|envios|entrega|delivery|shipping|oferta|promo|promocion|promociones)\b/i
const DURABLE_PATTERN = /microondas|horno|televisor|televisores|heladera|lavarropas|aire acondicionado|notebook|celular|computadora/i
const BEVERAGE_PATTERN = /cerveza|gaseosa|jugo|agua|vino|licor|vodka|soda|bebida/i

function numeric(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isSuspiciousPrice(product, offer) {
  const price = numeric(offer.cash_price)
  if (price <= 0) return 'non_positive'
  if (product.source === 'disco' && price < 100) return 'scaled_down'
  if (product.source === 'disco' && BEVERAGE_PATTERN.test(product.name || '') && price < 1000) return 'scaled_down_beverage'
  if (product.source === 'disco' && DURABLE_PATTERN.test(product.name || '') && price < 1000) return 'scaled_down_durable'
  return null
}

async function isPlaceholderImage(image) {
  if (!image || !/^https?:\/\//i.test(image)) return false
  try {
    const response = await fetch(image)
    if (!response.ok) return false
    return (await response.arrayBuffer()).byteLength === 6948
  } catch {
    return false
  }
}

function isImageNameMismatch(image, productName) {
  if (!image || !productName || !/^https?:\/\//i.test(image)) return false
  const imageText = String(image).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const productTokens = String(productName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((token) => token.length >= 5)
  if (!productTokens.length) return false
  const hasProductToken = productTokens.some((token) => imageText.includes(token))
  const hasDescriptiveName = /\/[^/]*(?:[a-z]{5,})[^/]*\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(image)
  return hasDescriptiveName && !hasProductToken
}

async function auditCatalog({ database, taxonomyMapper, checkRemoteImages = true } = {}) {
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
      .select('id,name,image,source,source_product_id,category_id,subcategory_id,source_category,source_subcategory,brands(name),categories(name),subcategories(name),offers(id,cash_price,supermarket)')
      .range(from, from + pageSize - 1)
    if (productsError) throw productsError
    products.push(...(page || []))
    if (!page || page.length < pageSize) break
  }

  const categoryById = new Map((categories || []).map((category) => [String(category.id), category.name]))
  const subcategoryById = new Map((subcategories || []).map((subcategory) => [String(subcategory.id), subcategory.name]))
  const sourceIds = new Map()
  const eans = new Map()
  const findings = []
  let placeholderImages = 0

  for (const product of products || []) {
    const productFindings = []
    if (INVALID_NAME_PATTERN.test(String(product.name || ''))) productFindings.push({ type: 'non_product_name' })

    for (const offer of product.offers || []) {
      const priceIssue = isSuspiciousPrice(product, offer)
      if (priceIssue) productFindings.push({ type: 'price', issue: priceIssue, offerId: offer.id, price: offer.cash_price })
    }

    if (checkRemoteImages && product.image) {
      if (await isPlaceholderImage(product.image)) {
        productFindings.push({ type: 'placeholder_image' })
        placeholderImages++
      } else if (isImageNameMismatch(product.image, product.name)) {
        productFindings.push({ type: 'image_name_mismatch' })
      }
    }

    const sourceId = product.source && product.source_product_id ? `${product.source}:${product.source_product_id}` : null
    if (sourceId) {
      const duplicate = sourceIds.get(sourceId)
      if (duplicate) productFindings.push({ type: 'duplicate_source', duplicateProductId: duplicate })
      else sourceIds.set(sourceId, product.id)
    }

    const ean = String(product.ean || '').trim()
    if (ean) {
      const duplicateEan = eans.get(ean)
      if (duplicateEan) productFindings.push({ type: 'duplicate_ean', duplicateProductId: duplicateEan, ean })
      else eans.set(ean, product.id)
    }

    const mapping = taxonomyMapper?.({ ...product, brand: product.brands?.name })
    if (mapping) {
      const actualCategory = categoryById.get(String(product.category_id))
      const actualSubcategory = subcategoryById.get(String(product.subcategory_id))
      if (actualCategory !== mapping.category || actualSubcategory !== mapping.subcategory) {
        productFindings.push({ type: 'taxonomy_mismatch', expected: { category: mapping.category, subcategory: mapping.subcategory }, actual: { category: actualCategory || null, subcategory: actualSubcategory || null } })
      }
    }

    if (productFindings.length) findings.push({ id: product.id, name: product.name, source: product.source, findings: productFindings })
  }

  const byType = findings.reduce((counts, finding) => {
    for (const issue of finding.findings) counts[issue.type] = (counts[issue.type] || 0) + 1
    return counts
  }, {})

  return { scanned: (products || []).length, findings: findings.length, byType, placeholderImages, items: findings }
}

module.exports = { auditCatalog }
