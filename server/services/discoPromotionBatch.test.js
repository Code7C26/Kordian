const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  fetchDiscoPromotionBatch,
  InvalidDiscoPromotionBatchError,
} = require('./discoPromotionBatch')

test('deduplicates EANs and limits concurrent promotion lookups', async () => {
  let activeRequests = 0
  let maxActiveRequests = 0
  const results = await fetchDiscoPromotionBatch(
    ['7896004009162', '7896004009162', '7790000000001', '7790000000002'],
    {
      concurrency: 2,
      fetchPromotion: async (ean) => {
        activeRequests += 1
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
        await new Promise((resolve) => setImmediate(resolve))
        activeRequests -= 1
        if (ean === '7790000000002') throw new Error('source unavailable')
        return { promotionPrice: 100, referencePrice: 120 }
      },
    },
  )

  assert.equal(maxActiveRequests, 2)
  assert.deepEqual(results.map(({ ean, status }) => ({ ean, status })), [
    { ean: '7896004009162', status: 'ready' },
    { ean: '7790000000001', status: 'ready' },
    { ean: '7790000000002', status: 'error' },
  ])
})

test('rejects invalid and oversized promotion batches', async () => {
  const fetchPromotion = async () => null

  await assert.rejects(
    fetchDiscoPromotionBatch(['invalid'], { fetchPromotion }),
    InvalidDiscoPromotionBatchError,
  )
  await assert.rejects(
    fetchDiscoPromotionBatch(Array.from({ length: 21 }, (_, index) => String(10000000 + index)), { fetchPromotion }),
    InvalidDiscoPromotionBatchError,
  )
})
