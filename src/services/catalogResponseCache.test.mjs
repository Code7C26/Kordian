import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CATALOG_REQUEST_TIMEOUT_MS,
  fetchCachedCatalogResponse,
  invalidateCatalogProductResponses,
  readCachedCatalogResponse,
} from './catalogResponseCache.js'

test('shares pending requests and returns cached catalog responses', async () => {
  const url = `https://catalog.test/products?case=${Date.now()}`
  let requestCount = 0
  const fetchImpl = async () => {
    requestCount += 1
    await new Promise((resolve) => setTimeout(resolve, 5))
    return { ok: true, json: async () => ({ data: ['product'] }) }
  }

  const [first, second] = await Promise.all([
    fetchCachedCatalogResponse(url, { fetchImpl }),
    fetchCachedCatalogResponse(url, { fetchImpl }),
  ])
  const cached = await fetchCachedCatalogResponse(url, { fetchImpl })

  assert.deepEqual(first, { data: ['product'] })
  assert.deepEqual(second, first)
  assert.deepEqual(cached, first)
  assert.equal(requestCount, 1)
  assert.deepEqual(readCachedCatalogResponse(url), first)
})

test('does not cache failed catalog responses', async () => {
  const url = `https://catalog.test/products?failure=${Date.now()}`
  const fetchImpl = async () => ({ ok: false, status: 503 })

  await assert.rejects(fetchCachedCatalogResponse(url, { fetchImpl }), /503/)
  assert.equal(readCachedCatalogResponse(url), null)
})

test('expires cached catalog responses', async () => {
  const url = `https://catalog.test/products?expiry=${Date.now()}`
  await fetchCachedCatalogResponse(url, {
    ttlMs: 1,
    fetchImpl: async () => ({ ok: true, json: async () => ['product'] }),
  })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(readCachedCatalogResponse(url), null)
})

test('invalidates cached and in-flight product responses after a grouping decision', async () => {
  const url = `https://catalog.test/products?grouping=${Date.now()}`
  let resolveFirstRequest
  let requestCount = 0
  const fetchImpl = () => {
    requestCount += 1
    if (requestCount === 1) {
      return new Promise((resolve) => {
        resolveFirstRequest = () => resolve({ ok: true, json: async () => ['stale'] })
      })
    }
    return Promise.resolve({ ok: true, json: async () => ['fresh'] })
  }

  const staleRequest = fetchCachedCatalogResponse(url, { fetchImpl })
  invalidateCatalogProductResponses()
  const freshRequest = fetchCachedCatalogResponse(url, { fetchImpl })
  assert.deepEqual(await freshRequest, ['fresh'])
  resolveFirstRequest()
  assert.deepEqual(await staleRequest, ['stale'])
  assert.deepEqual(readCachedCatalogResponse(url), ['fresh'])
  assert.equal(requestCount, 2)
})

test('times out slow requests and allows a later retry', async () => {
  const url = `https://catalog.test/products?timeout=${Date.now()}`
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

  assert.equal(CATALOG_REQUEST_TIMEOUT_MS, 65_000)
  await assert.rejects(
    fetchCachedCatalogResponse(url, { fetchImpl, timeoutMs: 5 }),
    (error) => error.name === 'TimeoutError',
  )
  assert.equal(readCachedCatalogResponse(url), null)

  const retry = await fetchCachedCatalogResponse(url, {
    fetchImpl: async () => ({ ok: true, json: async () => ['retry'] }),
  })
  assert.deepEqual(retry, ['retry'])
})
