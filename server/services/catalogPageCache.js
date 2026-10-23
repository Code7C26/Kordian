const MAX_CACHED_PRODUCT_IDS = 20000
const MAX_CACHED_QUERIES = 10
const MAX_CACHED_PAGES_PER_QUERY = 3
const CACHE_TTL_MS = 5 * 60 * 1000

function createCatalogPageCache({ ttlMs = CACHE_TTL_MS } = {}) {
  const indexes = new Map()

  function removeIndex(key, entry) {
    if (indexes.get(key) === entry) indexes.delete(key)
  }

  function rememberPage(entry, page, pagePromise) {
    const pageKey = String(page)
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

  function loadCachedPage(entry, page, pageIds, loadProductsByIds) {
    const pageKey = String(page)
    const cachedPage = entry.pages.get(pageKey)
    if (cachedPage) {
      entry.pages.delete(pageKey)
      entry.pages.set(pageKey, cachedPage)
      return { pagePromise: cachedPage, cacheHit: true }
    }

    const pagePromise = Promise.resolve().then(async () => {
      const products = pageIds.length ? await loadProductsByIds(pageIds) : []
      const productById = new Map(products.map((product) => [String(product?.id), product]))
      return pageIds.map((id) => productById.get(String(id))).filter(Boolean)
    })
    rememberPage(entry, page, pagePromise)
    return { pagePromise, cacheHit: false }
  }

  function getIndex(key, loadIndex) {
    let entry = indexes.get(key)

    if (entry) {
      if (Date.now() - entry.createdAt >= ttlMs) {
        indexes.delete(key)
        entry = null
      }
    }

    if (entry) {
      indexes.delete(key)
      indexes.set(key, entry)
    } else {
      entry = {
        promise: Promise.resolve().then(loadIndex),
        pages: new Map(),
        createdAt: Date.now(),
      }
      indexes.set(key, entry)
      entry.promise.catch(() => removeIndex(key, entry))

      while (indexes.size > MAX_CACHED_QUERIES) {
        indexes.delete(indexes.keys().next().value)
      }
    }

    return entry
  }

  async function getPage({ key, page, limit, loadIndex, loadProductsByIds, loadPage }) {
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 20))
    const existingEntry = indexes.get(key)
    const wasCached = Boolean(existingEntry && Date.now() - existingEntry.createdAt < ttlMs)
    const entry = getIndex(key, () => loadIndex(page, limit))
    const index = await entry.promise
    const ids = index?.orderedIds
    const total = Number(index?.total)
    if (
      !Array.isArray(ids)
      || !Array.isArray(index?.data)
      || !Number.isFinite(total)
      || ids.length !== total
      || ids.length > MAX_CACHED_PRODUCT_IDS
    ) {
      removeIndex(key, entry)
      if (Array.isArray(index?.data) && index.page === safePage && index.limit === safeLimit) {
        rememberPage(entry, safePage, Promise.resolve(index.data))
        return {
          data: index.data,
          total: Number.isFinite(total) ? total : index.data.length,
          page: safePage,
          limit: safeLimit,
          cacheHit: wasCached,
        }
      }
      const payload = await loadPage(page, limit)
      return { ...payload, cacheHit: false }
    }

    const start = (safePage - 1) * safeLimit
    const pageIds = ids.slice(start, start + safeLimit)
    let pagePromise
    let cacheHit
    if (index.page === safePage && index.limit === safeLimit) {
      pagePromise = rememberPage(entry, safePage, Promise.resolve(index.data))
      cacheHit = wasCached
    } else {
      const pageResult = loadCachedPage(entry, safePage, pageIds, loadProductsByIds)
      pagePromise = pageResult.pagePromise
      cacheHit = pageResult.cacheHit
    }

    return {
      data: await pagePromise,
      total,
      page: safePage,
      limit: safeLimit,
      cacheHit,
    }
  }

  async function prefetchPage({ key, page, limit, loadProductsByIds }) {
    const entry = indexes.get(key)
    if (!entry || Date.now() - entry.createdAt >= ttlMs) return false

    const index = await entry.promise
    const ids = index?.orderedIds
    const total = Number(index?.total)
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 20))
    if (
      !Array.isArray(ids)
      || !Number.isFinite(total)
      || ids.length !== total
      || ids.length > MAX_CACHED_PRODUCT_IDS
      || safePage < 1
      || (safePage - 1) * safeLimit >= total
    ) return false

    const start = (safePage - 1) * safeLimit
    const pageIds = ids.slice(start, start + safeLimit)
    await loadCachedPage(entry, safePage, pageIds, loadProductsByIds).pagePromise
    return true
  }

  return {
    getPage,
    prefetchPage,
    clear: () => indexes.clear(),
  }
}

module.exports = { createCatalogPageCache }
