const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  createBatchId,
  createCheckpoint,
  createManifestCheckpoint,
  executeImport,
  flagDuplicateGtins,
  getBoundedInteger,
  getImportableItems,
  getImportableItemsForRun,
  getInitialItemStatus,
  getQueryProgress,
  recordPreviewPage,
  recordBatchFailure,
  serializeManualReviewCsv,
  setBatchResult,
  summarizeCheckpoint,
} = require('./import_carrefour_batches')

function makePreviewProduct(overrides = {}) {
  return {
    sourceProductId: '719377',
    ean: '7791337007253',
    price: 8210,
    importBlockedReason: null,
    priceReviewWarnings: [],
    ...overrides,
  }
}

function makeManifestRow(overrides = {}) {
  return {
    source_product_id: '122140',
    source_sku: '9547',
    gtin: '7791720025123',
    name: 'Lomito de atún en aceite Carrefour Classic 170 grs',
    brand: 'Carrefour Classic',
    category: 'Almacén',
    category_path: 'Almacén',
    price: '3059.7',
    availability: 'available',
    postal_code: '5186',
    postal_code_confirmed: 'true',
    product_url: 'https://www.carrefour.com.ar/lomito-atun-122140/p',
    capture_url: 'https://www.carrefour.com.ar/almacen?page=1',
    capture_timestamp: '2026-11-05T20:20:06.228Z',
    capture_method: 'rendered_dom_pagination',
    validation_status: 'valid',
    validation_errors: '',
    ...overrides,
  }
}

test('manifest checkpoint imports only valid high/medium taxonomy rows using importer inputs', () => {
  const checkpoint = createManifestCheckpoint([
    makeManifestRow({
      product_description: 'Heladera microondas papas fritas',
    }),
    makeManifestRow({
      source_product_id: '122141',
      source_sku: '9548',
      gtin: '7791337007253',
      name: 'Aceite de girasol 1.5 l',
    }),
    makeManifestRow({
      source_product_id: '122142',
      source_sku: '9549',
      gtin: '7798033333907',
      name: 'Detergente y esponja multiuso',
    }),
    makeManifestRow({
      source_product_id: '122143',
      source_sku: '9550',
      gtin: 'invalid',
      name: 'Aceite de girasol 1 l',
    }),
  ], {
    postalCode: '5186',
    manifestHash: 'manifest-hash',
    manifestPath: 'capture.csv',
  })

  assert.equal(checkpoint.scope, 'explicit_manifest_only')
  assert.equal(checkpoint.coverage.completeForManifest, true)
  assert.deepEqual(getImportableItems(checkpoint).map((item) => item.sourceProductId), ['122140', '122141'])
  assert.equal(checkpoint.items['122140'].proposedSubcategory, 'Conservas y alimentos preparados')
  assert.equal(checkpoint.items['122140'].taxonomySuggestionConfidence, 'high')
  assert.equal(checkpoint.items['122142'].status, 'manual_review')
  assert.equal(checkpoint.items['122143'].status, 'manual_review')
  assert.equal(summarizeCheckpoint(checkpoint, 'checkpoint.json').reviewCount, 2)
})

test('manifest checkpoint sends duplicate source IDs and GTINs to manual review', () => {
  const checkpoint = createManifestCheckpoint([
    makeManifestRow(),
    makeManifestRow({
      source_product_id: '122144',
      source_sku: '9551',
    }),
    makeManifestRow({
      source_product_id: '122140',
      source_sku: '9552',
      gtin: '7791337007253',
    }),
  ], {
    postalCode: '5186',
    manifestHash: 'manifest-hash',
    manifestPath: 'capture.csv',
  })

  assert.equal(getImportableItems(checkpoint).length, 0)
  assert.equal(Object.values(checkpoint.items).filter((item) => item.status === 'manual_review').length, 3)
})

test('manifest review CSV contains all rejected rows and reasons', () => {
  const checkpoint = createManifestCheckpoint([
    makeManifestRow({
      source_product_id: '122142',
      source_sku: '9549',
      gtin: '7798033333907',
      name: 'Detergente y esponja multiuso',
    }),
  ], {
    postalCode: '5186',
    manifestHash: 'manifest-hash',
    manifestPath: 'capture.csv',
  })

  const reviewCsv = serializeManualReviewCsv(checkpoint)
  assert.match(reviewCsv, /source_product_id/)
  assert.match(reviewCsv, /Detergente y esponja multiuso/)
  assert.match(reviewCsv, /conflicting_product_types/)
})

