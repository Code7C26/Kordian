const analysisWriter = require('../supabaseAdmin')
const store = new Map()

function normalizePairKey({ pairKey, mamiProductId, discoProductId, source = 'cross_source' }) {
  if (pairKey) return String(pairKey)
  const left = String(mamiProductId ?? '').trim()
  const right = String(discoProductId ?? '').trim()
  return `${source}:${left}:${right}`
}

function normalizeDecisionRecord(record) {
  return {
    id: record?.id || record?.pair_key || record?.pairKey || null,
    pairKey: record?.pair_key || record?.pairKey || null,
    source: record?.source || 'cross_source',
    mamiProductId: record?.mami_product_id ?? record?.mamiProductId ?? null,
    discoProductId: record?.disco_product_id ?? record?.discoProductId ?? null,
    status: ['match', 'no_match', 'revisión'].includes(record?.status) ? record.status : 'revisión',
    reasonCodes: Array.isArray(record?.reason_codes) ? record.reason_codes : (Array.isArray(record?.reasonCodes) ? record.reasonCodes : []),
    confidence: record?.confidence || 'media',
    evidence: record?.evidence || {},
    admin: record?.admin_username || record?.admin || 'system',
    createdAt: record?.created_at || record?.createdAt || new Date().toISOString(),
    updatedAt: record?.updated_at || record?.updatedAt || new Date().toISOString(),
  }
}

async function upsertReviewDecision({
  pairKey,
  mamiProductId,
  discoProductId,
  source = 'cross_source',
  status,
  reasonCodes = [],
  confidence,
  evidence = {},
  admin = 'system',
}) {
  const key = normalizePairKey({ pairKey, mamiProductId, discoProductId, source })
  const normalizedStatus = ['match', 'no_match', 'revisión'].includes(status) ? status : 'revisión'
  const payload = {
    pair_key: key,
    source,
    mami_product_id: mamiProductId ?? null,
    disco_product_id: discoProductId ?? null,
    status: normalizedStatus,
    reason_codes: Array.isArray(reasonCodes) ? reasonCodes : [],
    confidence: confidence || 'media',
    evidence: evidence || {},
    admin_username: admin || 'system',
    updated_at: new Date().toISOString(),
  }

  try {
    const { data, error } = await analysisWriter
      .from('cross_source_review_decisions')
      .upsert({ ...payload, pair_key: key }, { onConflict: 'pair_key' })
      .select()
      .single()

    if (!error && data) {
      const record = normalizeDecisionRecord(data)
      store.set(key, record)
      return record
    }
  } catch (error) {
    console.warn('Falling back to in-memory review decisions store', error.message)
  }

  const now = new Date().toISOString()
  const record = {
    id: key,
    pairKey: key,
    source,
    mamiProductId: mamiProductId ?? null,
    discoProductId: discoProductId ?? null,
    status: normalizedStatus,
    reasonCodes: Array.isArray(reasonCodes) ? reasonCodes : [],
    confidence: confidence || 'media',
    evidence: evidence || {},
    admin: admin || 'system',
    createdAt: store.get(key)?.createdAt || now,
    updatedAt: now,
  }

  store.set(key, record)
  return record
}

async function listReviewDecisions() {
  try {
    const { data, error } = await analysisWriter
      .from('cross_source_review_decisions')
      .select('*')
      .order('updated_at', { ascending: false })

    if (!error && Array.isArray(data)) {
      const records = data.map((item) => normalizeDecisionRecord(item))
      records.forEach((item) => store.set(item.pairKey, item))
      return records
    }
  } catch (error) {
    console.warn('Unable to read review decisions from Supabase, using in-memory fallback', error.message)
  }

  return Array.from(store.values()).sort((left, right) => (left.updatedAt || '').localeCompare(right.updatedAt || ''))
}

async function clearReviewDecisions() {
  try {
    const { error } = await analysisWriter.from('cross_source_review_decisions').delete().neq('pair_key', '')
    if (!error) return true
  } catch (error) {
    console.warn('Unable to clear review decisions from Supabase, using in-memory fallback', error.message)
  }

  store.clear()
  return true
}

