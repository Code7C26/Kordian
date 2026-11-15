const test = require('node:test')
const assert = require('node:assert/strict')
const { auditProductIdentities, evaluateIdentityPair, extractAttributes, isValidGtin, validateNameCompatibility } = require('./productIdentityAudit')

const discoMilk = {
  id: 14617,
  source: 'disco',
  source_product_id: '331927',
  source_sku: '331085',
  ean: '7790742348302',
  name: 'Leche Entera 3% Sachet 1 Lts La Serenísima',
  image: 'https://example.com/disco-milk.jpg',
  category_id: 'dairy',
  categories: { name: 'Alimentos Frescos y Refrigerados' },
  subcategories: { name: 'Lácteos' },
  brands: { name: 'LA SERENISIMA' },
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
  category_id: 'dairy',
  categories: { name: 'Alimentos Frescos y Refrigerados' },
  subcategories: { name: 'Lácteos' },
  brands: { name: 'LA SERENÍSIMA' },
  offers: [{ supermarket: 'Mami', cash_price: 2035 }],
}

function makeMilk(overrides = {}) {
  return { ...mamiMilk, ...overrides }
}

test('audits the Serenisima sachet as a manual review candidate without merging', () => {
  const result = evaluateIdentityPair(discoMilk, mamiMilk)

  assert.equal(result.decision, 'review')
  assert.equal(result.automaticAction, 'none')
  assert.ok(result.matchedSignals.includes('brand'))
  assert.ok(result.matchedSignals.includes('measure'))
  assert.ok(result.matchedSignals.includes('fatPercent'))
  assert.ok(result.matchedSignals.includes('container'))
  assert.deepEqual(result.identifierNotes, [])
  assert.equal(result.products[0].offers[0].supermarket, 'Disco')
  assert.equal(result.products[1].offers[0].supermarket, 'Mami')
})

test('keeps powder, different package sizes, and different milk variants separate', () => {
  const powder = makeMilk({ name: 'Leche en polvo entera 3% La Serenisima 800 g' })
  const smaller = makeMilk({ name: 'Leche fresca entera 3% sachet 200 ml La Serenisima' })
  const skimmed = makeMilk({ name: 'Leche descremada sachet 1 L La Serenisima' })
  const regularPartiallySkimmed = {
    ...discoMilk,
    name: 'Leche Parcialmente descremada 1 Lts La Serenisima',
    ean: '7790742363206',
  }
  const chocolatePartiallySkimmed = makeMilk({
    name: 'LECHE LA SERENISIMA CHOCOLATADA PARCIALMENTE DESCREMADA LIBRE DE GLUTEN 1 LT.',
    source_sku: '7791337008403',
  })

  assert.equal(evaluateIdentityPair(discoMilk, powder).decision, 'separate')
  assert.equal(evaluateIdentityPair(discoMilk, smaller).decision, 'separate')
  assert.equal(evaluateIdentityPair(discoMilk, skimmed).decision, 'separate')
  assert.equal(evaluateIdentityPair(regularPartiallySkimmed, chocolatePartiallySkimmed).decision, 'separate')
})

test('recognizes valid GTINs but never performs an automatic merge', () => {
  assert.equal(isValidGtin('7790742348302'), true)
  assert.equal(isValidGtin('7790742448309'), true)
  const sameGtin = evaluateIdentityPair(discoMilk, makeMilk({ ean: '7790742348302', source_sku: 'prod3262766' }))
  assert.equal(sameGtin.decision, 'candidate')
  assert.equal(sameGtin.automaticAction, 'none')
})

test('never treats a source SKU as a cross-supermarket identifier', () => {
  const result = evaluateIdentityPair(discoMilk, makeMilk({ source_sku: '7790742348302' }))

  assert.equal(result.matchedSignals.includes('gtin'), false)
  assert.equal(result.matchedSignals.some((signal) => signal.includes('source_sku')), false)
  assert.deepEqual(result.identifierNotes, [])
  assert.equal(result.automaticAction, 'none')
})

test('classifies milk-flavored cookies as cookies rather than milk', () => {
  const discoCookies = {
    ...discoMilk,
    id: 14574,
    source: 'disco',
    name: 'Galletitas Donuts Leche 78g',
    source_sku: '3070233',
    ean: '7792360096818',
    brands: { name: 'DONUTS' },
  }
  const mamiCookies = {
    ...mamiMilk,
    id: 18194,
    source: 'mami',
    name: 'GALLETAS DONUTS LECHE X 78 GR.',
    source_sku: '7792360096818',
    ean: null,
    brands: { name: 'DONUTS' },
  }

  const result = evaluateIdentityPair(discoCookies, mamiCookies)
  assert.equal(result.products[0].attributes.family, 'cookies')
  assert.equal(result.products[1].attributes.family, 'cookies')
  assert.equal(result.decision, 'review')
})

