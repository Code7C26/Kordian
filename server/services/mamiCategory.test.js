const assert = require('node:assert/strict')
const test = require('node:test')

process.env.MAMI_MAX_ATTEMPTS = '2'
process.env.MAMI_RETRY_BASE_MS = '50'

const { fetchMamiCategoryReport } = require('./mamiImporter')

function createResponse(html) {
  return {
    ok: true,
    status: 200,
    headers: { getSetCookie: () => [], get: () => null },
    text: async () => html,
  }
}

test('fetches one category and its listed product details', async () => {
  const originalFetch = global.fetch
  const requests = []
  global.fetch = async (url) => {
    requests.push(String(url))
    return createResponse(String(url).includes('/super/producto/')
      ? '<main>Detalle de producto</main>'
      : '<a href="/super/categoria/supermami-aguas"></a><a href="/super/producto/supermami-agua/_/A-1"></a>')
  }

  try {
    const report = await fetchMamiCategoryReport('/super/categoria/supermami-bebidas')
    assert.equal(report.sourceRead.htmlFetched, true)
    assert.deepEqual(report.categoryRoutes, ['/super/categoria/supermami-aguas'])
    assert.deepEqual(report.productRoutes, ['/super/producto/supermami-agua/_/A-1'])
    assert.equal(requests.some((url) => url.includes('/super/producto/')), true)
  } finally {
    global.fetch = originalFetch
  }
})

test('rejects a category when a listed product detail is unavailable', async () => {
  const originalFetch = global.fetch
  global.fetch = async (url) => createResponse(String(url).includes('/super/producto/')
    ? ''
    : '<a href="/super/producto/supermami-leche/_/A-2"></a>')

  try {
    await assert.rejects(
      fetchMamiCategoryReport('/super/categoria/supermami-lacteos'),
      /no entrego todos los detalles de producto/
    )
  } finally {
    global.fetch = originalFetch
  }
})