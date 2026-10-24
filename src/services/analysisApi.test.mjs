import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAnalysisProducts, fetchProductAnalysis } from './analysisApi.js'

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

test('returns one product analysis from a successful response', async () => {
  const analysis = { product: { id: 10 }, score: 0 }
  const result = await fetchProductAnalysis('/analysis/products/10', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => analysis,
    }),
  })

  assert.equal(result, analysis)
})

test('treats a missing product analysis as unavailable', async () => {
  const result = await fetchProductAnalysis('/analysis/products/10', {
    fetchImpl: async () => ({ ok: false, status: 404 }),
  })

  assert.equal(result, null)
})

test('rejects malformed single-product analyses', async () => {
  await assert.rejects(
    fetchProductAnalysis('/analysis/products/10', {
      fetchImpl: async () => ({ ok: true, json: async () => [] }),
    }),
    /must be an object or null/,
  )
})
