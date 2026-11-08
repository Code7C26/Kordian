const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createCatalogPageCache } = require('./catalogPageCache')

function createPageLoader({ productsByPage, total = 5, calls = [] }) {
  return async (page, limit) => {
    calls.push({ page, limit })
    return {
      data: productsByPage[page] || [],
      total,
      page,
      limit,
    }
  }
}

test('caches complete pages by query, page, and limit without an ordered ID index', async () => {
  const cache = createCatalogPageCache()
  const calls = []
  const loadPage = createPageLoader({
    productsByPage: {
      1: [{ id: 1 }, { id: 2 }],
      2: [{ id: 3 }, { id: 4 }],
    },
    calls,
  })

  const firstPage = await cache.getPage({
    key: 'query-a',
    page: 1,
    limit: 2,
    loadPage,
  })
  const secondPage = await cache.getPage({
    key: 'query-a',
    page: 2,
    limit: 2,
    loadPage,
  })
  const cachedFirstPage = await cache.getPage({
    key: 'query-a',
    page: 1,
    limit: 2,
    loadPage: async () => assert.fail('should reuse the cached page'),
  })

  assert.deepEqual(firstPage, {
    data: [{ id: 1 }, { id: 2 }],
    total: 5,
    page: 1,
    limit: 2,
    cacheHit: false,
  })
  assert.deepEqual(secondPage.data.map((product) => product.id), [3, 4])
  assert.equal(secondPage.total, 5)
  assert.deepEqual(cachedFirstPage.data, firstPage.data)
  assert.equal(cachedFirstPage.cacheHit, true)
  assert.deepEqual(calls, [{ page: 1, limit: 2 }, { page: 2, limit: 2 }])
})

test('separates different query keys and page sizes', async () => {
  const cache = createCatalogPageCache()
  const calls = []
  const loadPage = createPageLoader({
    productsByPage: { 1: [{ id: 1 }], 2: [{ id: 2 }] },
    calls,
  })

  await cache.getPage({ key: 'category-a', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'category-b', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'category-a', page: 1, limit: 10, loadPage })
  await cache.getPage({
    key: 'category-a',
    page: 1,
    limit: 20,
    loadPage: async () => assert.fail('should reuse the matching query/page/limit'),
  })

  assert.deepEqual(calls, [
    { page: 1, limit: 20 },
    { page: 1, limit: 20 },
    { page: 1, limit: 10 },
  ])
})

test('deduplicates concurrent requests for the same query and page', async () => {
  const cache = createCatalogPageCache()
  let loadCount = 0
  let releaseLoad
  const loadPage = () => {
    loadCount += 1
    return new Promise((resolve) => {
      releaseLoad = () => resolve({
        data: [{ id: 7 }],
        total: 1,
        page: 1,
        limit: 20,
      })
    })
  }

  const firstRequest = cache.getPage({ key: 'same-query', page: 1, limit: 20, loadPage })
  const secondRequest = cache.getPage({ key: 'same-query', page: 1, limit: 20, loadPage })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(loadCount, 1)
  releaseLoad()

  const [first, second] = await Promise.all([firstRequest, secondRequest])
  assert.deepEqual(first.data, [{ id: 7 }])
  assert.deepEqual(second.data, [{ id: 7 }])
  assert.equal(first.cacheHit, false)
  assert.equal(second.cacheHit, true)
})

test('does not cross-contaminate concurrent requests for different pages', async () => {
  const cache = createCatalogPageCache()
  const calls = []
  const loadPage = async (page, limit) => {
    calls.push({ page, limit })
    await new Promise((resolve) => setImmediate(resolve))
    return { data: [{ id: page }], total: 3, page, limit }
  }

  const [firstPage, secondPage] = await Promise.all([
    cache.getPage({ key: 'same-query', page: 1, limit: 20, loadPage }),
    cache.getPage({ key: 'same-query', page: 2, limit: 20, loadPage }),
  ])

  assert.deepEqual(firstPage.data, [{ id: 1 }])
  assert.deepEqual(secondPage.data, [{ id: 2 }])
  assert.deepEqual(calls, [{ page: 1, limit: 20 }, { page: 2, limit: 20 }])
})

test('expires query pages after the configured TTL', async () => {
  const cache = createCatalogPageCache({ ttlMs: 1 })
  let loadCount = 0
  const loadPage = async (page, limit) => ({
    data: [{ id: ++loadCount }],
    total: 1,
    page,
    limit,
  })

  await cache.getPage({ key: 'query-a', page: 1, limit: 20, loadPage })
  await new Promise((resolve) => setTimeout(resolve, 5))
  const refreshed = await cache.getPage({ key: 'query-a', page: 1, limit: 20, loadPage })

  assert.equal(loadCount, 2)
  assert.equal(refreshed.cacheHit, false)
  assert.deepEqual(refreshed.data, [{ id: 2 }])
})

test('clears cached pages after catalog changes', async () => {
  const cache = createCatalogPageCache()
  let loadCount = 0
  const loadPage = async (page, limit) => ({
    data: [{ id: ++loadCount }],
    total: 1,
    page,
    limit,
  })

  await cache.getPage({ key: 'query-a', page: 1, limit: 20, loadPage })
  cache.clear()
  const refreshed = await cache.getPage({ key: 'query-a', page: 1, limit: 20, loadPage })

  assert.equal(loadCount, 2)
  assert.equal(refreshed.cacheHit, false)
  assert.deepEqual(refreshed.data, [{ id: 2 }])
})

test('limits retained pages per query and queries overall', async () => {
  const cache = createCatalogPageCache()
  let loadCount = 0
  const loadPage = async (page, limit) => ({
    data: [{ id: `${page}-${limit}-${++loadCount}` }],
    total: 20,
    page,
    limit,
  })

  for (let page = 1; page <= 4; page += 1) {
    await cache.getPage({ key: 'query-a', page, limit: 1, loadPage })
  }
  await cache.getPage({ key: 'query-b', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-c', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-d', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-e', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-f', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-g', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-h', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-i', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-j', page: 1, limit: 20, loadPage })
  await cache.getPage({ key: 'query-k', page: 1, limit: 20, loadPage })

  const evictedPage = await cache.getPage({ key: 'query-a', page: 2, limit: 1, loadPage })
  assert.equal(evictedPage.cacheHit, false)
  const evictedQuery = await cache.getPage({ key: 'query-b', page: 1, limit: 20, loadPage })
  assert.equal(evictedQuery.cacheHit, false)
})

test('rejects malformed page results and does not cache them', async () => {
  const cache = createCatalogPageCache()
  let loadCount = 0
  const loadPage = async (page, limit) => {
    loadCount += 1
    if (loadCount === 1) return { data: null, total: 1 }
    return { data: [{ id: 1 }], total: 1, page, limit }
  }

  await assert.rejects(
    cache.getPage({ key: 'query-a', page: 1, limit: 20, loadPage }),
    /invalid response/,
  )
  const result = await cache.getPage({ key: 'query-a', page: 1, limit: 20, loadPage })

  assert.equal(loadCount, 2)
  assert.equal(result.cacheHit, false)
  assert.deepEqual(result.data, [{ id: 1 }])
})