test('classifies a milk-flavored alfajor as confectionery rather than milk', () => {
  const attributes = extractAttributes({
    name: 'Alfajor Milka Mousse Leche X 55 Gr.',
    brand: 'MILKA',
  })

  assert.equal(attributes.family, 'alfajor')
})

test('classifies baked goods with dulce de leche in the name as bakery', () => {
  const attributes = extractAttributes({
    name: 'Magdalenas Don Satur Vainilla Rellenas Dulce de Leche 220 Gr.',
    brand: 'DON SATUR',
  })

  assert.equal(attributes.family, 'bakery')
})

test('normalizes the grams abbreviation grs', () => {
  const attributes = extractAttributes({ name: 'Yogur griego 550 Grs' })
  assert.deepEqual(attributes.measure, {
    amount: 550,
    rawAmount: '550',
    unit: 'Grs',
    baseUnit: 'kg',
    normalizedAmount: 0.55,
  })
})

test('parses grouped thousands and decimal separators according to the measure unit', () => {
  const cases = [
    ['Agua 1.000 cc', 1000, '1.000', 'cc', 'l', 1],
    ['Agua 1,5 l', 1.5, '1,5', 'l', 'l', 1.5],
    ['Agua 1.5 l', 1.5, '1.5', 'l', 'l', 1.5],
    ['Agua 2.250 ml', 2250, '2.250', 'ml', 'l', 2.25],
    ['Agua 500 ml', 500, '500', 'ml', 'l', 0.5],
    ['Harina 1.000 g', 1000, '1.000', 'g', 'kg', 1],
    ['Harina 1,5 kg', 1.5, '1,5', 'kg', 'kg', 1.5],
    ['Harina 1.5 kg', 1.5, '1.5', 'kg', 'kg', 1.5],
    ['Agua 1000 cc', 1000, '1000', 'cc', 'l', 1],
    ['Agua 750 ml', 750, '750', 'ml', 'l', 0.75],
    ['Harina 1500 g', 1500, '1500', 'g', 'kg', 1.5],
    ['Harina 500 mg', 500, '500', 'mg', 'kg', 0.0005],
    ['Agua 25 cl', 25, '25', 'cl', 'l', 0.25],
    ['Harina 2 kg', 2, '2', 'kg', 'kg', 2],
    ['Agua 1.234,5 ml', 1234.5, '1.234,5', 'ml', 'l', 1.2345],
  ]

  for (const [name, amount, rawAmount, unit, baseUnit, normalizedAmount] of cases) {
    assert.deepEqual(extractAttributes({ name }).measure, {
      amount,
      rawAmount,
      unit,
      baseUnit,
      normalizedAmount,
    }, name)
  }
})

test('does not guess ambiguous or malformed measure separators', () => {
  for (const name of [
    'Producto 1.000 l',
    'Producto 1,000 kg',
    'Producto 1.2345 ml',
    'Producto 1.2.3 g',
    'Producto 12,34,567 g',
  ]) {
    assert.equal(extractAttributes({ name }).measure, null, name)
  }
})

test('keeps individual package content separate from pack count', () => {
  const pack = extractAttributes({ name: 'Leche Entera Pack x 4 unidades 250 ml' })
  const single = extractAttributes({ name: 'Leche Entera 1 l' })

  assert.equal(pack.measure.normalizedAmount, 0.25)
  assert.equal(pack.packCount, 4)
  assert.equal(single.measure.normalizedAmount, 1)
  assert.equal(single.packCount, 1)

  const comparison = evaluateIdentityPair(
    { ...discoMilk, name: 'Leche Entera Pack x 4 unidades 250 ml' },
    { ...mamiMilk, name: 'Leche Entera 1 l' },
  )
  assert.ok(comparison.conflicts.some((conflict) => conflict.field === 'measure'))
  assert.equal(comparison.decision, 'separate')
})

