import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresReviewGroupingBackend } from './apiBackendCapabilities.js'

test('discovers the compatible backend only for review grouping routes', () => {
  for (const path of [
    '/analysis/cross-source-matches?source=all',
    '/review/cross-source-decisions',
    '/review/product-match-decisions?source=disco',
    '/review/product-match-decisions/one-pair',
  ]) {
    assert.equal(requiresReviewGroupingBackend(path), true, path)
  }

  for (const path of ['/products', '/categories', '/admin/price-reports', '/review/catalog-taxonomy-decisions']) {
    assert.equal(requiresReviewGroupingBackend(path), false, path)
  }
})
