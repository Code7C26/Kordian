const assert = require('node:assert/strict')
const test = require('node:test')
const { rememberProduct, requestImportBatch } = require('./import_mami_batches')

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('Mami batch proposals preserve determined mappings and abstain on ambiguous names', () => {
  const checkpoint = { items: {} }
  rememberProduct(checkpoint, {
    sourceProductId: 'mami-oil-1',
    name: 'Aceite de girasol 1 l',
    brand: 'Marca',
    price: 100,
  })
  rememberProduct(checkpoint, {
    sourceProductId: 'mami-ambiguous-1',
    name: 'Detergente y esponja multiuso 500 g',
    brand: 'Marca',
    price: 100,
  })

  const determined = checkpoint.items['mami-oil-1'].product
  assert.equal(determined.proposedCategory, 'Almacén y Alimentos')
  assert.equal(determined.proposedSubcategory, 'Aceites, condimentos y aderezos')
  assert.equal(determined.mappingStatus, 'propuesta_automatica')
  assert.equal(determined.taxonomySuggestionStatus, 'determined')

  const ambiguous = checkpoint.items['mami-ambiguous-1'].product
  assert.equal(ambiguous.proposedCategory, null)
  assert.equal(ambiguous.proposedSubcategory, null)
  assert.equal(ambiguous.mappingStatus, 'revision_manual')
  assert.equal(ambiguous.taxonomySuggestionStatus, 'ambiguous')
})

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