import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fetchProductAnalysis } from './analysisApi.js'

const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8')
const calculatorSource = await readFile(new URL('../pages/PriceInflationPage.jsx', import.meta.url), 'utf8')

test('catalog loading and filter effects never request the bulk analysis endpoint', () => {
  assert.doesNotMatch(appSource, /apiUrl\(['"]\/analysis\/products['"]\)/)
  assert.doesNotMatch(appSource, /analysisResultsCache/)
  assert.doesNotMatch(appSource, /fetchAnalysisProducts/)
})

test('catalog explanations and comparisons request only the selected product analysis', () => {
  assert.match(appSource, /activeAnalysisProductId = selectedProductForExplanation\?\.id \?\? selectedProductForComparison\?\.id/)
  assert.match(appSource, /apiUrl\(`\/analysis\/products\/\$\{encodeURIComponent\(productId\)\}`\)/)
})

test('inflation calculator requests only the selected product analysis', () => {
  assert.match(calculatorSource, /activeProductId = selectedProduct\?\.id/)
  assert.match(calculatorSource, /fetchProductAnalysis\(\r?\n      apiUrl\(`\/analysis\/products\/\$\{encodeURIComponent\(productId\)\}`\)/)
  assert.doesNotMatch(calculatorSource, /apiUrl\(['"]\/analysis\/products['"]\)/)
})

test('returns one product analysis from a successful response', async () => {
  const analysis = { product: { id: 10 }, score: 0 }
  let requestedUrl
  const result = await fetchProductAnalysis('/analysis/products/10', {
    fetchImpl: async (url) => {
      requestedUrl = url
      return {
        ok: true,
        json: async () => analysis,
      }
    },
  })

  assert.equal(requestedUrl, '/analysis/products/10')

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
