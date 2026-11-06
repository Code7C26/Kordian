const assert = require('node:assert/strict')
const test = require('node:test')
const { classifyCarrefourProduct } = require('./carrefourMatchCandidates')
const { isValidGtin } = require('./productIdentityAudit')

const sourceProduct = {
  source: 'carrefour',
  sourceProductId: '680457',
  sourceSku: '52798',
  ean: '7790742348302',
  name: 'Leche Entera 3% Sachet La Serenisima 1 L',
  brand: 'La Serenisima',
  presentation: '1 L',
  price: 2500,
}

function localProduct(overrides = {}) {
  return {
    id: 100,
    source: 'disco',
    source_product_id: 'disco-100',
    source_sku: 'local-sku-100',
    ean: sourceProduct.ean,
    name: 'Leche Entera 3% Sachet La Serenisima 1 L',
    brands: { name: 'LA SERENISIMA' },
    offers: [{ supermarket: 'Disco', cash_price: 2400 }],
    ...overrides,
  }
}

function gtinFromPrefix(prefix) {
  const digits = [...prefix].map(Number)
  let sum = 0
  for (let index = digits.length - 1, weight = 3; index >= 0; index -= 1, weight = weight === 3 ? 1 : 3) {
    sum += digits[index] * weight
  }
  return `${prefix}${(10 - (sum % 10)) % 10}`
}

test('marks exact GTIN and compatible presentation as exact without creating an association', () => {
  const report = classifyCarrefourProduct(sourceProduct, [localProduct()])

  assert.equal(report.classification, 'MATCH_EXACTO')
  assert.equal(report.candidates[0].status, 'MATCH_EXACTO')
  assert.equal(report.candidates[0].hasComparableOffer, true)
  assert.deepEqual(report.writeSafety, {
    associationsCreated: false,
    productsMutated: false,
    offersMutated: false,
  })
})

test('keeps a similar product with a different valid GTIN in manual review', () => {
  const report = classifyCarrefourProduct(sourceProduct, [
    localProduct({ ean: '7790742448309' }),
  ])

  assert.equal(report.classification, 'MATCH_REVISAR')
  assert.ok(report.candidates[0].reasons.includes('GTIN_CONTRADICTORIO'))
})

test('reports incompatible net content instead of treating the item as a match', () => {
  const report = classifyCarrefourProduct(sourceProduct, [
    localProduct({ name: 'Leche Entera 3% Sachet La Serenisima 500 Ml' }),
  ])

  assert.equal(report.classification, 'MATCH_REVISAR')
  assert.ok(report.candidates[0].reasons.includes('PRESENTACION_INCOMPATIBLE'))
})

test('reports incompatible flavors even when brand and package size match', () => {
  const yerba = {
    source: 'carrefour',
    sourceProductId: 'yerba-1',
    name: 'Yerba Mate CBSe Guarana 500 g',
    brand: 'CBSe',
    ean: '7790710334603',
  }
  const report = classifyCarrefourProduct(yerba, [{
    id: 101,
    source: 'mami',
    ean: '7790710034312',
    name: 'Yerba Mate CBSe Saborizada Limon 500 g',
    brands: { name: 'CBSe' },
    offers: [{ supermarket: 'Mami', cash_price: 2100 }],
  }])

  assert.equal(report.classification, 'MATCH_REVISAR')
  assert.ok(report.candidates[0].reasons.includes('VARIANTE_INCOMPATIBLE'))
})

test('does not auto-accept a same-GTIN candidate with a different brand', () => {
  const report = classifyCarrefourProduct(sourceProduct, [
    localProduct({ brands: { name: 'Otra Marca' } }),
  ])

  assert.equal(report.classification, 'MATCH_REVISAR')
  assert.ok(report.candidates[0].reasons.includes('MARCA_DIFERENTE'))
})

test('finds an attribute-based review candidate when GTIN is missing', () => {
  const report = classifyCarrefourProduct({ ...sourceProduct, ean: '' }, [
    localProduct({ ean: null }),
  ])

  assert.equal(report.classification, 'MATCH_REVISAR')
  assert.ok(report.candidates[0].reasons.includes('GTIN_INCOMPLETO'))
})

test('validates GTIN lengths 8, 12, 13, and 14 while preserving leading zeroes', () => {
  const gtins = [
    gtinFromPrefix('0000001'),
    gtinFromPrefix('00000000001'),
    gtinFromPrefix('000000000001'),
    gtinFromPrefix('0000000000001'),
  ]
  assert.deepEqual(gtins.map((gtin) => gtin.length), [8, 12, 13, 14])
  for (const gtin of gtins) {
    assert.equal(isValidGtin(gtin), true)
    const report = classifyCarrefourProduct({ ...sourceProduct, ean: gtin }, [
      localProduct({ ean: gtin }),
    ])
    assert.equal(report.candidates[0].gtin, gtin)
    assert.equal(report.candidates[0].status, 'MATCH_EXACTO')
  }
})

test('flags two equally ranked candidates as ambiguous', () => {
  const report = classifyCarrefourProduct(sourceProduct, [
    localProduct({ id: 101 }),
    localProduct({ id: 102 }),
  ])

  assert.equal(report.ambiguous, true)
  assert.equal(report.classification, 'MATCH_REVISAR')
  assert.equal(report.candidateCount, 2)
})

test('records SIN_CANDIDATOS when no local identity candidate exists', () => {
  const report = classifyCarrefourProduct(sourceProduct, [])

  assert.equal(report.classification, 'SIN_REFERENCIA')
  assert.equal(report.candidateSearchResult, 'SIN_CANDIDATOS')
})

test('reports insufficient data rather than inferring a reference', () => {
  const report = classifyCarrefourProduct({
    sourceProductId: 'incomplete',
    name: '',
    brand: '',
    ean: '',
  }, [])

  assert.equal(report.classification, 'DATOS_INSUFICIENTES')
  assert.ok(report.reasons.includes('FALTAN_ATRIBUTOS_ESENCIALES'))
})

test('an exact identity without another supermarket offer is still SIN_REFERENCIA', () => {
  const report = classifyCarrefourProduct(sourceProduct, [
    localProduct({ offers: [{ supermarket: 'Carrefour', cash_price: 2400 }] }),
  ])

  assert.equal(report.classification, 'SIN_REFERENCIA')
  assert.equal(report.candidates[0].status, 'MATCH_EXACTO')
  assert.equal(report.candidates[0].hasComparableOffer, false)
  assert.ok(report.reasons.includes('PRODUCTO_EXISTENTE_SIN_OFERTA_COMPARABLE'))
})
