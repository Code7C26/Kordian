const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  buildDiscoProductTaxonomyFields,
  createDiscoPromotionFetcher,
  fetchDiscoProductById,
  fetchDiscoPreviewReport,
  getDiscoProductClassification,
  normalizeDiscoHtmlProduct,
  normalizeDiscoProduct,
  parseDiscoPromotionFromHtml,
  suggestDiscoCatalogMapping,
} = require('./discoImporter')
const {
  buildCatalogTaxonomyExamples,
  suggestCatalogMapping,
} = require('./catalogTaxonomy')

const promotionHtml = (overrides = {}) => `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Product',
  ean: '7896004009162',
  name: 'Papas Pringles Crema y Cebolla 109 g',
  offers: {
    '@type': 'Offer',
    price: 3300,
    priceCurrency: 'ARS',
    priceValidUntil: '2026-11-03',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      priceType: 'https://schema.org/ListPrice',
      price: 6600,
    },
  },
  ...overrides,
})}</script>`

function priceToken(price) {
  const payload = Buffer.from(JSON.stringify({ data: { price } })).toString('base64url')
  return `header.${payload}.signature`
}

function productWithPrice({ name, price, tokenPrice }) {
  return normalizeDiscoProduct({
    productId: 'disco-1',
    productName: name,
    brand: 'Disco',
    categories: ['Electrodomésticos'],
    items: [{
      itemId: 'sku-1',
      ean: '7790000000001',
      sellers: [{
        sellerName: 'Disco',
        commertialOffer: {
          IsAvailable: true,
          Price: price,
          PriceToken: priceToken(tokenPrice),
          ListPrice: price,
          AvailableQuantity: 1,
        },
      }],
    }],
  })
}

