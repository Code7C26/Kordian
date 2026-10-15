const MAX_CACHED_PRODUCT_IDS = 20000

function createCatalogPageCache() {
  let activeKey = null
  let activeIndexPromise = null

  function reset(key) {
    activeKey = key
    activeIndexPromise = null
  }

  async function getPage({ key, page, limit, loadIndex, loadProductsByIds, loadPage }) {
    if (activeKey !== key) reset(key)

    if (!activeIndexPromise) {
      const indexPromise = Promise.resolve().then(() => loadIndex(page, limit))
      activeIndexPromise = indexPromise
      indexPromise.catch(() => {
        if (activeKey === key && activeIndexPromise === indexPromise) reset(null)
      })
    }

    const index = await activeIndexPromise
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
      if (activeKey === key) reset(null)
      if (Array.isArray(index?.data) && index.page === safePage && index.limit === safeLimit) {
        return {
          data: index.data,
          total: Number.isFinite(total) ? total : index.data.length,
          page: safePage,
          limit: safeLimit,
          cacheHit: false,
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
        cacheHit: false,
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

  return { getPage }
}

module.exports = { createCatalogPageCache }
