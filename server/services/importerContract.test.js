const assert = require('node:assert/strict')
const { createCommonProduct, getCommonInvalidReason, validateImporterContract, isValidCommonProduct, compareSimulationReport, buildTaxonomyComparison } = require('./importerContract')
const { createImporterContract } = require('./importerContract')

const mamiContract = require('./mamiImporter')

async function run() {
  const product = createCommonProduct({
    sourceProductId: 'mami-1',
    productName: 'Galletitas Dulce 12 unidades',
    brand: 'Mami',
    image: '',
    price: 240,
    available: true,
    sourceCategory: 'Almacén y Alimentos',
    sourceCategories: ['Almacén y Alimentos'],
    seller: 'Mami',
  }, 'mami')

  assert.equal(product.source, 'mami')
  assert.equal(product.name, 'Galletitas Dulce 12 unidades')
  assert.equal(product.price, 240)
  assert.equal(product.available, true)
  assert.equal(product.sourceCategory, 'Almacén y Alimentos')
  assert.equal(isValidCommonProduct(product), true)
  assert.equal(getCommonInvalidReason(product), null)

  const validation = validateImporterContract(mamiContract)
  assert.equal(validation.valid, true)
  assert.equal(validation.source, 'mami')
  assert.equal(Array.isArray(validation.missingFields), true)

  const genericContract = createImporterContract({
    source: 'mami',
    normalizeProduct: (item = {}) => createCommonProduct(item, 'mami'),
    getInvalidReason: getCommonInvalidReason,
    isValidProduct: isValidCommonProduct,
    fetchPreview: async () => ({ products: [], discarded: [] }),
    fetchProductById: async () => null,
    findMatches: (previewProducts, localProducts = []) => previewProducts.map((product) => ({
      ...product,
      possibleDuplicate: false,
    })),
  })

  const genericValidation = validateImporterContract(genericContract)
  assert.equal(genericValidation.valid, true)

  const report = compareSimulationReport(
    {
      source: 'mami',
      isValidProduct: isValidCommonProduct,
      findMatches: () => [],
    },
    { products: [createCommonProduct({
      sourceProductId: 'mami-1',
      productName: 'Galletitas Mami Dulce de Leche 12 unidades',
      brand: 'Mami',
      image: '',
      price: 240,
      available: true,
      sourceCategory: 'Almacén y Alimentos',
      sourceCategories: ['Almacén y Alimentos'],
      seller: 'Mami',
    }, 'mami')], discarded: [] },
    []
  )
  assert.equal(report.dryRun, true)
  assert.equal(report.writeSafety.productWritesAllowed, false)
  assert.equal(report.writeSafety.priceHistoryWritesAllowed, false)
  assert.equal(report.writeSafety.mutationSurface, 'preview_only')
  assert.equal(Array.isArray(report.priceComparison), true)
  assert.equal(report.productCount, 1)

  const referenceReport = compareSimulationReport(
    {
      source: 'mami',
      isValidProduct: isValidCommonProduct,
      findMatches: () => [],
    },
    { products: [createCommonProduct({
      sourceProductId: 'prod2850705',
      productName: 'CREMA DENTAL COLGATE TRIPLE ACCION EXTRA BLANCURA X 90GR.',
      brand: 'COLGATE',
      image: 'https://statics.dinoonline.com.ar/imagenes/large_460x460/2850705_l.jpg',
      price: 3350,
      available: true,
      sourceCategory: 'Crema dental',
      sourceCategories: ['Crema dental'],
      seller: 'Mami',
    }, 'mami')], discarded: [] },
    [{
      source_product_id: 'prod2850705',
      ean: null,
      offers: [{ supermarket: 'Mami', cash_price: 3000 }],
    }]
  )
  assert.equal(referenceReport.priceComparison.length, 1)
  assert.equal(referenceReport.priceComparison[0].hasLocalReference, true)
  assert.equal(referenceReport.priceComparison[0].referenceMatchedBy, 'source_product_id')
  assert.equal(referenceReport.priceComparison[0].localPrice, 3000)
  assert.equal(referenceReport.priceComparison[0].sourcePrice, 3350)
  assert.equal(referenceReport.priceComparison[0].deltaPercent > 0, true)

  const htmlFeed = `<script type="application/ld+json">{"@type":"Product","name":"Yogur Bebible","brand":{"name":"Mami"},"offers":{"price":120,"availability":"https://schema.org/InStock"},"url":"http://www.supermami.com.ar/super/producto/yogur-bebible/_/A-1234-1234-s","image":"https://statics.dinoonline.com.ar/imagenes/large_460x460/1234_l.jpg","sku":"7500000000001","gtin13":"7500000000001","category":"Lácteos","itemCategory":"Lácteos"}</script><title>Yogur Bebible | Super MaMi</title><script>productId = "prod1234"</script>`
  const parsed = typeof mamiContract.extractMamiDetailProductsFromHtml === 'function'
    ? mamiContract.extractMamiDetailProductsFromHtml(htmlFeed)
    : []
  assert.equal(Array.isArray(parsed), true)
  assert.equal(parsed.length >= 1, true)
  assert.equal(Boolean(parsed[0]?.name), true)
  assert.equal(Boolean(parsed[0]?.brand), true)
  assert.equal(Number(parsed[0]?.price) > 0, true)
  assert.equal(Boolean(parsed[0]?.sourceCategory), true)
  assert.equal(String(parsed[0]?.sourceUrl || '').startsWith('https://www.supermami.com.ar/'), true)
  assert.equal(Boolean(parsed[0]?.image), true)
  assert.equal(Boolean(parsed[0]?.ean || parsed[0]?.sourceSku), true)

  const mamiPreview = mamiContract.fetchPreview ? await mamiContract.fetchPreview({ query: '', from: 0, to: 2 }) : { products: [], discarded: [] }
  assert.equal(Array.isArray(mamiPreview.products), true)
  assert.equal(Array.isArray(mamiPreview.discarded), true)
  assert.equal(Boolean(mamiPreview.sourceRead), true)
  assert.equal(mamiPreview.sourceRead.mode, 'html_category_shell_fallback')
  assert.equal(mamiPreview.sourceRead.sampleUsed, false)
  assert.equal(String(mamiPreview.sourceRead.scope), 'html_home_category_shell_only')
  assert.equal(String(mamiPreview.sourceRead.payloadType), 'json_ld_found')
  assert.equal(Number(mamiPreview.sourceRead.detailJsonLdProductCount) >= 1, true)
  assert.equal(mamiPreview.sourceRead.detailProfileHint && mamiPreview.sourceRead.detailProfileHint.source, 'mami')
  assert.equal(mamiPreview.sourceRead.productRouteCount, mamiPreview.sourceRead.productRoutes.length)
  assert.equal(mamiPreview.sourceRead.categoryRouteCount, mamiPreview.sourceRead.categoryRoutes.length)
  assert.equal(mamiPreview.products.length >= 0, true)
  assert.equal(mamiPreview.discarded.length >= 0, true)

  const localCategories = [{ id: '1', name: 'Almacén y Alimentos' }]
  const localSubcategories = [{ id: '10', category_id: '1', name: 'Golosinas y snacks' }, { id: '11', category_id: '1', name: 'Bebidas' }, { id: '12', category_id: '1', name: 'Panificados' }]
  const taxonomyComparison = mamiPreview.products.slice(0, 2).map((product) => ({
    ...buildTaxonomyComparison(product, localCategories, localSubcategories),
    sourceProductId: product.sourceProductId,
    name: product.name,
  }))
  assert.equal(Array.isArray(taxonomyComparison), true)
  assert.equal(taxonomyComparison.length, 2)
  assert.equal(taxonomyComparison[0].sourceCategory && taxonomyComparison[0].sourceCategory.length >= 1, true)

  const preflightReference = compareSimulationReport(
    {
      source: 'mami',
      isValidProduct: isValidCommonProduct,
      findMatches: () => [],
    },
    { products: mamiPreview.products.slice(0, 2), discarded: [] },
    [{
      source_product_id: 'prod2850705',
      ean: null,
      offers: [{ supermarket: 'Mami', cash_price: 3000 }],
    }]
  )
  assert.equal(preflightReference.dryRun, true)
  assert.equal(preflightReference.writeSafety.productWritesAllowed, false)
  assert.equal(preflightReference.writeSafety.priceHistoryWritesAllowed, false)
  assert.equal(preflightReference.priceComparison.length, 2)

  for (const product of mamiPreview.products) {
    assert.equal(Boolean(product.sourceProductId), true)
    assert.equal(Boolean(product.name && product.name.trim()), true)
    assert.equal(product.price > 0, true)
    assert.equal(isValidCommonProduct(product), true)
    assert.equal(Boolean(product.sourceCategory || (Array.isArray(product.sourceCategories) && product.sourceCategories.length > 0)), true)
    assert.equal(product.sourceUrl ? String(product.sourceUrl).startsWith('https://www.supermami.com.ar/') : true, true)
  }

  console.log('importer contract test passed')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
