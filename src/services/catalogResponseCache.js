const DEFAULT_TTL_MS = 30_000
const MAX_ENTRIES = 40
const responses = new Map()
const pendingRequests = new Map()

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
  fetchImpl = fetch,
} = {}) {
  if (!bypassCache) {
    const cached = readCachedCatalogResponse(url)
    if (cached !== null) return raceWithAbort(Promise.resolve(cached), signal)
  }

  let request = pendingRequests.get(url)
  if (!request) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(new DOMException('Catalog request timed out', 'TimeoutError')), 15_000)
    request = fetchImpl(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Catalog request failed with status ${response.status}`)
        const payload = await response.json()
        rememberResponse(url, payload, ttlMs)
        return payload
      })
      .finally(() => {
        clearTimeout(timeoutId)
        pendingRequests.delete(url)
      })
    pendingRequests.set(url, request)
  }

  return raceWithAbort(request, signal)
}
