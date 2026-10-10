const crypto = require('node:crypto')

const PRICE_STATUS_RULES_VERSION = '2026-10-10-v1'
const PRICE_STATUS_BATCH_SIZE = 100

function buildPriceFingerprint(product, references = {}, analysis = {}) {
  const offers = (product?.offers || [])
    .map((offer, index) => ({
      offer_id: String(offer.id ?? `${offer.supermarket || ''}:${index}`),
      cash_price: Number(offer.cash_price),
    }))
    .filter((offer) => Number.isFinite(offer.cash_price) && offer.cash_price > 0)
    .sort((first, second) => first.offer_id.localeCompare(second.offer_id))
  const comparableReferences = (references.references || [])
    .map((reference) => ({
      product_id: String(reference.id),
      price: Number(reference.price) || 0,
      unit_price: Number(reference.unitPrice) || 0,
      level: reference.level || references.level || '',
    }))
    .sort((first, second) => first.product_id.localeCompare(second.product_id))
  const history = (analysis.priceHistory || [])
    .map((point) => ({
      offer_id: String(point.offerId || ''),
      observed_at: point.date || '',
      price: Number(point.avgPrice) || 0,
    }))
    .sort((first, second) => first.observed_at.localeCompare(second.observed_at)
      || first.offer_id.localeCompare(second.offer_id))
  const inputs = JSON.stringify({
    rules_version: PRICE_STATUS_RULES_VERSION,
    category_id: String(product?.category_id || ''),
    subcategory_id: String(product?.subcategory_id || ''),
    offers,
    comparableReferences,
    referencePrice: Number(references.referencePrice) || 0,
    history,
    classification: analysis.classification || '',
    score: Number(analysis.score) || 0,
    offerScore: Number(analysis.offerScore) || 0,
    confidence: analysis.confidence || '',
    confidencePercentage: Number(analysis.confidencePercentage) || 0,
  })
  return crypto.createHash('sha256').update(inputs).digest('hex')
}

function buildCurrentPriceStatusRows(analyses, analyzedAt = new Date().toISOString()) {
  return (analyses || []).flatMap((analysis) => {
    const productId = analysis?.product?.id
    if (productId === null || productId === undefined || !analysis?.classification) return []
    const comparableProductIds = [...new Set([
      String(productId),
      ...(analysis.references?.references || [])
        .map((reference) => reference.id)
        .filter((id) => id !== null && id !== undefined)
        .map(String),
    ])]
    const timestamp = analysis.analyzedAt || analyzedAt
    return [{
      product_id: String(productId),
      classification: analysis.classification,
      anomaly_score: Number(analysis.score) || 0,
      offer_score: Number(analysis.offerScore) || 0,
      confidence: analysis.confidence || 'baja',
      confidence_percentage: Number(analysis.confidencePercentage) || 0,
      data_quality: analysis.dataQuality || {},
      rules_version: PRICE_STATUS_RULES_VERSION,
      price_fingerprint: buildPriceFingerprint(analysis.product, analysis.references, analysis),
      comparable_product_ids: comparableProductIds,
      analyzed_at: timestamp,
      updated_at: timestamp,
    }]
  })
}

async function saveCurrentPriceStatuses(database, analyses) {
  const rows = buildCurrentPriceStatusRows(analyses)
  if (!rows.length) return 0
  const { data, error: selectError } = await database
    .from('product_price_status')
    .select('product_id, price_fingerprint, rules_version')
    .in('product_id', rows.map((row) => row.product_id))
  if (selectError) throw selectError

  const existing = new Map((data || []).map((row) => [
    String(row.product_id),
    { fingerprint: row.price_fingerprint, rulesVersion: row.rules_version },
  ]))
  const changedRows = rows.filter((row) => {
    const status = existing.get(row.product_id)
    return status?.fingerprint !== row.price_fingerprint || status?.rulesVersion !== row.rules_version
  })
  if (!changedRows.length) return 0
  const { error } = await database.from('product_price_status').upsert(changedRows, { onConflict: 'product_id' })
  if (error) throw error
  return changedRows.length
}

function createPriceStatusRefreshQueue({ refreshBatch, batchSize = PRICE_STATUS_BATCH_SIZE, logger = console }) {
  const pending = new Set()
  let running = false

  async function processQueue() {
    if (running) return
    running = true
    try {
      while (pending.size) {
        const ids = [...pending].slice(0, batchSize)
        ids.forEach((id) => pending.delete(id))
        try {
          await refreshBatch(ids)
        } catch (error) {
          logger.error(`Unable to refresh current price statuses for ${ids.length} products`, error)
        }
      }
    } finally {
      running = false
      if (pending.size) void processQueue()
    }
  }

  return {
    enqueue(ids) {
      for (const id of ids || []) {
        if (id !== null && id !== undefined && String(id).trim()) pending.add(String(id))
      }
      void processQueue()
    },
  }
}

async function enqueueIncompletePriceStatuses(database, queue, batchSize = PRICE_STATUS_BATCH_SIZE) {
  for (let offset = 0; ; offset += batchSize) {
    const { data: products, error: productsError } = await database
      .from('products')
      .select('id')
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)
    if (productsError) throw productsError
    const productIds = (products || []).map((product) => product.id)
    if (!productIds.length) break
    const { data: statuses, error: statusesError } = await database
      .from('product_price_status')
      .select('product_id, rules_version')
      .in('product_id', productIds)
    if (statusesError) throw statusesError
    const currentIds = new Set((statuses || [])
      .filter((status) => status.rules_version === PRICE_STATUS_RULES_VERSION)
      .map((status) => String(status.product_id)))
    queue.enqueue(productIds.filter((id) => !currentIds.has(String(id))))
    if (productIds.length < batchSize) break
  }

  for (let offset = 0; ; offset += batchSize) {
    const { data: statuses, error } = await database
      .from('product_price_status')
      .select('product_id')
      .neq('rules_version', PRICE_STATUS_RULES_VERSION)
      .order('product_id', { ascending: true })
      .range(offset, offset + batchSize - 1)
    if (error) throw error
    const ids = (statuses || []).map((status) => status.product_id)
    queue.enqueue(ids)
    if (ids.length < batchSize) break
  }
}

module.exports = {
  PRICE_STATUS_RULES_VERSION,
  buildPriceFingerprint,
  buildCurrentPriceStatusRows,
  createPriceStatusRefreshQueue,
  enqueueIncompletePriceStatuses,
  saveCurrentPriceStatuses,
}
