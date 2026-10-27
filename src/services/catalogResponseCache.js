const DEFAULT_TTL_MS = 30_000
export const CATALOG_REQUEST_TIMEOUT_MS = 65_000
const MAX_ENTRIES = 40
const responses = new Map()
const pendingRequests = new Map()
let productResponseGeneration = 0

function isProductCatalogUrl(url) {
  return String(url).split('?')[0].endsWith('/products')
}

export function invalidateCatalogProductResponses() {
  productResponseGeneration += 1
  const urls = new Set([...responses.keys(), ...pendingRequests.keys()])
  for (const url of urls) {
    if (!isProductCatalogUrl(url)) continue
    responses.delete(url)
    pendingRequests.delete(url)
  }
}

function rememberResponse(url, value, ttlMs) {
  responses.delete(url)
  responses.set(url, { value, expiresAt: Date.now() + ttlMs })
  while (responses.size > MAX_ENTRIES) responses.delete(responses.keys().next().value)
}

export function readCachedCatalogResponse(url) {
  const entry = responses.get(url)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    responses.delete(url)
    return null
  }
  responses.delete(url)
  responses.set(url, entry)
  return entry.value
}

function raceWithAbort(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason || new DOMException('Request aborted', 'AbortError'))

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason || new DOMException('Request aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export function fetchCachedCatalogResponse(url, {
  signal,
  ttlMs = DEFAULT_TTL_MS,
  bypassCache = false,
  timeoutMs = CATALOG_REQUEST_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  if (!bypassCache) {
    const cached = readCachedCatalogResponse(url)
    if (cached !== null) return raceWithAbort(Promise.resolve(cached), signal)
  }

  let request = pendingRequests.get(url)
  if (!request) {
    const isProductRequest = isProductCatalogUrl(url)
    const generation = isProductRequest ? productResponseGeneration : null
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Catalog request timed out', 'TimeoutError')), timeoutMs)
    const requestEntry = {}
    requestEntry.promise = fetchImpl(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalog request failed with status ${response.status}`)
        const payload = await response.json()
        if (!isProductRequest || productResponseGeneration === generation) {
          rememberResponse(url, payload, ttlMs)
        }
        return payload
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (pendingRequests.get(url) === requestEntry) {
          pendingRequests.delete(url)
        }
      })
    pendingRequests.set(url, requestEntry)
    request = requestEntry
  }

  return raceWithAbort(request.promise, signal)
}
