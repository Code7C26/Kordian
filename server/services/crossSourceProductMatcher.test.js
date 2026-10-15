const test = require('node:test')
const assert = require('node:assert/strict')
const { auditCrossSourceProducts, matchCrossSourcePair } = require('./crossSourceProductMatcher')

const discoMilk = {
  id: 14617,
  source: 'disco',
  source_product_id: '331927',
  source_sku: '331085',
  ean: '7790742348302',
  name: 'Leche Entera 3% Sachet 1 Lts La Serenísima',
  image: 'https://example.com/disco-milk.jpg',
  brands: { name: 'LA SERENISIMA' },
  categories: { name: 'Alimentos Frescos y Refrigerados' },
  subcategories: { name: 'Lácteos' },
  offers: [{ supermarket: 'Disco', cash_price: 2050 }],
}

const mamiMilk = {
  id: 20871,
  source: 'mami',
  source_product_id: 'prod3262766',
  source_sku: '7790742448309',
  ean: null,
  name: 'LECHE LA SERENISIMA FRESCA ENTERA CLASICA 3% GRASA SACHET X 1 LT.',
  image: 'https://example.com/mami-milk.jpg',
  brands: { name: 'LA SERENÍSIMA' },
  categories: { name: 'Alimentos Frescos y Refrigerados' },
  subcategories: { name: 'Lácteos' },
  offers: [{ supermarket: 'Mami', cash_price: 2035 }],
}

test('returns the real Serenisima pair for manual review with normalized attributes', () => {
  const result = matchCrossSourcePair(mamiMilk, discoMilk)

  assert.equal(result.status, 'revisión')
  assert.equal(result.automaticGroupingAllowed, false)
  assert.ok(result.matchedAttributes.includes('family'))
  assert.ok(result.matchedAttributes.includes('brand'))
  assert.ok(result.matchedAttributes.includes('measure'))
  assert.ok(result.matchedAttributes.includes('variant.form'))
  assert.ok(result.matchedAttributes.includes('variant.fatClass'))
  assert.ok(result.matchedAttributes.includes('format.container'))
  assert.ok(result.matchedAttributes.includes('format.packCount'))
  assert.equal(result.priceSignal.mamiPrice, 2035)
  assert.equal(result.priceSignal.discoPrice, 2050)
  assert.equal(result.priceSignal.suspicious, false)
})

test('returns match only for matching declared GTIN and compatible attributes', () => {
  const sameGtinMamiMilk = { ...mamiMilk, ean: discoMilk.ean, source_sku: 'prod3262766' }
  const result = matchCrossSourcePair(sameGtinMamiMilk, discoMilk)

  assert.equal(result.status, 'match')
  assert.equal(result.confidence, 'alta')
  assert.deepEqual(result.reasonCodes, ['exact_valid_gtin'])
})

test('returns no_match for different product family, quantity, or flavor', () => {
  const halfLiter = { ...mamiMilk, name: 'Leche Entera 3% Sachet 500 Ml La Serenisima' }
  const chocolate = { ...mamiMilk, name: 'Leche chocolatada 1 L La Serenisima' }
  const yogurt = { ...mamiMilk, name: 'Yogur natural entero 1 L La Serenisima' }

  assert.equal(matchCrossSourcePair(halfLiter, discoMilk).status, 'no_match')
  assert.equal(matchCrossSourcePair(chocolate, discoMilk).status, 'no_match')
  assert.equal(matchCrossSourcePair(yogurt, discoMilk).status, 'no_match')
})

test('returns review when an additional feature is present on only one source', () => {
  const fortifiedMami = { ...mamiMilk, name: 'Leche Entera 3% con calcio sachet 1 L La Serenisima' }
  const result = matchCrossSourcePair(fortifiedMami, discoMilk)

  assert.equal(result.status, 'revisión')
  assert.ok(result.reasonCodes.includes('additional_features_differ'))
  assert.equal(result.automaticGroupingAllowed, false)
})

test('price difference is secondary and never changes a match decision', () => {
  const highPriceMami = {
    ...mamiMilk,
    ean: discoMilk.ean,
    source_sku: 'prod3262766',
    offers: [{ supermarket: 'Mami', cash_price: 16000 }],
  }
  const result = matchCrossSourcePair(highPriceMami, discoMilk)

  assert.equal(result.status, 'match')
  assert.equal(result.priceSignal.suspicious, true)
  assert.ok(result.reasonCodes.includes('price_difference_suspicious'))
})

test('downgrades a match that would repeat the same supermarket', () => {
  const mamiOfferAtDisco = { ...mamiMilk, ean: discoMilk.ean, offers: [{ supermarket: 'Disco', cash_price: 2035 }] }
  const result = matchCrossSourcePair(mamiOfferAtDisco, discoMilk)

  assert.equal(result.status, 'revisión')
  assert.deepEqual(result.storeConstraint.repeatedSupermarkets, ['Disco'])
})

test('audit service creates no database mutations and reports all three states', () => {
  const match = { ...mamiMilk, ean: discoMilk.ean, source_sku: 'prod3262766' }
  const review = mamiMilk
  const noMatch = { ...mamiMilk, name: 'Leche descremada sachet 1 L La Serenisima' }
  const report = auditCrossSourceProducts([match, review, noMatch], [discoMilk])

  assert.ok(report.summary.statusCounts.match >= 1)
  assert.ok(report.summary.statusCounts['revisión'] >= 1)
  assert.ok(report.summary.statusCounts.no_match >= 1)
  assert.equal(report.writeSafety.databaseWrites, false)
  assert.equal(report.summary.automaticGroupsCreated, 0)
})

test('does not create review pairs from only a generic product word and the brand', () => {
  const genericMami = {
    ...mamiMilk,
    name: 'YERBA CBSE LIMON X 500 GR.',
    brands: { name: 'CBSE' },
    source_sku: 'mami-yerba-lemon',
  }
  const genericDisco = {
    ...discoMilk,
    name: 'Yerba Cbse',
    brands: { name: 'CBSE' },
    ean: null,
  }
  const report = auditCrossSourceProducts([genericMami], [genericDisco])

  assert.equal(report.summary.pairsCompared, 0)
  assert.equal(report.summary.automaticGroupsCreated, 0)
})

test('marks a one-sided product line as review instead of a definite mismatch', () => {
  const mamiYerba = {
    ...mamiMilk,
    name: 'YERBA CBSE LIMON X 500 GR.',
    brands: { name: 'CBSE' },
    source_sku: 'mami-yerba-lemon',
  }
  const discoFlavoredYerba = {
    ...discoMilk,
    name: 'Yerba Mate Cbse Saborizada Limon Paquete 500 G',
    brands: { name: 'CBSE' },
    ean: null,
  }
  const result = matchCrossSourcePair(mamiYerba, discoFlavoredYerba)

  assert.equal(result.status, 'revisión')
  assert.ok(result.uncertainAttributes.some((attribute) => attribute.field === 'variant.productLine'))
  assert.equal(result.mismatchedAttributes.some((attribute) => attribute.field === 'variant.productLine'), false)
})