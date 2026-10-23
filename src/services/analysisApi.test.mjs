import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAnalysisProducts } from './analysisApi.js'

test('returns product analyses from a successful response', async () => {
  const analyses = [{ product: { id: 1 }, score: 0 }]
  const result = await fetchAnalysisProducts('/analysis/products', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => analyses,
    }),
  })

  assert.equal(result, analyses)
})

test('rejects unsuccessful responses', async () => {
  await assert.rejects(
    fetchAnalysisProducts('/analysis/products', {
      fetchImpl: async () => ({ ok: false, status: 503 }),
    }),
    /status 503/,
  )
})

test('rejects malformed successful responses', async () => {
  await assert.rejects(
    fetchAnalysisProducts('/analysis/products', {
      fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }),
    }),
    /must be an array/,
  )
})
