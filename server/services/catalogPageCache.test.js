const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createCatalogPageCache } = require('./catalogPageCache')

test('reuses an ordered ID index to serve successive pages without re-running the search', async () => {
  const cache = createCatalogPageCache()
  let indexLoadCount = 0
  let hydrationCount = 0
  const loadIndex = async (page, limit) => {
    indexLoadCount += 1
    return {
      data: [{ id: 1 }, { id: 2 }],
      total: 5,
      orderedIds: [1, 2, 3, 4, 5],
      page,
      limit,
    }
  }

  const firstPage = await cache.getPage({
    key: 'query-a',
    page: 1,
    limit: 2,
    loadIndex,
    loadProductsByIds: async () => assert.fail('first page should use index payload'),
    loadPage: async () => assert.fail('should not fall back'),
  })
  const secondPage = await cache.getPage({
    key: 'query-a',
    page: 2,
    limit: 2,
    loadIndex,
    loadProductsByIds: async (ids) => {
      hydrationCount += 1
      assert.deepEqual(ids, [3, 4])
      return [{ id: 4 }, { id: 3 }]
    },
    loadPage: async () => assert.fail('should not fall back'),
  })

  assert.deepEqual(firstPage.data.map((product) => product.id), [1, 2])
  assert.deepEqual(secondPage.data.map((product) => product.id), [3, 4])
  assert.equal(secondPage.total, 5)
  assert.equal(secondPage.page, 2)
  assert.equal(secondPage.cacheHit, true)
  assert.equal(indexLoadCount, 1)
  assert.equal(hydrationCount, 1)
})

test('replaces the cached result when the search query changes', async () => {
  const cache = createCatalogPageCache()
  let loadCount = 0
  const load = (value) => async (page, limit) => {
    loadCount += 1
    return { data: [{ id: value }], orderedIds: [value], total: 1, page, limit }
  }

  await cache.getPage({
    key: 'query-a',
    page: 1,
    limit: 20,
    loadIndex: load('a'),
    loadProductsByIds: async () => assert.fail('should use cached result'),
    loadPage: async () => assert.fail('should not fall back'),
  })
  const result = await cache.getPage({
    key: 'query-b',
    page: 1,
    limit: 20,
    loadIndex: load('b'),
    loadProductsByIds: async () => assert.fail('should use cached result'),
    loadPage: async () => assert.fail('should not fall back'),
  })

  assert.deepEqual(result.data, [{ id: 'b' }])
  assert.equal(loadCount, 2)
})

test('falls back to the requested page if the index response is incomplete', async () => {
  const cache = createCatalogPageCache()
  let pageLoadCount = 0
  const result = await cache.getPage({
    key: 'large-query',
    page: 3,
    limit: 2,
    loadIndex: async () => ({
      data: [{ id: 1 }, { id: 2 }],
      orderedIds: [1, 2],
      total: 5,
      page: 1,
      limit: 2,
    }),
    loadProductsByIds: async () => assert.fail('should fall back'),
    loadPage: async () => {
      pageLoadCount += 1
      return { data: [{ id: 5 }], total: 5, page: 3, limit: 2 }
    },
  })

  assert.deepEqual(result.data, [{ id: 5 }])
  assert.equal(result.cacheHit, false)
  assert.equal(pageLoadCount, 1)
})

test('uses the index payload for its requested page when ordered IDs are unavailable', async () => {
  const cache = createCatalogPageCache()
  const result = await cache.getPage({
    key: 'legacy-query',
    page: 1,
    limit: 2,
    loadIndex: async () => ({
      data: [{ id: 1 }, { id: 2 }],
      total: 5,
      page: 1,
      limit: 2,
    }),
    loadProductsByIds: async () => assert.fail('ordered IDs are unavailable'),
    loadPage: async () => assert.fail('the index payload already contains this page'),
  })

  assert.deepEqual(result.data, [{ id: 1 }, { id: 2 }])
  assert.equal(result.cacheHit, false)
})
