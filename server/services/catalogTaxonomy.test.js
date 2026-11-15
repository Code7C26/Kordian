const test = require('node:test')
const assert = require('node:assert/strict')
const { suggestCatalogMapping } = require('./catalogTaxonomy')

function assertMapping(product, category, subcategory, confidence = null) {
  const suggestion = suggestCatalogMapping(product)
  assert.equal(suggestion.status, 'determined', JSON.stringify({ product, suggestion }))
  assert.equal(suggestion.category, category)
  assert.equal(suggestion.subcategory, subcategory)
  if (confidence) assert.equal(suggestion.confidence, confidence)
  assert.ok(suggestion.rule)
  assert.ok(suggestion.reason)
  return suggestion
}

test('classifies by the main product type instead of incidental ingredients or descriptors', () => {
  const cases = [
    ['Atún al aceite de girasol 170 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Atún   en   aceite de girasol 170 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Lomito de atún en aceite Carrefour Classic 170 grs', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Caldo de verduras 12 cubos', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Caldo de carne 12 cubos', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Mayonesa con jugo de limón 250 g', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Bolsa para horno 8 unidades', 'Hogar y Otros', 'Cocina y bazar'],
    ['Bolsa para horno eléctrico 8 unidades', 'Hogar y Otros', 'Cocina y bazar'],
    ['Aceite de girasol 1.5 l', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Aceite de oliva extra virgen 500 ml', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Verduras frescas surtidas 500 g', 'Alimentos Frescos y Refrigerados', 'Frutas y verduras'],
    ['Verduras en conserva 300 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Vegetales frescos surtidos 500 g', 'Alimentos Frescos y Refrigerados', 'Frutas y verduras'],
    ['Vegetales en lata 300 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['En conserva mezcla de verduras 300 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Papas fritas congeladas 1 kg', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Papas fritas Pringles crema y cebolla 109 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Papas fritas congeladas McCain sabor provenzal 700 g', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Helado congelado de frutilla 1 l', 'Alimentos Frescos y Refrigerados', 'Helados'],
  ]

  for (const [name, category, subcategory] of cases) {
    assertMapping({ name }, category, subcategory)
  }
})

test('distinguishes packaged fries snacks from frozen fries and abstains on generic fries', () => {
  const cases = [
    ['Papas fritas Pringles', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['papas fritas pringles', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ["Papas fritas Lay's", 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Papas fritas sabor queso', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Papas fritas congeladas McCain', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Papas prefritas congeladas', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Papas fritas listas para freír', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Papas fritas listas para freir', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Papas fritas congeladas sabor queso', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Papas fritas Pringles congeladas', 'Alimentos Frescos y Refrigerados', 'Congelados'],
  ]

  for (const [name, category, subcategory] of cases) {
    assertMapping({ name }, category, subcategory)
  }

  const generic = suggestCatalogMapping({ name: 'Papas fritas' })
  assert.equal(generic.status, 'insufficient_evidence')
  assert.equal(generic.category, null)
  assert.equal(generic.subcategory, null)
})

test('prefers explicit product-type rules over conflicting generic ingredient rules', () => {
  assertMapping(
    { name: 'Atún tomate en aceite' },
    'Almacén y Alimentos',
    'Conservas y alimentos preparados',
  )
  assertMapping(
    { name: 'Vinagre de vino 500 ml' },
    'Almacén y Alimentos',
    'Aceites, condimentos y aderezos',
  )
  assertMapping(
    { name: 'Jugo de tomate natural' },
    'Almacén y Alimentos',
    'Bebidas',
  )
  assertMapping(
    { name: 'Bebida láctea sabor caramelo 200 ml' },
    'Alimentos Frescos y Refrigerados',
    'Lácteos',
  )
  assertMapping(
    { name: 'Oblea de chocolate y leche 40 g' },
    'Almacén y Alimentos',
    'Golosinas y snacks',
  )
  assertMapping(
    { name: 'Shampoo limpieza profunda 400 ml' },
    'Limpieza e Higiene',
    'Cuidado capilar',
  )
  assertMapping(
    { name: 'Detergente en polvo para ropa limpieza profunda 800 g' },
    'Limpieza e Higiene',
    'Lavado de ropa',
  )
})

test('does not let a primary-tier ingredient override the actual product type', () => {
  assertMapping(
    { name: 'Alfajor relleno de dulce de leche' },
    'Almacén y Alimentos',
    'Golosinas y snacks',
  )

  const supplement = suggestCatalogMapping({ name: 'Vitamina C en gomitas' })
  assert.equal(supplement.status, 'insufficient_evidence')
  assert.equal(supplement.category, null)
  assert.equal(supplement.subcategory, null)
})

test('reports coordinated product types even when they come from different candidate tiers', () => {
  const suggestion = suggestCatalogMapping({
    name: 'Kit shampoo y detergente lavavajilla',
  })
  assert.equal(suggestion.status, 'ambiguous')
  assert.equal(suggestion.category, null)
  assert.equal(suggestion.subcategory, null)
  assert.ok(suggestion.alternatives.some((item) => item.subcategory === 'Cuidado capilar'))
  assert.ok(suggestion.alternatives.some((item) => item.subcategory === 'Limpieza de cocina'))
})

test('distinguishes laundry powder, dishwasher detergent, and unspecified powder detergent', () => {
  assertMapping(
    { name: 'Detergente en polvo para ropa' },
    'Limpieza e Higiene',
    'Lavado de ropa',
  )
  assertMapping(
    { name: 'Detergente en polvo para lavavajillas' },
    'Limpieza e Higiene',
    'Limpieza de cocina',
  )

  const unspecified = suggestCatalogMapping({ name: 'Detergente en polvo' })
  assert.equal(unspecified.status, 'insufficient_evidence')
  assert.equal(unspecified.category, null)
  assert.equal(unspecified.subcategory, null)
})

test('recognizes explicit drink and feminine-care types without inferring from brands', () => {
  for (const name of [
    'Ron Havana Club Añejo',
    'Gin Beefeater',
    'Gin Tanqueray',
    'Gin Bombay Sapphire',
    'Aperitivo Hesperidina',
    'Aperitivo Campari',
  ]) {
    assertMapping(
      { name },
      'Almacén y Alimentos',
      'Bebidas',
    )
  }

  assertMapping(
    { name: 'Protectores diarios Carefree' },
    'Limpieza e Higiene',
    'Higiene personal',
  )
  assertMapping(
    { name: 'Jabón de tocador neutro' },
    'Limpieza e Higiene',
    'Higiene personal',
  )

  const brandOnly = suggestCatalogMapping({ name: 'Johnnie Walker Black Label' })
  assert.equal(brandOnly.status, 'insufficient_evidence')
  assert.equal(brandOnly.category, null)
  assert.equal(brandOnly.subcategory, null)
})

test('classifies crackers as bakery while keeping ambiguous sponge products in review', () => {
  assertMapping(
    { name: 'Crackers de arroz' },
    'Almacén y Alimentos',
    'Galletitas y productos de panificación',
  )

  for (const name of ['Esponja Scotch Brite', 'Esponja abrasiva Esfrebom']) {
    const suggestion = suggestCatalogMapping({ name })
    assert.equal(suggestion.status, 'ambiguous')
    assert.equal(suggestion.category, null)
    assert.equal(suggestion.subcategory, null)
  }
})

test('keeps long flavor lists and brand names from creating false product-type conflicts', () => {
  assertMapping(
    { name: 'Alimento para perros sabor carne, pollo, verdura y leche' },
    'Hogar y Otros',
    'Mascotas',
  )
  assertMapping(
    { name: 'Shampoo engrosador Tío Nacho' },
    'Limpieza e Higiene',
    'Cuidado capilar',
  )
})

test('keeps existing classifications for representative catalog families', () => {
  const cases = [
    ['Queso cremoso 400 g', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Leche entera larga vida 1 l', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Yogur bebible sabor frutilla 1 l', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Detergente para ropa Ala 1 l', 'Limpieza e Higiene', 'Lavado de ropa'],
    ['Detergente lavavajilla limón 750 ml', 'Limpieza e Higiene', 'Limpieza de cocina'],
    ['Desodorante de ambiente lavanda 360 ml', 'Limpieza e Higiene', 'Limpieza del hogar'],
    ['Aceite Johnson Baby 100 ml', 'Limpieza e Higiene', 'Higiene infantil'],
    ['Chupetines Pico Dulce 5 unidades', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Nachos sabor queso 129 g Doritos', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Palitos sabor a queso Pehuamar 165 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Sopa crema sabor vegetales 60 g Knorr', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Aceitunas verdes descarozadas 300 g Morixe', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Ñoquis sabor papa familiar 900 g La Salteña', 'Almacén y Alimentos', 'Pastas y harinas'],
    ['Fideos ramen sabor pollo 70 g', 'Almacén y Alimentos', 'Pastas y harinas'],
    ['Fideos casereccia al huevo 500 g', 'Almacén y Alimentos', 'Pastas y harinas'],
    ['Puré de tomate Arcor brik 520 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Maní pelado salado 115 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Maíz pisingallo Carrefour Classic 400 g', 'Almacén y Alimentos', 'Granos, cereales y legumbres'],
    ['Gelatina light sabor frambuesa 20 g', 'Almacén y Alimentos', 'Azúcares y dulces'],
    ['Café molido torrado con azúcar 500 g', 'Almacén y Alimentos', 'Infusiones'],
    ['Pasta dental menta 90 g', 'Limpieza e Higiene', 'Cuidado bucal'],
    ['Horno eléctrico 45 l', 'Electrónica y Electrodomésticos', 'Electrodomésticos grandes'],
    ['Cubiertos de acero inoxidable 24 piezas', 'Hogar y Otros', 'Cocina y bazar'],
  ]

  for (const [name, category, subcategory] of cases) {
    assertMapping({ name }, category, subcategory)
  }
})

test('classifies appliance variants by name and source taxonomy', () => {
  const cases = [
    ['Freezer', 'Electrodomésticos grandes'],
    ['FREEZER VERTICAL Samsung Twin Cooling', 'Electrodomésticos grandes'],
    ['Freezer horizontal Patrick F400', 'Electrodomésticos grandes'],
    ['Congelador Gafa 300 litros', 'Electrodomésticos grandes'],
    ['Heladera No Frost 360 l', 'Electrodomésticos grandes'],
    ['Refrigerador Samsung 400 l', 'Electrodomésticos grandes'],
    ['Frigobar bajo mesada 90 l', 'Electrodomésticos grandes'],
    ['Secarropas por calor 8 kg', 'Electrodomésticos grandes'],
    ['Lavarropas automático 8 kg', 'Electrodomésticos grandes'],
    ['Lavavajillas acero inoxidable', 'Electrodomésticos grandes'],
    ['Microondas digital 30 l', 'Electrodomésticos grandes'],
    ['Horno eléctrico 45 l', 'Electrodomésticos grandes'],
    ['Aspiradora ciclónica 2000 W', 'Electrodomésticos pequeños'],
    ['Licuadora 1.5 l', 'Electrodomésticos pequeños'],
    ['Batidora planetaria', 'Electrodomésticos pequeños'],
    ['Cafetera espresso', 'Electrodomésticos pequeños'],
    ['Tostadora eléctrica', 'Electrodomésticos pequeños'],
    ['Aire acondicionado split 3000 frigorías', 'Climatización'],
  ]

  for (const [name, subcategory] of cases) {
    assertMapping(
      { name },
      'Electrónica y Electrodomésticos',
      subcategory,
    )
  }

  assertMapping(
    { name: 'Producto de frío modelo X', source_subcategory: 'freezer' },
    'Electrónica y Electrodomésticos',
    'Electrodomésticos grandes',
  )
  assertMapping(
    { name: 'Aspiradora modelo X', source_subcategory: 'aspiradoras y lustradoras' },
    'Electrónica y Electrodomésticos',
    'Electrodomésticos pequeños',
  )

  for (const name of ['freezer vertical gafa', 'FREEZER HORIZONTAL GAFA']) {
    assertMapping(
      { name },
      'Electrónica y Electrodomésticos',
      'Electrodomésticos grandes',
    )
  }
})

test('does not classify freezer accessories as large appliances', () => {
  for (const name of [
    'Bolsas para freezer 25 unidades',
    'Organizador para freezer',
    'Accesorios para freezer',
  ]) {
    const suggestion = suggestCatalogMapping({ name })
    assert.equal(suggestion.status, 'insufficient_evidence', JSON.stringify({ name, suggestion }))
    assert.equal(suggestion.category, null)
    assert.equal(suggestion.subcategory, null)
  }

  const accessoryWithSourceMapping = suggestCatalogMapping({
    name: 'Organizador para freezer',
    source_subcategory: 'freezer',
  })
  assert.equal(accessoryWithSourceMapping.status, 'insufficient_evidence')
  assert.equal(accessoryWithSourceMapping.category, null)
  assert.equal(accessoryWithSourceMapping.subcategory, null)

  assertMapping(
    { name: 'Freezer vertical Gafa' },
    'Electrónica y Electrodomésticos',
    'Electrodomésticos grandes',
  )
  assertMapping(
    { name: 'Freezer horizontal Patrick' },
    'Electrónica y Electrodomésticos',
    'Electrodomésticos grandes',
  )
  assertMapping(
    { name: 'Freezer vertical Gafa con bolsas para freezer' },
    'Electrónica y Electrodomésticos',
    'Electrodomésticos grandes',
  )
})

test('distinguishes dishwasher appliances from dishwasher detergents', () => {
  assertMapping(
    { name: 'Lavavajillas acero inoxidable' },
    'Electrónica y Electrodomésticos',
    'Electrodomésticos grandes',
  )
  assertMapping(
    { name: 'Detergente lavavajillas Finish' },
    'Limpieza e Higiene',
    'Limpieza de cocina',
  )
  assertMapping(
    { name: 'Lavavajillas acero inoxidable Finish' },
    'Electrónica y Electrodomésticos',
    'Electrodomésticos grandes',
  )

  const finishPowder = suggestCatalogMapping({ name: 'Lavavajillas Finish polvo' })
  assert.equal(finishPowder.status, 'insufficient_evidence')
  assert.equal(finishPowder.category, null)
  assert.equal(finishPowder.subcategory, null)

  for (const name of [
    'Detergente para lavavajillas',
    'Detergente lavavajillas',
    'Detergente lavavajilla',
    'Detergente en polvo para lavavajillas',
  ]) {
    assertMapping(
      { name },
      'Limpieza e Higiene',
      'Limpieza de cocina',
    )
  }

  const unspecifiedPowder = suggestCatalogMapping({ name: 'Detergente en polvo' })
  assert.equal(unspecifiedPowder.status, 'insufficient_evidence')
  assert.equal(unspecifiedPowder.category, null)
  assert.equal(unspecifiedPowder.subcategory, null)
})

test('does not classify secondary flavors, ingredients, or aromas as the product type', () => {
  const cases = [
    ['Tostaditas de arroz sabor cuatro quesos 95 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Ravioles cuatro quesos 450 g', 'Almacén y Alimentos', 'Pastas y harinas'],
    ['Fideos jamón y queso 500 g', 'Almacén y Alimentos', 'Pastas y harinas'],
    ['Ñoquis de papa 900 g', 'Almacén y Alimentos', 'Pastas y harinas'],
    ['Mayonesa sabor limón 250 g', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Caldo sabor carne y verduras 12 cubos', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
  ]

  for (const [name, category, subcategory] of cases) {
    assertMapping({ name }, category, subcategory)
  }
})

test('keeps secondary descriptors local to the product type they describe', () => {
  const cases = [
    ['Galletitas sabor chocolate', 'Almacén y Alimentos', 'Galletitas y productos de panificación'],
    ['Yogur sabor vainilla', 'Alimentos Frescos y Refrigerados', 'Lácteos'],
    ['Caramelos de miel', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Chocolate con almendras', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Alfajor relleno de dulce de leche', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Papas fritas sabor queso', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Producto sabor vainilla, café molido', 'Almacén y Alimentos', 'Infusiones'],
    ['Producto con aroma floral, café molido', 'Almacén y Alimentos', 'Infusiones'],
  ]

  for (const [name, category, subcategory] of cases) {
    assertMapping({ name }, category, subcategory)
  }

  for (const name of ['Gomitas de vitaminas', 'Vitaminas en gomitas']) {
    const suggestion = suggestCatalogMapping({ name })
    assert.equal(suggestion.status, 'insufficient_evidence', JSON.stringify({ name, suggestion }))
    assert.equal(suggestion.category, null)
    assert.equal(suggestion.subcategory, null)
  }

  for (const name of ['Jalea real', 'Jalea real de miel']) {
    const suggestion = suggestCatalogMapping({ name })
    assert.equal(suggestion.status, 'insufficient_evidence', JSON.stringify({ name, suggestion }))
    assert.equal(suggestion.category, null)
    assert.equal(suggestion.subcategory, null)
  }

  const unspecifiedDetergent = suggestCatalogMapping({ name: 'Detergente en polvo' })
  assert.equal(unspecifiedDetergent.status, 'insufficient_evidence')
  assert.equal(unspecifiedDetergent.category, null)
  assert.equal(unspecifiedDetergent.subcategory, null)
})

test('resolves product-type and ingredient conflicts while covering common Carrefour families', () => {
  const cases = [
    ['Galletitas Chocolina de chocolate 250 g', 'Almacén y Alimentos', 'Galletitas y productos de panificación'],
    ['Tostadas de arroz Molinos Ala clásicas 150 g', 'Almacén y Alimentos', 'Galletitas y productos de panificación'],
    ['Galletas de arroz Dos Hermanos sin sal 100 g', 'Almacén y Alimentos', 'Galletitas y productos de panificación'],
    ['Café Cabrales molido 250 g', 'Almacén y Alimentos', 'Infusiones'],
    ['Mermelada de durazno 390 g', 'Almacén y Alimentos', 'Azúcares y dulces'],
    ['Dulce de leche clásico La Serenísima 400 g', 'Almacén y Alimentos', 'Azúcares y dulces'],
    ['Dulce de leche repostero 400 g', 'Almacén y Alimentos', 'Azúcares y dulces'],
    ['Jalea de membrillo 400 g', 'Almacén y Alimentos', 'Azúcares y dulces'],
    ['Gomitas Mogul 35 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Tableta de chocolate Shot con leche y maní 90 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Bizcochos 9 de Oro 200 g', 'Almacén y Alimentos', 'Galletitas y productos de panificación'],
    ['Salmas horneadas 90 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Yerba mate Amanda tradicional 1 kg', 'Almacén y Alimentos', 'Infusiones'],
    ['Té negro 25 saquitos', 'Almacén y Alimentos', 'Infusiones'],
  ]

  for (const [name, category, subcategory] of cases) {
    assertMapping({ name }, category, subcategory)
  }

  const cacao = suggestCatalogMapping({ name: 'Cacao en polvo Toddy 180 g' })
  assert.equal(cacao.status, 'insufficient_evidence')
  assert.equal(cacao.category, null)
  assert.equal(cacao.subcategory, null)

  const royalJelly = suggestCatalogMapping({ name: 'Jalea real en cápsulas' })
  assert.equal(royalJelly.status, 'insufficient_evidence')
  assert.equal(royalJelly.category, null)
  assert.equal(royalJelly.subcategory, null)
})

test('uses source taxonomy as supporting evidence when the product name is not decisive', () => {
  assertMapping(
    { name: 'Producto de marca sin tipo identificable', source_subcategory: 'Infusiones' },
    'Almacén y Alimentos',
    'Infusiones',
    'medium',
  )

  assertMapping(
    { name: 'Notebook 14 pulgadas', source_category: 'Computación' },
    'Electrónica y Electrodomésticos',
    'Computación',
    'medium',
  )

  assertMapping(
    { name: 'Aceite de girasol', source_subcategory: 'Infusiones' },
    'Almacén y Alimentos',
    'Aceites, condimentos y aderezos',
  )

  const broadSourceCategory = suggestCatalogMapping({
    name: 'Crema Nivea Soft 200 ml',
    source_category: 'Limpieza e Higiene',
    source_subcategory: 'Limpieza del hogar',
  })
  assert.equal(broadSourceCategory.status, 'insufficient_evidence')
  assert.equal(broadSourceCategory.category, null)
  assert.equal(broadSourceCategory.subcategory, null)
})

test('uses presentation and keeps description-only evidence as a manual-review alternative', () => {
  assertMapping(
    { name: 'Producto surtido', presentation: 'Verduras en conserva 300 g' },
    'Almacén y Alimentos',
    'Conservas y alimentos preparados',
  )

  const descriptionOnly = suggestCatalogMapping({
    name: 'Producto listo para preparar',
    description: 'Caldo concentrado de verduras',
  })
  assert.equal(descriptionOnly.status, 'insufficient_evidence')
  assert.equal(descriptionOnly.category, null)
  assert.equal(descriptionOnly.subcategory, null)
  assert.ok(descriptionOnly.alternatives.some((alternative) => (
    alternative.rule === 'description_supporting_evidence'
      && alternative.subcategory === 'Conservas y alimentos preparados'
  )))

  const commercialDescription = suggestCatalogMapping({
    name: 'Cacao en polvo Toddy 360 g',
    description: 'Producto en polvo para preparar con leche. Disfrutá un desayuno con café, té y yerba mate.',
  })
  assert.equal(commercialDescription.status, 'insufficient_evidence')
  assert.equal(commercialDescription.subcategory, null)
  assert.equal(commercialDescription.confidence, 'low')

  assertMapping(
    { name: 'Atún al aceite', presentation: 'Conserva de pescado 170 g' },
    'Almacén y Alimentos',
    'Conservas y alimentos preparados',
  )
})

test('abstains when the name contains competing product types or no usable evidence', () => {
  const ambiguous = suggestCatalogMapping({ name: 'Detergente y esponja multiuso' })
  assert.equal(ambiguous.status, 'ambiguous')
  assert.equal(ambiguous.confidence, 'low')
  assert.equal(ambiguous.category, null)
  assert.equal(ambiguous.subcategory, null)
  assert.equal(ambiguous.reason, 'conflicting_product_types')
  assert.ok(ambiguous.alternatives.length > 1)

  for (const product of [
    {},
    { name: 'Producto especial 500 g' },
    { name: 'Salsa especial 300 g' },
    { name: 'Mezcla para cocinar 100 g' },
  ]) {
    const suggestion = suggestCatalogMapping(product)
    assert.equal(suggestion.status, 'insufficient_evidence', JSON.stringify({ product, suggestion }))
    assert.equal(suggestion.confidence, 'low')
    assert.equal(suggestion.category, null)
    assert.equal(suggestion.subcategory, null)
  }
})

test('returns a stable, compatible mapping shape for Mami and Carrefour inputs', () => {
  const mamiSuggestion = suggestCatalogMapping({
    name: 'Aceite de girasol alto omega 1.5 l',
    brand: 'Arcor',
    source_category: 'Almacén',
    source_subcategory: 'Aceites',
  })
  const carrefourSuggestion = suggestCatalogMapping({
    name: 'Atún al natural Carrefour Classic 170 g',
    brand: 'Carrefour Classic',
    source_category: 'Almacén',
    presentation: '170 g',
  })

  assert.equal(mamiSuggestion.status, 'determined')
  assert.equal(mamiSuggestion.category, 'Almacén y Alimentos')
  assert.equal(mamiSuggestion.subcategory, 'Aceites, condimentos y aderezos')
  assert.equal(carrefourSuggestion.status, 'determined')
  assert.equal(carrefourSuggestion.category, 'Almacén y Alimentos')
  assert.equal(carrefourSuggestion.subcategory, 'Conservas y alimentos preparados')
  for (const suggestion of [mamiSuggestion, carrefourSuggestion]) {
    assert.equal(typeof suggestion.confidence, 'string')
    assert.equal(typeof suggestion.reason, 'string')
    assert.equal(typeof suggestion.rule, 'string')
  }
})
