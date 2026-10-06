const assert = require('node:assert/strict')
const test = require('node:test')
const { requestImportBatch } = require('./import_mami_batches')

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('retries catalog read failures that happen before writes', async () => {
  const originalFetch = global.fetch
  let calls = 0
  global.fetch = async () => {
    calls += 1
    if (calls < 3) return jsonResponse(500, { error: 'No se pudo consultar el catálogo local', detail: 'transient read error' })
    return jsonResponse(200, { imported: [] })
  }

  try {
    const result = await requestImportBatch('http://localhost/admin/import/mami', {}, { maxAttempts: 3, retryDelayMs: 1 })
    assert.deepEqual(result, { imported: [] })
    assert.equal(calls, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('does not retry ambiguous server errors', async () => {
  const originalFetch = global.fetch
  let calls = 0
  global.fetch = async () => {
    calls += 1
    return jsonResponse(500, { error: 'No se pudieron importar los productos de Mami' })
  }

  try {
    await assert.rejects(
      requestImportBatch('http://localhost/admin/import/mami', {}, { maxAttempts: 3, retryDelayMs: 1 }),
      /No se pudieron importar los productos de Mami/
    )
    assert.equal(calls, 1)
  } finally {
    global.fetch = originalFetch
  }
})