test('matches equivalent measures expressed in different volume units', () => {
  const oneLiterInCc = evaluateIdentityPair(
    { ...discoMilk, name: 'Leche Entera 1.000 cc La Serenisima' },
    { ...mamiMilk, name: 'Leche Entera 1 L La Serenisima' },
  )
  const twoPointTwoFiveLiters = evaluateIdentityPair(
    { ...discoMilk, name: 'Leche Entera 2.250 ml La Serenisima' },
    { ...mamiMilk, name: 'Leche Entera 2,25 l La Serenisima' },
  )

  assert.ok(oneLiterInCc.matchedSignals.includes('measure'))
  assert.ok(twoPointTwoFiveLiters.matchedSignals.includes('measure'))
})

test('detects yerba sold in tea bags', () => {
  const attributes = extractAttributes({
    name: 'Yerba Mate CBSe Pomelo, en saquitos x 24 u.',
    brand: 'CBSE',
  })

  assert.equal(attributes.productLine, 'tea_bags')
})

test('separates Magistral line and fragrance variants with the same capacity', () => {
  const ultraMarina = {
    ...mamiMilk,
    source: 'mami',
    source_sku: '7790990003121',
    name: 'DETERGENTE MAGISTRAL ULTRA MARINA BOTELLA X300 ML.',
    brands: { name: 'MAGISTRAL' },
  }
  const ultraLemon = {
    ...discoMilk,
    source: 'disco',
    ean: '7790990003022',
    name: 'Detergente para Lavavajillas Ultra Limón 300 Ml Magistral',
    brands: { name: 'MAGISTRAL' },
  }
  const discoUltraMarina = {
    ...discoMilk,
    source: 'disco',
    ean: '7790990003121',
    name: 'Detergente para Lavavajillas Ultra Marina 300 Ml Magistral',
    brands: { name: 'MAGISTRAL' },
  }
  const platinumLemon = {
    ...mamiMilk,
    source: 'mami',
    source_sku: '7790990003275',
    name: 'DETERGENTE MAGISTRAL PLATINUM PLUS LIMON BOTELLA X300 ML.',
    brands: { name: 'MAGISTRAL' },
  }

  const marinaAttributes = extractAttributes(ultraMarina)
  assert.equal(marinaAttributes.family, 'detergent')
  assert.equal(marinaAttributes.productLine, 'ultra')
  assert.equal(marinaAttributes.flavor, 'marine')
  const exactPair = evaluateIdentityPair(discoUltraMarina, ultraMarina)
  assert.equal(exactPair.decision, 'review')
  assert.equal(exactPair.matchedSignals.includes('gtin'), false)
  assert.equal(evaluateIdentityPair(ultraLemon, ultraMarina).decision, 'separate')
  assert.equal(evaluateIdentityPair(ultraLemon, platinumLemon).decision, 'separate')
})

test('separates CBSE yerba flavors at the same weight', () => {
  const guarana = {
    ...mamiMilk,
    source: 'mami',
    source_sku: '7790710334603',
    name: 'YERBA CBSE GUARANA X 500 GR.',
    brands: { name: 'CBSE' },
  }
  const lemon = {
    ...discoMilk,
    source: 'disco',
    ean: '7790710034312',
    name: 'Yerba Mate Cbse Saborizada Limon Paquete 500 G',
    brands: { name: 'CBSE' },
  }
  const guaranaAttributes = extractAttributes(guarana)

  assert.equal(guaranaAttributes.family, 'yerba_mate')
  assert.equal(guaranaAttributes.flavor, 'guarana')
  assert.equal(extractAttributes(lemon).flavor, 'lemon')
  assert.equal(evaluateIdentityPair(guarana, lemon).decision, 'separate')
})

test('separates yogurt flavors but keeps matching-GTIN line disagreements for review', () => {
  const bananaDrink = {
    ...discoMilk,
    source: 'disco',
    ean: '7793940340055',
    name: 'Yogur Entero Yogurisimo Bebible Banana 1 L',
    brands: { name: 'YOGURISIMO' },
  }
  const bananaCremix = {
    ...mamiMilk,
    source: 'mami',
    source_sku: 'mami-yogurt-banana-cremix',
    ean: '7793940340055',
    name: 'Yogur Yogurisimo Cremix Banana X 1 L',
    brands: { name: 'YOGURISIMO' },
  }
  const vanillaDrink = {
    ...bananaCremix,
    source_sku: 'mami-yogurt-vanilla',
    ean: null,
    name: 'Yogur Yogurisimo Bebible Vainilla X 1 L',
  }
  const bananaCremixResult = evaluateIdentityPair(bananaDrink, bananaCremix)

  assert.equal(extractAttributes(bananaCremix).productLine, 'cremix')
  assert.equal(extractAttributes(bananaDrink).style, 'drinkable')
  assert.equal(bananaCremixResult.decision, 'review')
  assert.equal(bananaCremixResult.matchedSignals.includes('gtin'), true)
  assert.ok(bananaCremixResult.uncertainSignals.includes('productLine'))
  assert.equal(evaluateIdentityPair(bananaDrink, vanillaDrink).decision, 'separate')
})

