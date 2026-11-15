const PRODUCT_SELECT = '*, offers(*), categories(name), subcategories(name), brands(name)'
const DEFAULT_PAGE_SIZE = 500

function normalizeProductIds(productIds) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : [])
    .filter((productId) => productId !== null && productId !== undefined)
    .map((productId) => String(productId).trim())
    .filter(Boolean))]

  for (const productId of ids) {
    if (!/^[1-9]\d*$/.test(productId) || !Number.isSafeInteger(Number(productId))) {
      throw new TypeError(`Invalid product ID for fresh price analysis: ${productId}`)
    }
  }
  return ids
}

async function readPages(database, buildQuery, pageSize = DEFAULT_PAGE_SIZE, orderColumn = 'id') {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery()
      .order(orderColumn, { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

async function readTargetProducts(database, ids) {
  return readPages(database, () => database
    .from('products')
    .select(PRODUCT_SELECT)
    .in('id', ids))
}

async function readPersistedComparableProducts(database, targetProducts) {
  const targetIds = targetProducts.map((product) => String(product.id))
  const targetMemberships = await readPages(database, () => database
    .from('product_price_status_comparable_group_memberships')
    .select('product_id, group_key')
    .in('product_id', targetIds), DEFAULT_PAGE_SIZE, 'product_id')
  const membershipByProductId = new Map(
    targetMemberships.map((membership) => [String(membership.product_id), membership]),
  )
  const missingMemberships = targetIds.filter((productId) => !membershipByProductId.has(productId))
  if (missingMemberships.length) {
    const error = new Error(
      `Comparable-group mappings missing for products: ${missingMemberships.join(', ')}`,
    )
    error.code = 'PRICE_STATUS_COMPARABILITY_MAPPING_MISSING'
    error.productIds = missingMemberships
    throw error
  }

  const groupKeys = [...new Set(targetMemberships
    .map((membership) => membership.group_key)
    .filter(Boolean))]
  if (!groupKeys.length) return []

  const peerMemberships = await readPages(database, () => database
    .from('product_price_status_comparable_group_memberships')
    .select('product_id')
    .in('group_key', groupKeys), DEFAULT_PAGE_SIZE, 'product_id')
  const peerIds = [...new Set(peerMemberships
    .map((membership) => String(membership.product_id))
    .filter((productId) => !membershipByProductId.has(productId)))]
  const products = []
  for (let offset = 0; offset < peerIds.length; offset += DEFAULT_PAGE_SIZE) {
    products.push(...await readPages(database, () => database
      .from('products')
      .select(PRODUCT_SELECT)
      .in('id', peerIds.slice(offset, offset + DEFAULT_PAGE_SIZE))))
  }
  return products
}

async function readLegacyComparableProducts(database, targetProducts) {
  const subcategoryIds = [...new Set(targetProducts
    .map((product) => product.subcategory_id)
    .filter(Boolean)
    .map(String))]
  const products = []

  if (subcategoryIds.length) {
    products.push(...await readPages(database, () => database
      .from('products')
      .select(PRODUCT_SELECT)
      .in('subcategory_id', subcategoryIds)))
  }

  if (targetProducts.some((product) => !product.category_id || !product.subcategory_id)) {
    products.push(...await readPages(database, () => database
      .from('products')
      .select(PRODUCT_SELECT)
      .or('category_id.is.null,subcategory_id.is.null')))
  }

  return products
}

async function readPriceHistory(database, ids) {
  const rows = []
  for (let offset = 0; ; offset += DEFAULT_PAGE_SIZE) {
    const { data, error } = await database
      .from('price_history')
      .select('product_id, offer_id, observed_at, cash_price, source')
      .in('product_id', ids)
      .order('observed_at', { ascending: true })
      .range(offset, offset + DEFAULT_PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < DEFAULT_PAGE_SIZE) break
  }
  return rows
}

async function readPriceUpdateLogsFromRpc(database, ids) {
  const { data, error } = await database.rpc('get_product_price_status_refresh_history', {
    p_product_ids: ids.map(Number),
  })
  if (error) throw error
  return data || []
}

function buildHistoryByProduct(history, updateLogs, targetIds) {
  const historyByProduct = new Map()
  for (const point of history) {
    const productId = String(point.product_id)
    const points = historyByProduct.get(productId) || []
    points.push(point)
    historyByProduct.set(productId, points)
  }

  for (const update of updateLogs) {
    for (const change of Array.isArray(update.changes) ? update.changes : []) {
      if (!change.productId || !change.updatedCashPrice
        || !targetIds.has(String(change.productId))) continue
      const productId = String(change.productId)
      const points = historyByProduct.get(productId) || []
      const alreadyRecorded = points.some((point) => String(point.offer_id) === String(change.offerId)
        && Number(point.cash_price) === Number(change.updatedCashPrice))
      if (!alreadyRecorded) {
        points.push({
          product_id: change.productId,
          offer_id: change.offerId,
          observed_at: update.updated_at,
          cash_price: change.updatedCashPrice,
          source: 'bulk_admin_log',
        })
        historyByProduct.set(productId, points)
      }
    }
  }
  return historyByProduct
}

function createFreshPriceStatusAnalyzer({
  database,
  analyzeProduct,
  createAnalysisContext,
  loadComparableProducts = readPersistedComparableProducts,
  loadPriceUpdateLogs = readPriceUpdateLogsFromRpc,
}) {
  if (!database || typeof database.from !== 'function') {
    throw new TypeError('A Supabase-compatible database client is required for fresh price analysis')
  }
  if (typeof analyzeProduct !== 'function' || typeof createAnalysisContext !== 'function') {
    throw new TypeError('Price analysis functions are required for fresh price analysis')
  }
  if (typeof loadPriceUpdateLogs !== 'function') {
    throw new TypeError('loadPriceUpdateLogs must be a function')
  }
  if (typeof loadComparableProducts !== 'function') {
    throw new TypeError('loadComparableProducts must be a function')
  }

  return {
    async analyzeProductIds(productIds) {
      const ids = normalizeProductIds(productIds)
      if (!ids.length) return []

      const targetProducts = await readTargetProducts(database, ids)
      const productsById = new Map(targetProducts.map((product) => [String(product.id), product]))
      const missingIds = ids.filter((id) => !productsById.has(id))
      if (missingIds.length) {
        const error = new Error(`Products missing from fresh price analysis: ${missingIds.join(', ')}`)
        error.code = 'PRICE_STATUS_PRODUCT_MISSING'
        error.productIds = missingIds
        throw error
      }

      const comparableProducts = await loadComparableProducts(database, targetProducts)
      for (const product of comparableProducts) {
        if (!productsById.has(String(product.id))) productsById.set(String(product.id), product)
      }

      const products = [...productsById.values()]
      const [analysisContext, history, updateLogs] = await Promise.all([
        createAnalysisContext(products),
        readPriceHistory(database, ids),
        loadPriceUpdateLogs(database, ids),
      ])
      const historyByProduct = buildHistoryByProduct(history, updateLogs, new Set(ids))
      return Promise.all(targetProducts.map((product) => analyzeProduct(
        product,
        products,
        historyByProduct.get(String(product.id)) || [],
        product.categories?.name || '',
        analysisContext,
      )))
    },
  }
}

module.exports = {
  createFreshPriceStatusAnalyzer,
  readLegacyComparableProducts,
  normalizeProductIds,
}
