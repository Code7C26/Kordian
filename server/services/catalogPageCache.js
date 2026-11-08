const MAX_CACHED_QUERIES = 10
const MAX_CACHED_PAGES_PER_QUERY = 3
const CACHE_TTL_MS = 5 * 60 * 1000

function createCatalogPageCache({ ttlMs = CACHE_TTL_MS } = {}) {
  const queries = new Map()

  function getQueryEntry(key) {
    let entry = queries.get(key)
    if (entry && Date.now() - entry.createdAt >= ttlMs) {
      queries.delete(key)
      entry = null
    }

    if (!entry) {
      entry = {
        createdAt: Date.now(),
        pages: new Map(),
        total: null,
      }
    }

    queries.delete(key)
    queries.set(key, entry)
    while (queries.size > MAX_CACHED_QUERIES) {
      queries.delete(queries.keys().next().value)
    }

    return entry
  }

  function rememberPage(entry, pageKey, pagePromise) {
    entry.pages.delete(pageKey)
    entry.pages.set(pageKey, pagePromise)
    while (entry.pages.size > MAX_CACHED_PAGES_PER_QUERY) {
      entry.pages.delete(entry.pages.keys().next().value)
    }

    pagePromise.catch(() => {
      if (entry.pages.get(pageKey) === pagePromise) entry.pages.delete(pageKey)
    })
    return pagePromise
  }

  async function getPage({ key, page, limit, loadPage }) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 20))
    const entry = getQueryEntry(key)
    const pageKey = `${safePage}:${safeLimit}`
    const cachedPage = entry.pages.get(pageKey)

    if (cachedPage) {
      entry.pages.delete(pageKey)
      entry.pages.set(pageKey, cachedPage)
      return { ...(await cachedPage), cacheHit: true }
    }

    const pagePromise = Promise.resolve()
      .then(() => loadPage(safePage, safeLimit))
      .then((payload) => {
        const total = Number(payload?.total)
        if (!payload || !Array.isArray(payload.data) || !Number.isFinite(total)) {
          throw new Error('Catalog page loader returned an invalid response')
        }

        entry.total = total
        return {
          data: payload.data,
          total,
          page: Number.isFinite(Number(payload.page)) ? Number(payload.page) : safePage,
          limit: Number.isFinite(Number(payload.limit)) ? Number(payload.limit) : safeLimit,
        }
      })

    rememberPage(entry, pageKey, pagePromise)
    return { ...(await pagePromise), cacheHit: false }
  }

  return {
    getPage,
    clear: () => queries.clear(),
  }
}

module.exports = { createCatalogPageCache }