test('keeps Yogurísimo style disagreements in manual review when a GTIN matches', () => {
  const discoYogurt = {
    ...discoMilk,
    source: 'disco',
    source_sku: '3088366',
    ean: '7791337009943',
    name: 'Yogur Sabor Frutilla Griego 140 Grs Yogurisimo',
    brands: { name: 'YOGURISIMO' },
  }
  const mamiYogurt = {
    ...mamiMilk,
    source: 'mami',
    source_sku: 'mami-yogurt-140',
    ean: '7791337009943',
    name: 'YOGUR YOGURISIMO BATIDO FRUTILLA X 140G',
    brands: { name: 'YOGURISIMO' },
  }
  const result = evaluateIdentityPair(discoYogurt, mamiYogurt)

  assert.equal(result.products[0].attributes.style, 'greek')
  assert.equal(result.products[1].attributes.style, 'stirred')
  assert.ok(result.conflicts.some((conflict) => conflict.field === 'style'))
  assert.equal(result.decision, 'review')
  assert.equal(result.automaticAction, 'none')
})

test('validates generic names as weak compatibility and rejects shallow matches', () => {
  const genericA = {
    name: 'Yerba CBSE',
    brands: { name: 'CBSE' },
  }
  const genericB = {
    name: 'Yerba CBSE',
    brands: { name: 'CBSE' },
  }
  const specificA = {
    name: 'YERBA CBSE LIMON X 500 GR.',
    brands: { name: 'CBSE' },
  }
  const specificB = {
    name: 'Yerba Mate Cbse Saborizada Limon Paquete 500 G',
    brands: { name: 'CBSE' },
  }

  assert.equal(validateNameCompatibility(genericA, genericB).status, 'weak')
  assert.equal(validateNameCompatibility(specificA, specificB).status, 'strong')
})

test('audit only returns cross-source candidate pairs and leaves input unchanged', () => {
  const unrelatedBottle = {
    ...discoMilk,
    id: 14308,
    source_product_id: '300227',
    source_sku: '299445',
    ean: '7790742335500',
    name: 'Leche La Serenisima Entera Bot 1l',
    offers: [{ supermarket: 'Disco', cash_price: 3100 }],
  }
  const products = [discoMilk, mamiMilk, unrelatedBottle]
  const original = structuredClone(products)
  const report = auditProductIdentities(products, { includePairIds: [14617, 20871] })

  assert.equal(report.summary.scannedProducts, 3)
  assert.equal(report.summary.candidatePairs, 1)
  assert.equal(report.summary.automaticMerges, 0)
  assert.deepEqual(products, original)
})

test('reports products that have multiple possible cross-source matches', () => {
  const otherDiscoMilk = {
    ...discoMilk,
    id: 14618,
    ean: '7790742363206',
    name: 'Leche Entera 1 L La Serenisima',
  }
  const report = auditProductIdentities([discoMilk, otherDiscoMilk, mamiMilk])

  assert.equal(report.summary.ambiguousProductCount, 1)
  assert.equal(report.summary.ambiguousProductSamples[0].id, 20871)
  assert.equal(report.summary.ambiguousProductSamples[0].candidateCount, 2)
})

test('prefers one reciprocal GTIN match while keeping weaker alternatives visible', () => {
  const exactMamiMatch = makeMilk({ ean: '7790742348302' })
  const otherDiscoMilk = {
    ...discoMilk,
    id: 14618,
    ean: '7790742335500',
    name: 'Leche La Serenisima Entera 1 L Sachet',
  }
  const report = auditProductIdentities([discoMilk, exactMamiMatch, otherDiscoMilk])
  const preferred = report.candidates.find((candidate) => candidate.products.some((product) => String(product.id) === '14617'))
  const alternative = report.candidates.find((candidate) => candidate.products.some((product) => String(product.id) === '14618'))

  assert.equal(preferred.evidenceTier, 'unique_identifier_match')
  assert.equal(alternative.evidenceTier, 'alternative_to_identifier_match')
  assert.equal(report.summary.identifierResolvedAmbiguousProductCount, 1)
  assert.equal(report.summary.unresolvedAmbiguousProductCount, 0)
  assert.equal(report.summary.automaticMerges, 0)
})