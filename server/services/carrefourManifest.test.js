const assert = require('node:assert/strict')
const test = require('node:test')
const {
  findLocalMatch,
  findManifestDuplicates,
  getPackageSizeReviewWarning,
  getPriceReviewWarning,
  validateCarrefourManifestRow,
} = require('./carrefourManifest')

function validRow(overrides = {}) {
  return {
    source_product_id: '719377',
    source_sku: '141554',
    gtin: '7791337007253',
    name: 'Leche chocolatada Cindor 1 l',
    net_content: '1 l',
    net_content_unit: 'l',
    net_content_value: '1',
    brand: 'Cindor',
    category: 'Leches saborizadas',
    price: '8210',
    unit_price: '8210',
    raw_unit_price: '$ 8.210 por litro',
    list_price: '9000',
    is_offer: 'true',
    availability: 'available',
    postal_code: '5186',
    postal_code_confirmed: 'true',
    product_url: 'https://www.carrefour.com.ar/leche-cindor-719377/p',
    capture_url: 'https://www.carrefour.com.ar/lacteos',
    capture_timestamp: '2026-10-28T14:00:00.000Z',
    capture_method: 'rendered_dom_manual',
    validation_status: 'valid',
    validation_errors: '',
    ...overrides,
  }
}

test('accepts a complete manually captured row without making network or database writes', () => {
  const result = validateCarrefourManifestRow(validRow())
  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.product.sourceProductId, '719377')
  assert.equal(result.product.ean, '7791337007253')
  assert.equal(result.product.price, 8210)
  assert.equal(result.product.netContent, '1 l')
  assert.equal(result.product.netContentUnit, 'l')
  assert.equal(result.product.netContentValue, 1)
  assert.equal(result.product.unitPrice, 8210)
  assert.equal(result.product.rawUnitPrice, '$ 8.210 por litro')
  assert.equal(result.product.postalCode, '5186')
})

test('keeps new measurement fields optional for older manifests', () => {
  const result = validateCarrefourManifestRow(validRow({
    net_content: '',
    net_content_unit: '',
    net_content_value: '',
    unit_price: '',
    raw_unit_price: '',
  }))

  assert.equal(result.valid, true)
  assert.equal(result.product.netContent, '')
  assert.equal(result.product.netContentUnit, '')
  assert.equal(result.product.netContentValue, null)
  assert.equal(result.product.unitPrice, null)
  assert.equal(result.product.rawUnitPrice, '')
})

