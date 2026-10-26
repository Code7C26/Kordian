import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchCachedCatalogResponse, readCachedCatalogResponse } from './catalogResponseCache.js'

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