function summarizeReviewDecisions(decisions = []) {
  const items = Array.isArray(decisions) ? decisions : []
  const byStatus = { match: 0, no_match: 0, revisión: 0 }
  const byAdmin = {}

  for (const decision of items) {
    const status = ['match', 'no_match', 'revisión'].includes(decision?.status) ? decision.status : 'revisión'
    byStatus[status] = (byStatus[status] || 0) + 1
    const admin = decision?.admin || 'system'
    byAdmin[admin] = (byAdmin[admin] || 0) + 1
  }

  const lastUpdatedAt = items.reduce((latest, item) => {
    const candidate = item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at
    if (!candidate) return latest
    return Date.parse(candidate) > Date.parse(latest || 0) ? candidate : latest
  }, null)

  return {
    total: items.length,
    byStatus,
    byAdmin,
    lastUpdatedAt,
  }
}

function shouldGroupReviewDecision(decision) {
  if (!decision) return false
  const status = ['match', 'no_match', 'revisión'].includes(decision?.status) ? decision.status : 'revisión'
  if (status === 'no_match') return false
  if (status === 'match') return true

  const reasonCodes = Array.isArray(decision?.reasonCodes)
    ? decision.reasonCodes
    : Array.isArray(decision?.reason_codes)
      ? decision.reason_codes
      : []

  const normalizedReasons = reasonCodes
    .map((code) => String(code || '').trim().toLowerCase())
    .filter(Boolean)

  return normalizedReasons.some((code) => /manual|verified|approved|confirmation|confirmado|override/.test(code))
}

function getReviewGroupingPeerIds(products = [], decisions = []) {
  const presentIds = new Set((Array.isArray(products) ? products : []).map((product) => String(product?.id)))
  const peerIds = new Set()

  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (!shouldGroupReviewDecision(decision)) continue

    const productIds = [decision?.mamiProductId, decision?.discoProductId, decision?.mami_product_id, decision?.disco_product_id]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value))
    const uniqueIds = [...new Set(productIds)]
    if (uniqueIds.length !== 2) continue

    const presentCount = uniqueIds.filter((id) => presentIds.has(id)).length
    if (presentCount !== 1) continue

    const missingId = uniqueIds.find((id) => !presentIds.has(id))
    if (missingId) peerIds.add(missingId)
  }

  return Array.from(peerIds)
}

function applyReviewMatchGrouping(products = [], decisions = []) {
  const items = Array.isArray(products) ? products : []
  const byId = new Map(items.map((item) => [String(item?.id), item]))
  const groupedIds = new Set()
  const groups = new Map()

  for (const decision of Array.isArray(decisions) ? decisions : []) {
    if (!shouldGroupReviewDecision(decision)) continue

    const productIds = [decision?.mamiProductId, decision?.discoProductId, decision?.mami_product_id, decision?.disco_product_id]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value))

    if (productIds.length < 2) continue

    const present = [...new Set(productIds.filter((id) => byId.has(id)))]
    if (present.length < 2) continue

    const canonicalId = present.find((id) => byId.get(id)?.source === 'mami') || present[0]
    const peerIds = present.filter((id) => id !== canonicalId)
    groups.set(canonicalId, [...new Set([...(groups.get(canonicalId) || []), ...peerIds])])

    for (const peerId of peerIds) {
      groupedIds.add(peerId)
    }
  }

  const grouped = items
    .filter((item) => !groupedIds.has(String(item?.id)))
    .map((item) => {
      const itemId = String(item?.id)
      const peerIds = groups.get(itemId) || []
      if (!peerIds.length) return item

      const memberProducts = peerIds.map((id) => byId.get(String(id))).filter(Boolean)
      const mergedOffers = [...(item.offers || []), ...memberProducts.flatMap((product) => product.offers || [])]
      const deduped = mergedOffers.reduce((accumulator, offer) => {
        const key = `${offer?.supermarket || 'unknown'}:${offer?.id || offer?.cash_price || offer?.cashPrice || offer?.supermarket}`
        if (!accumulator.has(key)) accumulator.set(key, { ...offer })
        return accumulator
      }, new Map())

      return {
        ...item,
        offers: Array.from(deduped.values()),
        groupedReviewMatch: true,
        reviewMatchedProductIds: Array.from(new Set([itemId, ...peerIds])),
      }
    })

  return grouped
}

module.exports = {
  reviewDecisionStore: store,
  normalizePairKey,
  upsertReviewDecision,
  listReviewDecisions,
  clearReviewDecisions,
  summarizeReviewDecisions,
  getReviewGroupingPeerIds,
  applyReviewMatchGrouping,
}
