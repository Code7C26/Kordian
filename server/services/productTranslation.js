const MAX_TRANSLATION_CACHE_ENTRIES = 10000
const MAX_TRANSLATION_CONCURRENCY = 5
const TRANSLATION_TIMEOUT_MS = 15000

function validateTranslationServiceUrl(serviceUrl) {
  if (!serviceUrl) return null

  const parsedUrl = new URL(serviceUrl)
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
    throw new Error('Translation service URL must be an HTTP(S) URL without embedded credentials.')
  }

  return parsedUrl.toString()
}

function createProductTranslationService({
  serviceUrl,
  apiKey = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = TRANSLATION_TIMEOUT_MS,
  maxCacheEntries = MAX_TRANSLATION_CACHE_ENTRIES,
} = {}) {
  const endpoint = validateTranslationServiceUrl(serviceUrl)
  const cache = new Map()

  async function translateOne(name) {
    const cached = cache.get(name)
    if (cached) {
      cache.delete(name)
      cache.set(name, cached)
      return cached
    }

    if (!endpoint) {
      const error = new Error('Product translation service is not configured.')
      error.code = 'TRANSLATION_SERVICE_NOT_CONFIGURED'
      throw error
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: name,
          source: 'auto',
          target: 'en',
          format: 'text',
          ...(apiKey ? { api_key: apiKey } : {}),
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Translation provider returned HTTP ${response.status}.`)
      }

      const payload = await response.json()
      const translatedText = typeof payload?.translatedText === 'string'
        ? payload.translatedText.trim()
        : ''
      if (!translatedText) {
        throw new Error('Translation provider returned an empty translation.')
      }

      cache.set(name, translatedText)
      while (cache.size > maxCacheEntries) {
        cache.delete(cache.keys().next().value)
      }
      return translatedText
    } finally {
      clearTimeout(timeout)
    }
  }

  async function translate(names) {
    const uniqueNames = [...new Set(names)]
    const translated = new Map()
    for (let index = 0; index < uniqueNames.length; index += MAX_TRANSLATION_CONCURRENCY) {
      const batch = uniqueNames.slice(index, index + MAX_TRANSLATION_CONCURRENCY)
      const results = await Promise.all(batch.map(async (name) => [name, await translateOne(name)]))
      for (const [name, translatedText] of results) translated.set(name, translatedText)
    }
    return translated
  }

  return { translate }
}

module.exports = { createProductTranslationService }