test('checkpoint tracks paginated query coverage and deduplicates repeated product IDs', () => {
  const checkpoint = createCheckpoint('5186', ['leche'])
  const product = makePreviewProduct()

  recordPreviewPage(checkpoint, 'leche', 0, {
    products: [product],
    discarded: [],
    resultLimit: 20,
    hasMore: true,
  })
  recordPreviewPage(checkpoint, 'leche', 20, {
    products: [{ ...product, name: 'Leche Cindor' }],
    discarded: [],
    resultLimit: 20,
    hasMore: false,
  })

  assert.equal(getQueryProgress(checkpoint, 'leche').status, 'complete')
  assert.equal(getQueryProgress(checkpoint, 'leche').pages, 2)
  assert.equal(Object.keys(checkpoint.items).length, 1)
  assert.deepEqual(checkpoint.items['719377'].queries, ['leche'])
})

test('blocks same Carrefour IDs that change GTIN or price between discovery pages', () => {
  const checkpoint = createCheckpoint('5186', ['leche', 'chocolate'])
  recordPreviewPage(checkpoint, 'leche', 0, {
    products: [makePreviewProduct()],
    resultLimit: 20,
    hasMore: false,
  })
  recordPreviewPage(checkpoint, 'chocolate', 0, {
    products: [makePreviewProduct({ price: 8500 })],
    resultLimit: 20,
    hasMore: false,
  })

  assert.equal(checkpoint.items['719377'].status, 'manual_review')
  assert.match(checkpoint.items['719377'].reviewReason, /distinto GTIN o precio/)
})

test('flags duplicate GTINs and price warnings for manual review', () => {
  const checkpoint = createCheckpoint('5186', ['leche'])
  recordPreviewPage(checkpoint, 'leche', 0, {
    products: [
      makePreviewProduct(),
      makePreviewProduct({
        sourceProductId: '719378',
        name: 'Leche Cindor alternativa',
      }),
      makePreviewProduct({
        sourceProductId: '719379',
        ean: '7791337007260',
        priceReviewWarnings: ['La diferencia de precio es 4x'],
      }),
    ],
    resultLimit: 20,
    hasMore: false,
  })
  flagDuplicateGtins(checkpoint)

  assert.equal(checkpoint.items['719377'].status, 'manual_review')
  assert.match(checkpoint.items['719377'].reviewReason, /GTIN .* varios IDs/)
  assert.equal(checkpoint.items['719378'].status, 'manual_review')
  assert.equal(checkpoint.items['719379'].status, 'manual_review')
  assert.deepEqual(getImportableItems(checkpoint), [])
})

test('keeps only safe pending products importable and generates stable batch IDs', () => {
  const checkpoint = createCheckpoint('5186', ['leche'])
  recordPreviewPage(checkpoint, 'leche', 0, {
    products: [
      makePreviewProduct(),
      makePreviewProduct({ sourceProductId: '719378', ean: '7791337007260' }),
      makePreviewProduct({ sourceProductId: '719379', importBlockedReason: 'Falta categoría' }),
    ],
    resultLimit: 20,
    hasMore: false,
  })

  const items = getImportableItems(checkpoint)
  assert.deepEqual(items.map((item) => item.sourceProductId), ['719377', '719378'])
  assert.equal(createBatchId('5186', items), createBatchId('5186', [...items].reverse()))
  assert.equal(getInitialItemStatus(makePreviewProduct({ priceReviewWarnings: ['revisar'] })), 'manual_review')
})

test('caps each execution at 25 importable products and leaves later items for another run', () => {
  const checkpoint = createCheckpoint('5186', ['leche'])
  for (let index = 1; index <= 30; index += 1) {
    const sourceProductId = String(index)
    checkpoint.items[sourceProductId] = {
      sourceProductId,
      product: makePreviewProduct({ sourceProductId }),
      status: 'pending',
    }
  }

  const selected = getImportableItemsForRun(checkpoint)
  assert.equal(selected.length, 25)
  assert.equal(getImportableItems(checkpoint).length - selected.length, 5)
  assert.deepEqual(selected.map((item) => item.sourceProductId), Array.from({ length: 25 }, (_, index) => String(index + 1)))
  assert.throws(() => getImportableItemsForRun(checkpoint, 26), /entero entre 1 y 25/)
})

