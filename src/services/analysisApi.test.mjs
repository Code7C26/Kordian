import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { fetchProductAnalyses, fetchProductAnalysis } from './analysisApi.js'

const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8')
const calculatorSource = await readFile(new URL('../pages/PriceInflationPage.jsx', import.meta.url), 'utf8')
const favoritesPageSource = await readFile(new URL('../pages/FavoritesPage.jsx', import.meta.url), 'utf8')

test('catalog loading preloads one bounded batch for products on the current page', () => {
  assert.doesNotMatch(appSource, /apiUrl\(['"]\/analysis\/products['"]\)/)
  assert.match(appSource, /fetchProductAnalyses\(/)
  assert.match(appSource, /productIds: productIds\.join\(','\)/)
})

test('catalog explanations and comparisons reuse the current-page batch or request the selected analysis', () => {
  assert.match(appSource, /activeAnalysisProductId = selectedProductForExplanation\?\.id \?\? selectedProductForComparison\?\.id/)
  assert.match(appSource, /apiUrl\(`\/analysis\/products\/\$\{encodeURIComponent\(productId\)\}`\)/)
})

test('inflation calculator requests only the selected product analysis', () => {
  assert.match(calculatorSource, /activeProductId = selectedProduct\?\.id/)
  assert.match(calculatorSource, /fetchProductAnalysis\(\r?\n      apiUrl\(`\/analysis\/products\/\$\{encodeURIComponent\(productId\)\}`\)/)
  assert.doesNotMatch(calculatorSource, /apiUrl\(['"]\/analysis\/products['"]\)/)
})

test('favorites page requests only favorited products in bounded batches', () => {
  assert.match(favoritesPageSource, /buildFavoriteProductsQueries\(favorites\)/)
  assert.match(favoritesPageSource, /\}, \[authLoading, favorites, favoritesLoading, user\]\)/)
  assert.doesNotMatch(favoritesPageSource, /\/products\?limit=2000/)
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

test('returns a batch of product analyses from a successful response', async () => {
  const analyses = [{ product: { id: 10 } }, { product: { id: 11 } }]
  const result = await fetchProductAnalyses('/analysis/products?productIds=10%2C11', {
    fetchImpl: async (url) => {
      assert.equal(url, '/analysis/products?productIds=10%2C11')
      return { ok: true, json: async () => analyses }
    },
  })

  assert.equal(result, analyses)
})

test('rejects malformed batch analysis responses', async () => {
  await assert.rejects(
    fetchProductAnalyses('/analysis/products?productIds=10', {
      fetchImpl: async () => ({ ok: true, json: async () => [{ score: 0 }] }),
    }),
    /must be an array of product analyses/,
  )
})
