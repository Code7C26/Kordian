const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizePairKey, upsertReviewDecision, listReviewDecisions, clearReviewDecisions, deleteReviewDecision, summarizeReviewDecisions, getReviewGroupingPeerIds, applyReviewMatchGrouping } = require('./reviewDecisionStore')

test('review decision store normalizes keys and persists statuses', async () => {
  const rows = new Map()
  const supabaseAdmin = { from() {} }
  const originalFrom = supabaseAdmin.from
  supabaseAdmin.from = () => {
    const query = { filters: {} }
    return {
      upsert(record) {
        query.operation = 'upsert'
        query.record = record
        return this
      },
      single() {
        const record = { ...query.record, created_at: query.record.updated_at }
        rows.set(record.pair_key, record)
        return Promise.resolve({ data: record, error: null })
      },
      order() {
        return Promise.resolve({ data: Array.from(rows.values()), error: null })
      },
      delete() {
        query.operation = 'delete'
        return this
      },
      eq(column, value) {
        query.filters[column] = value
        return this
      },
      select() {
        if (query.operation !== 'delete') return this
        const record = rows.get(query.filters.pair_key)
        const matches = record && Object.entries(query.filters)
          .every(([key, value]) => record[key] === value)
        if (matches) rows.delete(query.filters.pair_key)
        return Promise.resolve({
          data: matches ? [{ pair_key: query.filters.pair_key }] : [],
          error: null,
        })
      },
      maybeSingle() {
        return Promise.resolve({
          data: rows.get(query.filters.pair_key) || null,
          error: null,
        })
      },
      neq() {
        rows.clear()
        return Promise.resolve({ error: null })
      },
    }
  }

  try {
    await clearReviewDecisions(supabaseAdmin)

    const pairKey = normalizePairKey({ mamiProductId: 10, discoProductId: 20 })
    assert.equal(pairKey, 'cross_source:10:20')

    const created = await upsertReviewDecision({
      mamiProductId: 10,
      discoProductId: 20,
      status: 'match',
      reasonCodes: ['exact_valid_gtin'],
      confidence: 'alta',
      admin: 'admin1',
    }, supabaseAdmin)

    assert.equal(created.status, 'match')
    assert.equal(created.pairKey, pairKey)

    const stored = await listReviewDecisions(supabaseAdmin)
    assert.equal(stored.length, 1)
    assert.equal(stored[0].status, 'match')

    const updated = await upsertReviewDecision({
      mamiProductId: 10,
      discoProductId: 20,
      status: 'revisión',
      reasonCodes: ['brand_missing'],
      confidence: 'media',
      admin: 'admin2',
    }, supabaseAdmin)

    assert.equal(updated.status, 'revisión')
    assert.equal((await listReviewDecisions(supabaseAdmin)).length, 1)
    assert.equal(updated.admin, 'admin2')

    assert.deepEqual(await deleteReviewDecision(pairKey, supabaseAdmin), { deleted: true, grouped: false })
    assert.deepEqual(await deleteReviewDecision(pairKey, supabaseAdmin), { deleted: false, grouped: false })
    assert.equal((await listReviewDecisions(supabaseAdmin)).length, 0)

    await upsertReviewDecision({
      mamiProductId: 10,
      discoProductId: 20,
      status: 'match',
    }, supabaseAdmin)
    assert.deepEqual(await deleteReviewDecision(pairKey, supabaseAdmin), { deleted: false, grouped: true })
    assert.equal((await listReviewDecisions(supabaseAdmin)).length, 1)

    await upsertReviewDecision({
      mamiProductId: 10,
      discoProductId: 20,
      status: 'revisión',
      reasonCodes: ['manual_review'],
    }, supabaseAdmin)
    assert.deepEqual(await deleteReviewDecision(pairKey, supabaseAdmin), { deleted: false, grouped: true })

    const summary = summarizeReviewDecisions(await listReviewDecisions(supabaseAdmin))
    assert.equal(summary.total, 1)
    assert.equal(summary.byStatus.revisión, 1)
    assert.equal(summary.byAdmin.system, 1)

    await clearReviewDecisions(supabaseAdmin)
    assert.equal((await listReviewDecisions(supabaseAdmin)).length, 0)
  } finally {
    supabaseAdmin.from = originalFrom
  }
})

test('review decision persistence errors are surfaced instead of falling back to memory', async () => {
  const persistenceError = new Error('database unavailable')
  const database = {
    from() {
      return {
        upsert() { return this },
        select() { return this },
        single: async () => ({ data: null, error: persistenceError }),
        order: async () => ({ data: null, error: persistenceError }),
        delete() { return this },
        neq: async () => ({ error: persistenceError }),
      }
    },
  }

  await assert.rejects(upsertReviewDecision({
    pairKey: 'cross_source:sync-error:1',
    status: 'match',
  }, database), persistenceError)
  await assert.rejects(listReviewDecisions(database), persistenceError)
  await assert.rejects(clearReviewDecisions(database), persistenceError)
})

test('review match grouping merges offers for matched pairs without mutating source products', () => {
  const products = [
    { id: 10, source: 'mami', offers: [{ id: 'offer-10', supermarket: 'Mami', cash_price: 1500 }] },
    { id: 20, source: 'disco', offers: [{ id: 'offer-20', supermarket: 'Disco', cash_price: 1450 }] },
  ]

  const decisions = [{ status: 'match', mamiProductId: 10, discoProductId: 20 }]
  const grouped = applyReviewMatchGrouping(products, decisions)

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].id, 10)
  assert.equal(grouped[0].offers.length, 2)
  assert.deepEqual(grouped[0].reviewMatchedProductIds.map(String).sort(), ['10', '20'])
})

test('review match grouping loads a matched peer missing from a filtered result', () => {
  const products = [{ id: 18098, source: 'mami' }]
  const decisions = [{ status: 'match', mamiProductId: 18098, discoProductId: 408 }]

  assert.deepEqual(getReviewGroupingPeerIds(products, decisions), ['408'])
  assert.deepEqual(getReviewGroupingPeerIds([...products, { id: 408, source: 'disco' }], decisions), [])
})

test('no_match decisions keep source products separate', () => {
  const products = [
    { id: 10, source: 'mami', offers: [{ id: 'offer-10', supermarket: 'Mami', cash_price: 1500 }] },
    { id: 20, source: 'disco', offers: [{ id: 'offer-20', supermarket: 'Disco', cash_price: 1450 }] },
  ]

  const decisions = [{ status: 'no_match', mamiProductId: 10, discoProductId: 20 }]
  const grouped = applyReviewMatchGrouping(products, decisions)

  assert.equal(grouped.length, 2)
  assert.deepEqual(grouped.map((product) => product.offers.length), [1, 1])
  assert.deepEqual(getReviewGroupingPeerIds([products[0]], decisions), [])
})

test('manual review decisions also group matching products when validated by an admin', () => {
  const products = [
    { id: 10, source: 'mami', offers: [{ id: 'offer-10', supermarket: 'Mami', cash_price: 1500 }] },
    { id: 20, source: 'disco', offers: [{ id: 'offer-20', supermarket: 'Disco', cash_price: 1450 }] },
  ]

  const decisions = [{ status: 'revisión', reasonCodes: ['manual_review'], mamiProductId: 10, discoProductId: 20 }]
  const grouped = applyReviewMatchGrouping(products, decisions)

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].id, 10)
  assert.equal(grouped[0].offers.length, 2)
  assert.deepEqual(grouped[0].reviewMatchedProductIds.map(String).sort(), ['10', '20'])
})
