import test from 'node:test'
import assert from 'node:assert/strict'
import {
  attachSharedListSearchSupermarkets,
  fetchSharedListCatalogWithFallback,
  findSharedListCatalogProduct,
  getSharedListFallbackSearchTerms,
  needsSharedListCatalogData,
  normalizeSharedListSearchResults,
} from './sharedListProductSearch.js'

test('falls back to the product catalog when the search endpoint is unavailable', async () => {
  let catalogFallbackCalled = false
  const result = await fetchSharedListCatalogWithFallback(
    async () => {
      throw Object.assign(new Error('Not found'), { status: 404 })
    },
    async () => {
      catalogFallbackCalled = true
      return { data: [{ id: 1, name: 'Leche' }] }
    },
  )

  assert.equal(catalogFallbackCalled, true)
  assert.deepEqual(result.data, [{ id: 1, name: 'Leche' }])
})

test('does not hide catalog search errors other than a missing endpoint', async () => {
  const requestError = Object.assign(new Error('Service unavailable'), { status: 503 })
  let catalogFallbackCalled = false

  await assert.rejects(
    fetchSharedListCatalogWithFallback(
      async () => { throw requestError },
      async () => {
        catalogFallbackCalled = true
        return []
      },
    ),
    requestError,
  )
  assert.equal(catalogFallbackCalled, false)
})

test('does not perform another catalog lookup just because a supermarket logo is missing', () => {
  assert.equal(needsSharedListCatalogData({
    hasCatalogMatch: true,
    hasImage: true,
    hasCurrentPrice: true,
    hasSupermarket: true,
  }), false)
})

test('keeps matching database products even when they have no price or offers', () => {
  const results = normalizeSharedListSearchResults([
    { id: 12, name: 'Leche Entera 1 L' },
    { id: 13, name: 'Leche Descremada 1 L', offers: [{ cash_price: 1500 }] },
    { id: 14, name: 'Jabón Líquido' },
    { name: 'Leche sin identificador' },
  ], 'leche 1')

  assert.deepEqual(results.map(({ id, currentPrice }) => [id, currentPrice]), [
    [12, 0],
    [13, 1500],
  ])
})

test('adds the cheapest matching supermarket logo to each search result', () => {
  const [product] = attachSharedListSearchSupermarkets([{
    id: 21,
    name: 'Coca Cola 1.5 L',
    offers: [
      { supermarket: 'Mami', cash_price: 1700 },
      { supermarket: 'Disco', cash_price: 1400 },
    ],
  }], [
    { name: 'Mami', image: '/mami.svg' },
    { name: 'Disco', image: '/disco.svg' },
  ])

  assert.equal(product.supermarket, 'Disco')
  assert.equal(product.supermarketImage, '/disco.svg')
})

test('only resolves shared-list catalog entries by id or exact normalized name', () => {
  const products = [
    { id: 1, name: 'Coca Cola 2 L' },
    { id: 2, name: 'Coca-Cola 2L' },
  ]

  assert.equal(findSharedListCatalogProduct(products, {
    itemName: 'Coca Cola 2L',
  }).id, 2)
  assert.equal(findSharedListCatalogProduct(products, {
    productId: 1,
    itemName: 'Another product',
  }).id, 1)
  assert.equal(findSharedListCatalogProduct(products, {
    itemName: 'Coca Cola',
  }), null)
})

test('fallback terms preserve accents and punctuation-cleaned words while staying bounded', () => {
  assert.deepEqual(
    getSharedListFallbackSearchTerms('café, leche 1 l jabón arroz'),
    ['leche', 'jabón', 'arroz', 'café'],
  )
})

test('matches products found by brand and removes duplicates from fallback queries', () => {
  const results = normalizeSharedListSearchResults([
    { id: 21, name: 'Gaseosa Cola 1.5 L', brand: 'Marca Ejemplo' },
    { id: 21, name: 'Gaseosa Cola 1.5 L', brand: 'Marca Ejemplo' },
  ], 'gaseosa ejemplo')

  assert.deepEqual(results.map(({ id }) => id), [21])
})