test('blocks unconfirmed region, missing identifiers, bad GTIN, and invalid product URL', () => {
  const result = validateCarrefourManifestRow(validRow({
    source_sku: '',
    gtin: '7791337007254',
    postal_code_confirmed: 'false',
    product_url: 'https://example.com/product',
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('SKU de origen inválido'))
  assert.ok(result.errors.includes('GTIN/EAN inválido'))
  assert.ok(result.errors.includes('El operador no confirmó el código postal'))
  assert.ok(result.errors.includes('La URL no es una página de producto Carrefour verificable'))
})

test('requires a valid real SKU and successful extension validation', () => {
  const result = validateCarrefourManifestRow(validRow({
    source_sku: 'crf_123456',
    validation_status: 'needs_review',
    validation_errors: 'No se pudo leer un GTIN',
  }))
  assert.equal(result.valid, false)
  assert.ok(result.errors.includes('La extensión marcó el producto para revisión'))
  assert.ok(result.errors.includes('La extensión registró errores de validación'))
})

test('uses official Carrefour enrichment to validate a paginated capture marked for review', () => {
  const result = validateCarrefourManifestRow(validRow({
    source_product_id: '122140',
    source_sku: '',
    gtin: '',
    name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    category: 'Almacén',
    price: '3290',
    availability: 'unknown',
    product_url: 'https://www.carrefour.com.ar/lomito-de-atun-al-natural-carrefour-classic-170-grs-122140/p',
    capture_method: 'rendered_dom_pagination',
    validation_status: 'needs_review',
    validation_errors: 'Faltan datos en la tarjeta',
    enrichment_status: 'validated',
    enriched_source_product_id: '122140',
    enriched_source_sku: '9547',
    enriched_gtin: '7798033333907',
    enriched_name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    enriched_brand: 'Carrefour',
    enriched_category: 'Conservas y alimentos preparados',
    enriched_price: '3290',
    enriched_availability: 'available',
    enriched_product_url: 'https://www.carrefour.com.ar/lomito-de-atun-al-natural-carrefour-classic-170-grs-122140/p',
  }))

  assert.equal(result.valid, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.product.sourceProductId, '122140')
  assert.equal(result.product.sourceSku, '9547')
  assert.equal(result.product.ean, '7798033333907')
  assert.equal(result.product.category, 'Conservas y alimentos preparados')
  assert.equal(result.product.price, 3290)
})

test('accepts a strict historical identity match only when captured errors were limited to missing GTIN', () => {
  const result = validateCarrefourManifestRow(validRow({
    source_product_id: '122140',
    source_sku: '9547',
    gtin: '7798033333907',
    name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    validation_status: 'needs_review',
    validation_errors: 'No se pudo leer un GTIN',
    identity_source: 'historical_validated',
    gtin_extraction_method: 'historical_strict_match',
    gtin_validation_status: 'valid',
    identity_match_method: 'exact_id_name_sku_presentation',
    historical_source_product_id: '122140',
    historical_source_sku: '9547',
    historical_source_gtin: '7798033333907',
    historical_source_name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    historical_source_enrichment_status: 'validated',
    historical_source_capture_timestamp: '2026-10-29T17:02:31.540Z',
    availability: 'available',
  }))

  assert.equal(result.valid, true)
  assert.equal(result.product.identitySource, 'historical_validated')
})

test('does not trust historical identity when evidence differs or capture has another validation error', () => {
  const evidenceMismatch = validateCarrefourManifestRow(validRow({
    source_product_id: '122140',
    source_sku: '9547',
    gtin: '7798033333907',
    name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    validation_status: 'needs_review',
    validation_errors: 'No se pudo leer un GTIN',
    identity_source: 'historical_validated',
    gtin_extraction_method: 'historical_strict_match',
    gtin_validation_status: 'valid',
    identity_match_method: 'exact_id_name_sku_presentation',
    historical_source_product_id: '122140',
    historical_source_sku: 'different-sku',
    historical_source_gtin: '7798033333907',
    historical_source_name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    historical_source_enrichment_status: 'validated',
    historical_source_capture_timestamp: '2026-10-29T17:02:31.540Z',
  }))
  assert.equal(evidenceMismatch.valid, false)
  assert.ok(evidenceMismatch.errors.includes('La extensión marcó el producto para revisión'))

  const additionalCaptureError = validateCarrefourManifestRow(validRow({
    source_product_id: '122140',
    source_sku: '9547',
    gtin: '7798033333907',
    name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    validation_status: 'needs_review',
    validation_errors: 'No se pudo leer un GTIN; Disponibilidad no confirmada',
    identity_source: 'historical_validated',
    gtin_extraction_method: 'historical_strict_match',
    gtin_validation_status: 'valid',
    identity_match_method: 'exact_id_name_sku_presentation',
    historical_source_product_id: '122140',
    historical_source_sku: '9547',
    historical_source_gtin: '7798033333907',
    historical_source_name: 'Lomito de atún al natural Carrefour Classic 170 grs',
    historical_source_enrichment_status: 'validated',
    historical_source_capture_timestamp: '2026-10-29T17:02:31.540Z',
  }))
  assert.equal(additionalCaptureError.valid, false)
  assert.ok(additionalCaptureError.errors.includes('La extensión registró errores adicionales a la falta de GTIN'))
})

test('finds repeated IDs, SKUs and GTINs in the captured manifest', () => {
  const first = validateCarrefourManifestRow(validRow())
  const second = validateCarrefourManifestRow(validRow({ name: 'Nombre distinto' }))
  const issues = findManifestDuplicates([
    { rowNumber: 2, product: first.product },
    { rowNumber: 3, product: second.product },
  ])
  assert.deepEqual(issues.map((issue) => issue.kind).sort(), ['gtin', 'source_product_id', 'source_sku'])
  assert.ok(issues.every((issue) => issue.rowNumbers.length === 2))
})

test('flags large cross-offer price differences for manual review', () => {
  assert.equal(
    getPriceReviewWarning(8210, [{ supermarket: 'Disco', cash_price: 8000 }]),
    null,
  )
  assert.match(
    getPriceReviewWarning(82100, [{ supermarket: 'Disco', cash_price: 8000 }]),
    /10\.26x/,
  )
})

test('flags conflicting package sizes while normalizing equivalent mass and volume units', () => {
  assert.match(
    getPackageSizeReviewWarning(
      'Aceitunas verdes descarozadas Nucete dp 220 grs',
      'Aceitunas Verdes Descarozadas X 90 Gr Nucete',
    ),
    /220 grs y el catálogo local 90 Gr/,
  )
  assert.match(
    getPackageSizeReviewWarning('Aceite de girasol 15 lt', 'Aceite de girasol 1.5 l'),
    /15 lt y el catálogo local 1\.5 l/,
  )
  assert.equal(getPackageSizeReviewWarning('Aceite de maíz 900 cc', 'Aceite de maíz 0,9 l'), null)
  assert.equal(getPackageSizeReviewWarning('Producto sin tamaño declarado', 'Otro producto sin tamaño'), null)
})

test('matches local products by unique exact Carrefour ID and GTIN, and detects conflicts', () => {
  const item = validateCarrefourManifestRow(validRow())
  const byGtin = { id: 1, source: 'disco', source_product_id: 'disco-1', ean: item.product.ean }
  assert.equal(findLocalMatch(item, [byGtin]).product, byGtin)
  assert.equal(findLocalMatch(item, [byGtin]).matchedBy, 'ean')

  const conflict = { id: 2, source: 'carrefour', source_product_id: item.product.sourceProductId, ean: '7791337007260' }
  assert.equal(findLocalMatch(item, [conflict]).ambiguous, true)
})
