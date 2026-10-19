const MAX_CACHED_PRODUCT_IDS = 20000
const MAX_CACHED_QUERIES = 10

function createCatalogPageCache() {
  const indexes = new Map()

  function removeIndex(key, entry) {
    if (indexes.get(key) === entry) indexes.delete(key)
  }

  async function getPage({ key, page, limit, loadIndex, loadProductsByIds, loadPage }) {
    let entry = indexes.get(key)
    const cacheHit = Boolean(entry)

    if (entry) {
      indexes.delete(key)
      indexes.set(key, entry)
    } else {
      entry = {
        promise: Promise.resolve().then(() => loadIndex(page, limit)),
      }
      indexes.set(key, entry)
      entry.promise.catch(() => removeIndex(key, entry))

      while (indexes.size > MAX_CACHED_QUERIES) {
        indexes.delete(indexes.keys().next().value)
      }
    }

    const index = await entry.promise
    const ids = index?.orderedIds
    const total = Number(index?.total)
    const safePage = Math.max(1, Math.floor(Number(page) || 1))
    const safeLimit = Math.max(1, Math.floor(Number(limit) || 20))
    if (
      !Array.isArray(ids)
      || !Array.isArray(index?.data)
      || !Number.isFinite(total)
      || ids.length !== total
      || ids.length > MAX_CACHED_PRODUCT_IDS
    ) {
      removeIndex(key, entry)
      if (Array.isArray(index?.data) && index.page === safePage && index.limit === safeLimit) {
        return {
          data: index.data,
          total: Number.isFinite(total) ? total : index.data.length,
          page: safePage,
          limit: safeLimit,
          cacheHit,
        }
      }
      const payload = await loadPage(page, limit)
      return { ...payload, cacheHit: false }
    }

    const start = (safePage - 1) * safeLimit
    const pageIds = ids.slice(start, start + safeLimit)

    if (index.page === safePage && index.limit === safeLimit) {
      return {
        data: index.data,
        total,
        page: safePage,
        limit: safeLimit,
        cacheHit,
      }
    }

    const products = pageIds.length ? await loadProductsByIds(pageIds) : []
    const productById = new Map(products.map((product) => [String(product?.id), product]))
    return {
      data: pageIds.map((id) => productById.get(String(id))).filter(Boolean),
      total,
      page: safePage,
      limit: safeLimit,
      cacheHit: true,
    }
  }

  return {
    getPage,
    clear: () => indexes.clear(),
  }
}

module.exports = { createCatalogPageCache }