test('fetches current Disco identity and stock by product ID with a bounded request timeout', async () => {
  const originalFetch = global.fetch
  let requestedUrl
  global.fetch = async (url, options) => {
    requestedUrl = new URL(String(url))
    assert.ok(options.signal)
    return new Response(JSON.stringify([{
      productId: 'source-1',
      productName: 'Producto Disco',
      items: [{
        itemId: 'sku-1',
        ean: '7790000000001',
        sellers: [{
          sellerName: 'Disco',
          commertialOffer: { IsAvailable: true, Price: 100, ListPrice: 120, AvailableQuantity: 3 },
        }],
      }],
    }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const product = await fetchDiscoProductById('source-1')
    assert.equal(requestedUrl.searchParams.get('fq'), 'productId:source-1')
    assert.equal(product.sourceProductId, 'source-1')
    assert.equal(product.ean, '7790000000001')
    assert.equal(product.price, 100)
    assert.equal(product.available, true)
    assert.equal(product.stock, 3)
  } finally {
    global.fetch = originalFetch
  }
})

test('rejects an implausible list price and reports the source field', () => {
  const product = normalizeDiscoProduct({
    productId: 'disco-extreme-list-price',
    productName: 'Alfajor Negro 45 Grs Entre Dos',
    categories: ['/Almacén/Golosinas/'],
    items: [{
      itemId: 'sku-extreme-list-price',
      ean: '763571682326',
      sellers: [{
        sellerName: 'Disco Argentina',
        commertialOffer: {
          IsAvailable: true,
          Price: 1050,
          PriceWithoutDiscount: 1050,
          ListPrice: 86777,
          AvailableQuantity: 3,
        },
      }],
    }],
  })

  assert.equal(product.price, 1050)
  assert.equal(product.listPrice, 0)
  assert.deepEqual(product.listPriceWarning, {
    reason: 'list_price_ratio_exceeds_limit',
    cashPrice: 1050,
    maximumRatio: 10,
    rejectedPrices: [{ field: 'ListPrice', value: 86777, ratio: 82.64 }],
  })
})

test('uses a plausible PriceWithoutDiscount when the published ListPrice is anomalous', () => {
  const product = normalizeDiscoProduct({
    productId: 'disco-fallback-list-price',
    productName: 'Producto en promoción',
    categories: ['/Almacén/'],
    items: [{
      itemId: 'sku-fallback-list-price',
      ean: '7791234567898',
      sellers: [{
        sellerName: 'Disco Argentina',
        commertialOffer: {
          IsAvailable: true,
          Price: 100,
          PriceWithoutDiscount: 120,
          ListPrice: 86777,
          AvailableQuantity: 1,
        },
      }],
    }],
  })

  assert.equal(product.listPrice, 120)
  assert.equal(product.listPriceWarning.rejectedPrices[0].field, 'ListPrice')
})

test('uses VTEX Price instead of a token 100 times higher for a durable product', () => {
  const product = productWithPrice({
    name: 'Heladera No Frost 300 L',
    price: 8613,
    tokenPrice: 861300,
  })

  assert.equal(product.price, 8613)
})

test('uses the raw Disco price when PriceToken stores the value at 100x scale', () => {
  const product = productWithPrice({
    name: 'Bolsas Para Horno Mostaza Y Miel 30 Grs Alicante',
    price: 2700,
    tokenPrice: 270000,
  })

  assert.equal(product.price, 2700)
})

test('uses the raw VTEX price when the token is expressed in a different unit', () => {
  const product = productWithPrice({
    name: 'Gaseosa Cola 1.25 L',
    price: 86.13,
    tokenPrice: 8613,
  })

  assert.equal(product.price, 86.13)
})

test('does not convert a fractional VTEX price using the integer PriceToken', () => {
  const product = productWithPrice({
    name: 'Detergente Lavavajilla Querubin X 750 Ml.',
    price: 0.72,
    tokenPrice: 72,
  })

  assert.equal(product.price, 0.72)
})

test('does not apply the durable-product multiplier to ordinary raw prices', () => {
  const product = productWithPrice({
    name: 'Microondas 20 L',
    price: 861.3,
    tokenPrice: 86130,
  })

  test('checks a shared Disco image once when previewing multiple products', async () => {
    const originalFetch = global.fetch
    const image = 'https://example.com/yogur-product.jpg'
    const products = ['disco-1', 'disco-2'].map((productId) => ({
      productId,
      productName: 'Yogur natural 500 g',
      brand: 'Marca',
      categories: ['/Almacén/'],
      items: [{
        itemId: `${productId}-sku`,
        ean: '7790000000001',
        images: [{ imageUrl: image }],
        sellers: [{
          sellerName: 'Disco',
          commertialOffer: { IsAvailable: true, Price: 100, ListPrice: 100, AvailableQuantity: 1 },
        }],
      }],
    }))
    let imageChecks = 0
    global.fetch = async (url, options = {}) => {
      if (options.method === 'HEAD') {
        imageChecks += 1
        return new Response(null, { status: 200, headers: { 'content-length': '200' } })
      }
      return new Response(JSON.stringify(products), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    try {
      const report = await fetchDiscoPreviewReport({ from: 0, to: 1 })
      assert.equal(report.products.length, 2)
      assert.equal(report.products[0].image, image)
      assert.equal(imageChecks, 1)
    } finally {
      global.fetch = originalFetch
    }
  })

  assert.equal(product.price, 861.3)
})

test('bounds concurrent Disco image checks while preserving every result', async () => {
  const originalFetch = global.fetch
  let activeImageChecks = 0
  let maxActiveImageChecks = 0
  const products = Array.from({ length: 9 }, (_, index) => ({
    productId: `disco-${index + 1}`,
    productName: 'Yogur natural 500 g',
    brand: 'Marca',
    categories: ['/Almacén/'],
    items: [{
      itemId: `disco-${index + 1}-sku`,
      ean: '7790000000001',
      images: [{ imageUrl: `https://example.com/yogur-${index + 1}.jpg` }],
      sellers: [{
        sellerName: 'Disco',
        commertialOffer: { IsAvailable: true, Price: 100, ListPrice: 100, AvailableQuantity: 1 },
      }],
    }],
  }))
  global.fetch = async (_url, options = {}) => {
    if (options.method === 'HEAD') {
      activeImageChecks += 1
      maxActiveImageChecks = Math.max(maxActiveImageChecks, activeImageChecks)
      await new Promise((resolve) => setTimeout(resolve, 5))
      activeImageChecks -= 1
      return new Response(null, { status: 200, headers: { 'content-length': '200' } })
    }
    return new Response(JSON.stringify(products), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const report = await fetchDiscoPreviewReport({ from: 0, to: products.length - 1 })
    assert.equal(report.products.length, products.length)
    assert.equal(maxActiveImageChecks, 8)
  } finally {
    global.fetch = originalFetch
  }
})

test('uses the raw price when a product price token is 100 times higher', () => {
  const product = productWithPrice({
    name: 'Yogur Yogs Bebible Entero Banana 900g',
    price: 905.19,
    tokenPrice: 90519,
  })

  assert.equal(product.price, 905.19)
})

test('distinguishes Disco infusion products from mate and coffee accessories', () => {
  const cases = [
    ['Yerba mate', 'Almacén y Alimentos', 'Infusiones'],
    ['Té en saquitos', 'Almacén y Alimentos', 'Infusiones'],
    ['Café molido', 'Almacén y Alimentos', 'Infusiones'],
    ['Café tostado molido 500 Grs Super Cabrales', 'Almacén y Alimentos', 'Infusiones'],
    ['Café en grano', 'Almacén y Alimentos', 'Infusiones'],
    ['Café instantáneo', 'Almacén y Alimentos', 'Infusiones'],
    ['Mate cocido', 'Almacén y Alimentos', 'Infusiones'],
    ['Mate', 'Hogar y Otros', 'Cocina y bazar'],
    ['Mate de acero inoxidable', 'Hogar y Otros', 'Cocina y bazar'],
    ['Bombilla de acero inoxidable', 'Hogar y Otros', 'Cocina y bazar'],
    ['Yerbera', 'Hogar y Otros', 'Cocina y bazar'],
    ['Azucarera', 'Hogar y Otros', 'Cocina y bazar'],
    ['Filtro de café reutilizable', 'Hogar y Otros', 'Cocina y bazar'],
    ['Canister de cocina', 'Hogar y Otros', 'Cocina y bazar'],
    ['Recipiente para yerba', 'Hogar y Otros', 'Cocina y bazar'],
    ['Portayerba', 'Hogar y Otros', 'Cocina y bazar'],
    ['Filtro De Papel Para Café Nº 2 X 30 U Domestic', 'Hogar y Otros', 'Cocina y bazar'],
  ]

  for (const [name, category, subcategory] of cases) {
    const suggestion = suggestDiscoCatalogMapping({
      name,
      sourceCategory: '/Hogar y textil/',
    })
    assert.equal(suggestion.status, 'determined', JSON.stringify({ name, suggestion }))
    assert.equal(suggestion.category, category)
    assert.equal(suggestion.subcategory, subcategory)
  }

  for (const name of [
    'Café',
    'Producto para mate',
    'Accesorio para café',
    'Accesorios para preparar café',
    'Accesorios para servir mate',
    'Botella Mate Naranja Hydrum',
  ]) {
    const suggestion = suggestDiscoCatalogMapping({
      name,
      sourceCategory: '/Hogar y textil/',
      sourceCategories: ['/Hogar y textil/'],
    })
    assert.notEqual(suggestion.subcategory, 'Infusiones', JSON.stringify({ name, suggestion }))
    assert.notEqual(suggestion.subcategory, 'Cocina y bazar', JSON.stringify({ name, suggestion }))
    assert.ok(
      ['insufficient_evidence', 'ambiguous'].includes(suggestion.status),
      JSON.stringify({ name, suggestion }),
    )
    assert.equal(suggestion.confidence, 'low')
  }

  const mixedProduct = suggestDiscoCatalogMapping({
    name: 'Yerba mate con bombilla',
    sourceCategory: '/Hogar y textil/',
  })
  assert.equal(mixedProduct.status, 'ambiguous')
  assert.equal(mixedProduct.category, null)
  assert.equal(mixedProduct.subcategory, null)
  assert.equal(mixedProduct.confidence, 'low')

  const mixedClassification = getDiscoProductClassification({
    name: 'Yerba mate con bombilla',
    sourceCategory: '/Hogar y textil/',
  })
  assert.equal(mixedClassification.proposedCategory, null)
  assert.equal(mixedClassification.proposedSubcategory, null)
  assert.equal(mixedClassification.classificationConfidence, 'low')
})

test('classifies Disco lighting separately from mate bombillas', () => {
  const mateBombilla = suggestDiscoCatalogMapping({
    name: 'Bombilla de acero inoxidable',
    sourceCategory: '/Hogar y textil/',
  })
  assert.equal(mateBombilla.category, 'Hogar y Otros')
  assert.equal(mateBombilla.subcategory, 'Cocina y bazar')

  for (const product of [
    { name: 'Bombilla LED Dicroica 7W Luz Cálida Esmerilada Candela', sourceCategory: '/Hogar y textil/' },
    {
      name: 'Bombilla de vidrio',
      sourceCategories: ['/Hogar y textil/Ferretería/Lámparas/', '/Hogar y textil/Ferretería/'],
      sourceCategory: '/Hogar y textil/',
    },
  ]) {
    const suggestion = suggestDiscoCatalogMapping(product)
    assert.equal(suggestion.status, 'determined')
    assert.equal(suggestion.category, 'Hogar y Otros')
    assert.equal(suggestion.subcategory, 'Iluminación')
    assert.equal(suggestion.rule, 'disco_lighting_product')
  }
})

test('requires kitchen context for Disco canisters and honors conflicting original categories', () => {
  const kitchenCanister = suggestDiscoCatalogMapping({
    name: 'Canister Cocina 1.9l Krea',
    sourceCategories: ['/Hogar y textil/Cocina/Infusiones/', '/Hogar y textil/Cocina/'],
    sourceCategory: '/Hogar y textil/',
  })
  assert.equal(kitchenCanister.category, 'Hogar y Otros')
  assert.equal(kitchenCanister.subcategory, 'Cocina y bazar')

  for (const product of [
    {
      name: 'Canister Vidrio Blanco Krea',
      sourceCategories: ['/Hogar y textil/Baño/Accesorios de Baño/', '/Hogar y textil/Baño/'],
      sourceCategory: '/Hogar y textil/',
    },
    { name: 'Canister Vidrio Blanco Krea', sourceCategory: '/Hogar y textil/' },
    {
      name: 'Canister de cocina',
      sourceCategories: ['/Hogar y textil/Baño/Accesorios de Baño/'],
      sourceCategory: '/Hogar y textil/',
    },
  ]) {
    const suggestion = suggestDiscoCatalogMapping(product)
    assert.equal(suggestion.category, null)
    assert.equal(suggestion.subcategory, null)
    assert.equal(suggestion.confidence, 'low')
    assert.ok(['ambiguous', 'insufficient_evidence'].includes(suggestion.status))
  }
})

test('recognizes coffee filters but abstains for unrelated filters and ambiguous coffee names', () => {
  const paperFilter = suggestDiscoCatalogMapping({
    name: 'Filtro De Papel Para Café Nº 2 X 30 U Domestic',
    sourceCategories: ['/Hogar y textil/Cocina/Infusiones/', '/Hogar y textil/Cocina/'],
    sourceCategory: '/Hogar y textil/',
  })
  assert.equal(paperFilter.category, 'Hogar y Otros')
  assert.equal(paperFilter.subcategory, 'Cocina y bazar')
  assert.equal(paperFilter.confidence, 'medium')

  for (const name of ['Filtro de agua', 'Accesorio para café', 'Café']) {
    const suggestion = suggestDiscoCatalogMapping({ name, sourceCategory: '/Hogar y textil/' })
    assert.notEqual(suggestion.subcategory, 'Cocina y bazar')
    assert.notEqual(suggestion.subcategory, 'Infusiones')
    assert.equal(suggestion.confidence, 'low')
  }
})

test('prioritizes the primary Disco product type over secondary words such as cream, milk, or oil', () => {
  const cases = [
    ['Pasta Dental Colgate', 'Limpieza e Higiene', 'Cuidado bucal'],
    ['Crema Dental Oral-B', 'Limpieza e Higiene', 'Cuidado bucal'],
    ['Cepillo Dental Colgate', 'Limpieza e Higiene', 'Cuidado bucal'],
    ['Cepillos Dentales Colgate', 'Limpieza e Higiene', 'Cuidado bucal'],
    ['Crema Nivea Soft', 'Limpieza e Higiene', 'Higiene personal'],
    ['Crema Facial Garnier', 'Limpieza e Higiene', 'Higiene personal'],
    ['Crema Corporal Nivea', 'Limpieza e Higiene', 'Higiene personal'],
    ['Crema para Peinar Elvive', 'Limpieza e Higiene', 'Cuidado capilar'],
    ['Shampoo con aceite de argán', 'Limpieza e Higiene', 'Cuidado capilar'],
    ['Detergente Lavavajilla Cif', 'Limpieza e Higiene', 'Limpieza de cocina'],
    ['Cif Crema Lavavajillas', 'Limpieza e Higiene', 'Limpieza de cocina'],
    ['Limpiador en Crema Cif', 'Limpieza e Higiene', 'Limpieza del hogar'],
    ['Jabón en Pan para lavar', 'Limpieza e Higiene', 'Lavado de ropa'],
    ['Jabón de Tocador', 'Limpieza e Higiene', 'Higiene personal'],
    ['Alimento para Perros con Leche', 'Hogar y Otros', 'Mascotas'],
    ['Alimento para Gatos con Leche', 'Hogar y Otros', 'Mascotas'],
    ['Licor Amarula Crema', 'Almacén y Alimentos', 'Bebidas'],
    ['Baileys Irish Cream', 'Almacén y Alimentos', 'Bebidas'],
    ['Galletitas Oreo con Crema', 'Almacén y Alimentos', 'Galletitas y productos de panificación'],
    ['Papas sabor Crema y Cebolla', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Helado sabor Crema', 'Alimentos Frescos y Refrigerados', 'Helados'],
    ['Bowl Cerámico Color Crema', 'Hogar y Otros', 'Cocina y bazar'],
    ['Plato Cerámico Color Crema', 'Hogar y Otros', 'Cocina y bazar'],
    ['Mug Color Crema', 'Hogar y Otros', 'Cocina y bazar'],
    ['Azucarera Cerámica Color Crema', 'Hogar y Otros', 'Cocina y bazar'],
    ['Sopa Crema de Calabaza', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Polenta sabor Crema', 'Almacén y Alimentos', 'Pastas y harinas'],
    ['Aderezo con Crema', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Gomitas sabor Crema', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Pastillas sabor Crema', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Agua Micelar Garnier', 'Limpieza e Higiene', 'Higiene personal'],
    ['Tónico Nivea', 'Limpieza e Higiene', 'Higiene personal'],
    ['Crema de Leche', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
  ]

  for (const [name, category, subcategory] of cases) {
    const suggestion = suggestDiscoCatalogMapping({ name })
    assert.equal(suggestion.status, 'determined', JSON.stringify({ name, suggestion }))
    assert.equal(suggestion.category, category, name)
    assert.equal(suggestion.subcategory, subcategory, name)
    assert.equal(suggestion.confidence, 'high', name)
  }
})

test('classifies specific pet-care brands and Nivea Soft without inferring from incidental ingredients', () => {
  const cases = [
    ['Dog Chow sabor leche', 'Hogar y Otros', 'Mascotas'],
    ['Whiskas sabor carne', 'Hogar y Otros', 'Mascotas'],
    ['Nivea Soft', 'Limpieza e Higiene', 'Higiene personal'],
  ]

  for (const [name, category, subcategory] of cases) {
    const suggestion = suggestDiscoCatalogMapping({ name })
    assert.equal(suggestion.status, 'determined', name)
    assert.equal(suggestion.category, category, name)
    assert.equal(suggestion.subcategory, subcategory, name)
    assert.equal(suggestion.confidence, 'high', name)
  }

  for (const name of ['Artículo con leche', 'Artículo con crema', 'Artículo con aceite', 'Crema de almendras']) {
    const suggestion = suggestDiscoCatalogMapping({ name })
    assert.equal(suggestion.status, 'insufficient_evidence', name)
    assert.equal(suggestion.category, null, name)
    assert.equal(suggestion.subcategory, null, name)
  }

  const milkFlavor = suggestDiscoCatalogMapping({ name: 'Galletitas sabor leche' })
  assert.equal(milkFlavor.category, 'Almacén y Alimentos')
  assert.equal(milkFlavor.subcategory, 'Galletitas y productos de panificación')
})

test('regresses the thirteen historical Disco classifier cases against their real product names', () => {
  const cases = [
    ['1702', 'Licor Crema Sabor Frambuesa, Chocolate Blanco y Baobab 750 Ml Amarula', 'Almacén y Alimentos', 'Bebidas', 'disco_cream_liqueur'],
    ['11991', 'Yogur Entero Yogurisimo Botella 185gr Frutilla Con Chocolate', 'Alimentos Frescos y Refrigerados', 'Lácteos', 'disco_chocolate_dairy'],
    ['14958', 'Leche Saborizada Sabor Chocolate Reducida en lactosa 200 Ml Las Tres Niñas', 'Alimentos Frescos y Refrigerados', 'Lácteos', 'disco_chocolate_dairy'],
    ['8997', 'Galletitas Sin Tacc De Chocolate Con Azúcar 100 Gr Nina', 'Almacén y Alimentos', 'Galletitas y productos de panificación', 'disco_biscuits'],
    ['1336', 'Chocolate Aireado Leche 80 Grs Suflair®', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['6591', 'Chocolate Leche Suave Y Cremoso X 45 Grs Nestle', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['8567', 'Chocolate Guylian Leche - Sin Azucar Agregada', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['8202', 'Alfajor Dulce De Leche Sin Azúcar 150 Gr  X 3 Un Happy Food', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_alfajor'],
    ['8961', 'Alfajor Dulce De Leche Sin Azúcar 50 Gr Happy Food', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_alfajor'],
    ['14586', 'Alfajor Fantoche Triple Leche X 85 Gr', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_alfajor'],
    ['6399', 'Maiz Frito Mostaza Y Miel 200 Gr', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_maize_snack'],
    ['7206', 'Kombucha Yerba Mate Bergamota Moringa Booch', 'Almacén y Alimentos', 'Bebidas', 'disco_kombucha'],
    ['3868', 'Snacks Temptations Salmon Y Queso 48gr', 'Hogar y Otros', 'Mascotas', 'disco_pet_food_brand'],
  ]

  for (const [productId, name, category, subcategory, rule] of cases) {
    const suggestion = suggestDiscoCatalogMapping({
      name,
      source_category: '',
      source_subcategory: '',
    })
    assert.equal(suggestion.status, 'determined', `${productId}: ${name}`)
    assert.equal(suggestion.category, category, `${productId}: ${name}`)
    assert.equal(suggestion.subcategory, subcategory, `${productId}: ${name}`)
    assert.equal(suggestion.rule, rule, `${productId}: ${name}`)
  }
})

test('prioritizes Disco product types over incidental ingredients and flavor words', () => {
  const cases = [
    ['Chocolate Aireado Leche 80 Grs Suflair', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['Chocolate Nestlé Leche Suave y Cremoso', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['Chocolate Guylian Leche sin azúcar agregada', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['Chocolate Nestlé en barra', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['Bombones de chocolate', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_chocolate_product'],
    ['Alfajor Dulce de Leche', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_alfajor'],
    ['Licor El Nono Don Te', 'Almacén y Alimentos', 'Bebidas', 'disco_liqueur'],
    ['Snacks Temptations Salmón y Queso', 'Hogar y Otros', 'Mascotas', 'disco_pet_food_brand'],
    ['Maíz frito sabor Mostaza y Miel', 'Almacén y Alimentos', 'Golosinas y snacks', 'disco_maize_snack'],
    ['Kombucha Yerba Mate Bergamota', 'Almacén y Alimentos', 'Bebidas', 'disco_kombucha'],
  ]

  for (const [name, category, subcategory, rule] of cases) {
    const suggestion = suggestDiscoCatalogMapping({ name })
    assert.equal(suggestion.status, 'determined', name)
    assert.equal(suggestion.category, category, name)
    assert.equal(suggestion.subcategory, subcategory, name)
    assert.equal(suggestion.rule, rule, name)
    assert.equal(suggestion.confidence, 'high', name)
  }

  const franui = suggestDiscoCatalogMapping({
    name: 'Bombón de Frambuesa Franui Leche 150 Gr',
    sourceCategory: '/Congelados/',
    sourceSubcategory: 'Lácteos',
  })
  assert.equal(franui.status, 'ambiguous')
  assert.equal(franui.category, null)
  assert.equal(franui.subcategory, null)
  assert.equal(franui.confidence, 'low')
  assert.equal(franui.reason, 'brand_product_type_requires_review')
})

test('keeps core dairy, infusion, cream-liqueur, cleaning, and personal-care rules intact', () => {
  const cases = [
    ['Yogur natural', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Leche entera', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Leche chocolatada', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Leche sabor chocolate Nesquik', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Leche chocolatada Serenísima 1L', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Leche chocolatada Serenísima 200ml', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Yogur sabor chocolate', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Yogur Yogurisimo Bebible Frutilla & Chocolate', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Bebida láctea sabor chocolate', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Postre lácteo de chocolate', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Café instantáneo', 'Almacén y Alimentos', 'Infusiones'],
    ['Té en saquitos', 'Almacén y Alimentos', 'Infusiones'],
    ['Yerba mate', 'Almacén y Alimentos', 'Infusiones'],
    ['Licor Amarula Crema', 'Almacén y Alimentos', 'Bebidas'],
    ['Baileys Irish Cream', 'Almacén y Alimentos', 'Bebidas'],
    ['Limpiador en Crema Cif', 'Limpieza e Higiene', 'Limpieza del hogar'],
    ['Desodorante Masculino Axe', 'Limpieza e Higiene', 'Higiene personal'],
  ]

  for (const [name, category, subcategory] of cases) {
    const suggestion = suggestDiscoCatalogMapping({ name })
    assert.equal(suggestion.status, 'determined', name)
    assert.equal(suggestion.category, category, name)
    assert.equal(suggestion.subcategory, subcategory, name)
  }
})

test('preserves manual HTML and VTEX classifications and metadata through persistence fields', () => {
  const manualValues = {
    mappingStatus: 'manual_override',
    classification_source: 'manual',
    classification_confidence: 'medium',
    proposedCategory: 'Limpieza e Higiene',
    proposedSubcategory: 'Higiene personal',
  }
  const htmlProduct = normalizeDiscoHtmlProduct({
    sourceProductId: 'disco-html-manual',
    name: 'Pasta Dental Colgate 90 g',
    sourceCategory: '/Higiene/Cuidado bucal/',
    price: 1000,
    image: 'https://example.test/product.png',
    ...manualValues,
  })

  assert.equal(htmlProduct.mappingStatus, 'manual_override')
  assert.equal(htmlProduct.classificationSource, 'manual')
  assert.equal(htmlProduct.classificationConfidence, 'medium')
  assert.equal(htmlProduct.proposedCategory, manualValues.proposedCategory)
  assert.equal(htmlProduct.proposedSubcategory, manualValues.proposedSubcategory)
  assert.deepEqual(
    buildDiscoProductTaxonomyFields(htmlProduct, getDiscoProductClassification(htmlProduct)),
    {
      classification_source: 'manual',
      classification_confidence: 'medium',
      source_category: '/Higiene/Cuidado bucal/',
      source_subcategory: null,
    },
  )

  const vtexProduct = normalizeDiscoProduct({
    productId: 'disco-vtex-manual',
    productName: 'Pasta Dental Colgate 90 g',
    categories: ['/Higiene/Cuidado bucal/'],
    mappingStatus: manualValues.mappingStatus,
    classification_source: manualValues.classification_source,
    classification_confidence: manualValues.classification_confidence,
    category: manualValues.proposedCategory,
    subcategory: manualValues.proposedSubcategory,
    items: [{
      itemId: 'sku-vtex-manual',
      sellers: [{ commertialOffer: { IsAvailable: true, Price: 1000, ListPrice: 1000 } }],
    }],
  })
  assert.equal(vtexProduct.mappingStatus, 'manual_override')
  assert.equal(vtexProduct.classificationSource, 'manual')
  assert.equal(vtexProduct.classificationConfidence, 'medium')
  assert.equal(vtexProduct.proposedCategory, manualValues.proposedCategory)
  assert.equal(vtexProduct.proposedSubcategory, manualValues.proposedSubcategory)
  assert.deepEqual(
    buildDiscoProductTaxonomyFields(vtexProduct, getDiscoProductClassification(vtexProduct)),
    {
      classification_source: 'manual',
      classification_confidence: 'medium',
      source_category: '/Higiene/Cuidado bucal/',
      source_subcategory: null,
    },
  )

  const manualSourceWithoutStatus = normalizeDiscoHtmlProduct({
    sourceProductId: 'disco-html-manual-source',
    name: 'Producto con decisión guardada',
    classificationSource: 'manual',
    proposedCategory: 'Hogar y Otros',
    proposedSubcategory: 'Mascotas',
    price: 1000,
    image: 'https://example.test/product.png',
  })
  assert.equal(manualSourceWithoutStatus.mappingStatus, 'manual')
  assert.equal(manualSourceWithoutStatus.proposedCategory, 'Hogar y Otros')
  assert.equal(manualSourceWithoutStatus.proposedSubcategory, 'Mascotas')
  assert.deepEqual(
    buildDiscoProductTaxonomyFields(
      manualSourceWithoutStatus,
      getDiscoProductClassification(manualSourceWithoutStatus),
    ),
    {
      classification_source: 'manual',
      classification_confidence: 'manual',
      source_category: null,
      source_subcategory: null,
    },
  )
})

test('uses multi-level Disco source paths independent of category order and abstains on missing or contradictory evidence', () => {
  const orderedPaths = [
    '/Alimentos y bebidas/Bebidas/Vinos/Tintos/',
    '/Alimentos y bebidas/Bebidas/',
  ]
  const sourceProduct = (sourceCategories) => suggestDiscoCatalogMapping({
    name: 'Selección Reserva Especial',
    sourceCategory: '/Alimentos y bebidas/',
    sourceCategories,
  })

  const forward = sourceProduct(orderedPaths)
  const reversed = sourceProduct([...orderedPaths].reverse())
  assert.equal(forward.status, 'determined')
  assert.equal(forward.category, 'Almacén y Alimentos')
  assert.equal(forward.subcategory, 'Bebidas')
  assert.deepEqual(
    [reversed.status, reversed.category, reversed.subcategory],
    [forward.status, forward.category, forward.subcategory],
  )

  const missingSubcategory = suggestDiscoCatalogMapping({
    name: 'Producto Especial',
    sourceCategory: '/Supermercado/',
  })
  assert.equal(missingSubcategory.status, 'insufficient_evidence')
  assert.equal(missingSubcategory.category, null)
  assert.equal(missingSubcategory.subcategory, null)

  const conflictingSource = suggestDiscoCatalogMapping({
    name: 'Producto Especial',
    sourceCategories: ['/Alimentos/Lácteos/', '/Limpieza/Higiene personal/'],
  })
  assert.equal(conflictingSource.status, 'ambiguous')
  assert.equal(conflictingSource.confidence, 'low')

  const explicitTypeWithConflict = suggestDiscoCatalogMapping({
    name: 'Pasta Dental Colgate',
    sourceCategory: '/Alimentos/Lácteos/',
  })
  assert.equal(explicitTypeWithConflict.category, 'Limpieza e Higiene')
  assert.equal(explicitTypeWithConflict.subcategory, 'Cuidado bucal')
  assert.equal(explicitTypeWithConflict.confidence, 'medium')
})

test('preserves manual classifications and leaves the shared taxonomy available to Mami and Carrefour', () => {
  const manual = getDiscoProductClassification({
    name: 'Pasta Dental Colgate',
    classification_source: 'manual',
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene personal',
  })
  assert.equal(manual.classificationSource, 'manual')
  assert.equal(manual.classificationConfidence, 'manual')
  assert.equal(manual.proposedCategory, 'Limpieza e Higiene')
  assert.equal(manual.proposedSubcategory, 'Higiene personal')

  const sharedPetFood = suggestCatalogMapping({ name: 'Alimento para perros con leche' })
  assert.equal(sharedPetFood.category, 'Hogar y Otros')
  assert.equal(sharedPetFood.subcategory, 'Mascotas')
  const sharedHairCare = suggestCatalogMapping({ name: 'Shampoo con aceite de argán' })
  assert.equal(sharedHairCare.category, 'Limpieza e Higiene')
  assert.equal(sharedHairCare.subcategory, 'Cuidado capilar')
})

test('uses reviewed catalog identities for new Disco products without overriding manual input', () => {
  const examples = buildCatalogTaxonomyExamples([{
    id: 17,
    name: 'Producto especial Marca Uno 500 g',
    ean: '7791234567898',
    category_id: 'category-food',
    subcategory_id: 'subcategory-snacks',
    classification_source: 'automatic',
    categories: { name: 'Almacén y Alimentos' },
    subcategories: { name: 'Golosinas y snacks', category_id: 'category-food' },
  }], [{ product_id: 17, status: 'resolved' }])

  const fromExample = getDiscoProductClassification({
    name: 'Producto especial Marca Uno 500 g',
    ean: '7791234567898',
    brand: 'Marca Uno',
    price: 1000,
  }, examples)
  assert.equal(fromExample.proposedCategory, 'Almacén y Alimentos')
  assert.equal(fromExample.proposedSubcategory, 'Golosinas y snacks')
  assert.equal(fromExample.classificationConfidence, 'high')
  assert.equal(fromExample.suggestion.rule, 'reviewed_product_identity_match')

  const manual = getDiscoProductClassification({
    name: 'Producto especial Marca Uno 500 g',
    ean: '7791234567898',
    proposedCategory: 'Hogar y Otros',
    proposedSubcategory: 'Cocina y bazar',
    mappingStatus: 'manual',
  }, examples)
  assert.equal(manual.proposedCategory, 'Hogar y Otros')
  assert.equal(manual.proposedSubcategory, 'Cocina y bazar')
  assert.equal(manual.classificationSource, 'manual')
})

test('preserves Disco source taxonomy separately from ar-price proposals and classification metadata', () => {
  const rawCategory = '/Hogar y textil/'
  const item = normalizeDiscoProduct({
    productId: 'disco-mate-1',
    productName: 'Mate de acero inoxidable',
    categories: [rawCategory],
    items: [{
      itemId: 'sku-mate-1',
      sellers: [{ commertialOffer: { IsAvailable: true, Price: 1000, ListPrice: 1000 } }],
    }],
  })

  assert.equal(item.sourceCategory, rawCategory)
  assert.equal(item.sourceSubcategory, null)
  assert.equal(item.proposedCategory, 'Hogar y Otros')
  assert.equal(item.proposedSubcategory, 'Cocina y bazar')

  const classification = getDiscoProductClassification(item)
  assert.equal(classification.proposedCategory, item.proposedCategory)
  assert.equal(classification.proposedSubcategory, item.proposedSubcategory)
  assert.deepEqual(buildDiscoProductTaxonomyFields(item, classification), {
    classification_source: 'automatic',
    classification_confidence: 'high',
    source_category: rawCategory,
    source_subcategory: null,
  })

  const explicitSourceSubcategory = normalizeDiscoProduct({
    productId: 'disco-original-subcategory',
    productName: 'Yerba mate',
    categories: [rawCategory],
    sourceSubcategory: 'Infusiones originales Disco',
    items: [{
      itemId: 'sku-original-subcategory',
      sellers: [{ commertialOffer: { IsAvailable: true, Price: 1000, ListPrice: 1000 } }],
    }],
  })
  assert.equal(explicitSourceSubcategory.sourceSubcategory, 'Infusiones originales Disco')
  assert.equal(explicitSourceSubcategory.proposedSubcategory, 'Infusiones')
  assert.equal(
    buildDiscoProductTaxonomyFields(
      explicitSourceSubcategory,
      getDiscoProductClassification(explicitSourceSubcategory),
    ).source_subcategory,
    'Infusiones originales Disco',
  )
})

test('uses the same Disco mapping helper for preview and both import classification paths', () => {
  const product = {
    name: 'Bombilla de acero inoxidable',
    sourceCategory: '/Hogar y textil/',
    sourceCategories: ['/Hogar y textil/'],
  }
  const normalized = normalizeDiscoProduct({
    productId: 'disco-bombilla-1',
    productName: product.name,
    categories: product.sourceCategories,
    items: [{
      itemId: 'sku-bombilla-1',
      sellers: [{ commertialOffer: { IsAvailable: true, Price: 1000, ListPrice: 1000 } }],
    }],
  })
  const classification = getDiscoProductClassification(normalized)
  const directSuggestion = suggestDiscoCatalogMapping(product)

  assert.equal(normalized.proposedCategory, directSuggestion.category)
  assert.equal(normalized.proposedSubcategory, directSuggestion.subcategory)
  assert.equal(classification.proposedCategory, directSuggestion.category)
  assert.equal(classification.proposedSubcategory, directSuggestion.subcategory)
})

test('extracts a Disco promotional price and reference price without verifying purchase conditions', () => {
  assert.deepEqual(
    parseDiscoPromotionFromHtml(promotionHtml(), '7896004009162', Date.parse('2026-11-03T12:00:00Z')),
    {
      promotionPrice: 3300,
      referencePrice: 6600,
      conditionsVerified: false,
      validUntil: '2026-11-03',
    },
  )
})

test('does not use a promotion for a different product EAN or an expired promotion', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  assert.equal(parseDiscoPromotionFromHtml(promotionHtml(), '7790000000001', now), null)
  assert.equal(
    parseDiscoPromotionFromHtml(promotionHtml({ offers: { price: 3300, priceValidUntil: '2026-11-02', listPrice: 6600 } }), '7896004009162', now),
    null,
  )
})

test('resolves the canonical Disco page from EAN and caches the result', async () => {
  const requestedUrls = []
  const fetchPromotion = createDiscoPromotionFetcher({
    fetchImpl: async (url) => {
      requestedUrls.push(String(url))
      if (String(url).startsWith('https://www.disco.com.ar/api/')) {
        return {
          ok: true,
          json: async () => [{
            link: 'https://www.disco.com.ar/papas-pringles/p?utm_source=api',
            items: [{ ean: '7896004009162' }],
          }],
        }
      }
      return { ok: true, text: async () => promotionHtml() }
    },
    now: () => Date.parse('2026-11-03T12:00:00Z'),
  })

  const first = await fetchPromotion('7896004009162')
  const second = await fetchPromotion('7896004009162')

  assert.deepEqual(first, second)
  assert.equal(requestedUrls.length, 2)
  assert.equal(
    requestedUrls[0],
    'https://www.disco.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean%3A7896004009162&_from=0&_to=49',
  )
  assert.equal(requestedUrls[1], 'https://www.disco.com.ar/papas-pringles/p')
})

test('rejects invalid EANs and noncanonical product URLs returned by Disco', async () => {
  let fetchCount = 0
  const invalidEanFetcher = createDiscoPromotionFetcher({
    fetchImpl: async () => {
      fetchCount += 1
      return { ok: true, json: async () => [] }
    },
  })

  await assert.rejects(invalidEanFetcher('not-an-ean'), /EAN no es válido/)
  assert.equal(fetchCount, 0)

  const invalidLinkFetcher = createDiscoPromotionFetcher({
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{
        link: 'https://www.disco.com.ar:8443/product/p',
        items: [{ ean: '7896004009162' }],
      }],
    }),
  })
  await assert.rejects(invalidLinkFetcher('7896004009162'), /ficha de producto de Disco/)
})

test('rejects arbitrary URL credentials and ports in product links', async () => {
  const fetchPromotion = createDiscoPromotionFetcher({
    fetchImpl: async () => ({
      ok: true,
      json: async () => [{
        link: 'https://user:pass@www.disco.com.ar/papas-pringles/p',
        items: [{ ean: '7896004009162' }],
      }],
    }),
  })

  await assert.rejects(fetchPromotion('7896004009162'), /ficha de producto de Disco/)
})