test('records API results by source ID and skips unknown result entries', () => {
  const checkpoint = createCheckpoint('5186', ['leche'])
  recordPreviewPage(checkpoint, 'leche', 0, {
    products: [makePreviewProduct()],
    resultLimit: 20,
    hasMore: false,
  })

  setBatchResult(checkpoint, {
    imported: [{ sourceProductId: '719377', productId: 24006 }],
    updated: [{ sourceProductId: 'untracked', productId: 99 }],
  })
  assert.equal(checkpoint.items['719377'].status, 'imported')
  assert.equal(checkpoint.items['719377'].productId, 24006)
  assert.equal(checkpoint.items['untracked'], undefined)
})

test('manifest imports keep server-skipped products in manual review', () => {
  const checkpoint = createManifestCheckpoint([makeManifestRow()], {
    postalCode: '5186',
    manifestHash: 'manifest-hash',
    manifestPath: 'capture.csv',
  })
  setBatchResult(checkpoint, {
    skipped: [{ sourceProductId: '122140', reason: 'Falta mapeo de categoría y subcategoría' }],
  }, { skippedStatus: 'manual_review' })
  checkpoint.items['122140'].reviewReason = 'Falta mapeo de categoría y subcategoría'

  assert.equal(checkpoint.items['122140'].status, 'manual_review')
  assert.equal(checkpoint.items['122140'].reviewReason, 'Falta mapeo de categoría y subcategoría')
})

test('isolates unavailable manifest products when the API confirms the batch made no writes', () => {
  const checkpoint = createManifestCheckpoint([
    makeManifestRow(),
    makeManifestRow({
      source_product_id: '122141',
      source_sku: '9548',
      gtin: '7791337007253',
      name: 'Aceite de girasol 1.5 l',
    }),
  ], {
    postalCode: '5186',
    manifestHash: 'manifest-hash',
    manifestPath: 'capture.csv',
  })
  const batch = [checkpoint.items['122140'], checkpoint.items['122141']]
  const shouldContinue = recordBatchFailure(checkpoint, batch, {
    status: 502,
    response: {
      error: 'Carrefour no devolvió el producto 122140',
      noWrites: true,
      missingSourceProductId: '122140',
    },
  })

  assert.equal(shouldContinue, true)
  assert.equal(checkpoint.items['122140'].status, 'manual_review')
  assert.equal(checkpoint.items['122141'].status, 'retryable')
})

test('keeps known no-write price conflicts in review and continues with later batches', () => {
  const checkpoint = createManifestCheckpoint([makeManifestRow()], {
    postalCode: '5186',
    manifestHash: 'manifest-hash',
    manifestPath: 'capture.csv',
  })
  const shouldContinue = recordBatchFailure(
    checkpoint,
    [checkpoint.items['122140']],
    {
      status: 409,
      response: {
        error: 'El lote contiene precios que requieren revisión manual',
        noWrites: true,
        priceWarnings: [{ sourceProductId: '122140' }],
      },
    },
  )

  assert.equal(shouldContinue, true)
  assert.equal(checkpoint.items['122140'].status, 'manual_review')
})

test('refuses execution unless every explicit search term was completely discovered', async () => {
  const checkpoint = createCheckpoint('5186', ['leche'])
  await assert.rejects(
    executeImport(checkpoint, 'unused.json', {}, { batchSize: 2, delayMs: 1 }),
    /no tiene cobertura completa/
  )
})

test('records elapsed time for a resumable manifest import run', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'carrefour-import-timing-'))
  const checkpoint = createManifestCheckpoint([], {
    postalCode: '5186',
    manifestHash: 'empty-manifest',
    manifestPath: 'capture.csv',
  })

  try {
    await executeImport(checkpoint, path.join(directory, 'checkpoint.json'), {}, {
      batchSize: 2,
      delayMs: 1,
    })
    assert.ok(checkpoint.lastRunTimingsMs.reconciliation >= 0)
    assert.ok(checkpoint.lastRunTimingsMs.import >= 0)
    assert.ok(checkpoint.lastRunTimingsMs.total >= checkpoint.lastRunTimingsMs.import)
    assert.equal(fs.existsSync(path.join(directory, 'checkpoint.json')), true)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('rejects invalid runner limits instead of silently coercing them', () => {
  assert.equal(getBoundedInteger(undefined, 2, 1, 2, 'batchSize'), 2)
  assert.equal(getBoundedInteger('1', 2, 1, 2, 'batchSize'), 1)
  assert.throws(() => getBoundedInteger('3', 2, 1, 2, 'batchSize'), /entero entre 1 y 2/)
  assert.throws(() => getBoundedInteger('1.5', 2, 1, 2, 'batchSize'), /entero entre 1 y 2/)
})