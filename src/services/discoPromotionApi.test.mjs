import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDiscoPromotionClient } from './discoPromotionApi.js'

test('deduplicates in-flight EAN lookups and reuses recent promotion results', async () => {
  const requests = []
  const client = createDiscoPromotionClient({
    fetchImpl: async (_url, options) => {
      const { eans } = JSON.parse(options.body)
      requests.push(eans)
      await new Promise((resolve) => setImmediate(resolve))
      return {
        ok: true,
        json: async () => ({
          results: eans.map((ean) => ({
            ean,
            status: 'ready',
            promotion: { promotionPrice: 100, referencePrice: 120 },
          })),
        }),
      }
    },
  })

  const [first, second] = await Promise.all([
    client.fetchPromotions(['7896004009162', '7790000000001'], '/products/disco-promotions-preview'),
    client.fetchPromotions(['7790000000001', '7790000000002'], '/products/disco-promotions-preview'),
  ])
  const cached = await client.fetchPromotions([
    '7896004009162',
    '7790000000001',
    '7790000000002',
  ], '/products/disco-promotions-preview')

  assert.deepEqual(requests, [
    ['7896004009162', '7790000000001'],
    ['7790000000002'],
  ])
  assert.deepEqual(first.map((result) => result.ean), ['7896004009162', '7790000000001'])
  assert.deepEqual(second.map((result) => result.ean), ['7790000000001', '7790000000002'])
  assert.equal(cached.length, 3)
})
