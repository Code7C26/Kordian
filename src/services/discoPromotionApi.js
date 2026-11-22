const PROMOTION_CACHE_TTL_MS = 10 * 60 * 1000
const PROMOTION_ERROR_CACHE_TTL_MS = 30 * 1000
const PROMOTION_REQUEST_TIMEOUT_MS = 25 * 1000

export function createDiscoPromotionClient({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map()
  const inFlight = new Map()

  function getCached(ean) {
    const entry = cache.get(ean)
    if (!entry) return null
    if (entry.expiresAt <= now()) {
      cache.delete(ean)
      return null
    }
    return entry.result
  }

  function requestBatch(eans, url) {
    return fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eans }),
      signal: AbortSignal.timeout(PROMOTION_REQUEST_TIMEOUT_MS),
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`)
      if (!Array.isArray(payload.results)) throw new Error('Invalid Disco promotion response')
      return new Map(payload.results.map((result) => [String(result.ean || ''), result]))
    }).catch((error) => new Map(eans.map((ean) => [ean, { ean, status: 'error', error }])))
  }

  async function fetchPromotions(eans, url) {
    if (!Array.isArray(eans)) throw new TypeError('eans must be an array')
    if (!url) throw new TypeError('url is required')
    const normalizedEans = [...new Set(eans.map((ean) => String(ean || '').replace(/\D/g, '')))]
    if (normalizedEans.some((ean) => !/^\d{8,14}$/.test(ean))) {
      throw new TypeError('Every EAN must contain between 8 and 14 digits')
    }

    const missingEans = normalizedEans.filter((ean) => !getCached(ean) && !inFlight.has(ean))
    for (let offset = 0; offset < missingEans.length; offset += 20) {
      const batch = missingEans.slice(offset, offset + 20)
      const batchPromise = requestBatch(batch, url)
      for (const ean of batch) {
        const resultPromise = batchPromise.then((results) => (
          results.get(ean) || { ean, status: 'error', error: new Error('Missing promotion result') }
        ))
        inFlight.set(ean, resultPromise)
        void resultPromise.then((result) => {
          cache.set(ean, {
            result,
            expiresAt: now() + (result.status === 'ready'
              ? PROMOTION_CACHE_TTL_MS
              : PROMOTION_ERROR_CACHE_TTL_MS),
          })
        }).finally(() => {
          if (inFlight.get(ean) === resultPromise) inFlight.delete(ean)
        })
      }
    }

    return Promise.all(normalizedEans.map((ean) => {
      const cached = getCached(ean)
      return cached ? Promise.resolve(cached) : inFlight.get(ean)
    }))
  }

  return { fetchPromotions }
}

const defaultClient = createDiscoPromotionClient()

export const fetchDiscoPromotions = defaultClient.fetchPromotions
