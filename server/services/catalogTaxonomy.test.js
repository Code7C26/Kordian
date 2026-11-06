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
    ['Lomito de atún en aceite Carrefour Classic 170 grs', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Caldo de verduras 12 cubos', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Caldo de carne 12 cubos', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Mayonesa con jugo de limón 250 g', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Bolsa para horno 8 unidades', 'Hogar y Otros', 'Cocina y bazar'],
    ['Aceite de girasol 1.5 l', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Aceite de oliva extra virgen 500 ml', 'Almacén y Alimentos', 'Aceites, condimentos y aderezos'],
    ['Verduras frescas surtidas 500 g', 'Alimentos Frescos y Refrigerados', 'Frutas y verduras'],
    ['Verduras en conserva 300 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Vegetales frescos surtidos 500 g', 'Alimentos Frescos y Refrigerados', 'Frutas y verduras'],
    ['Vegetales en lata 300 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['En conserva mezcla de verduras 300 g', 'Almacén y Alimentos', 'Conservas y alimentos preparados'],
    ['Papas fritas congeladas 1 kg', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Papas fritas Pringles crema y cebolla 109 g', 'Almacén y Alimentos', 'Golosinas y snacks'],
    ['Papas fritas McCain sabor provenzal 700 g', 'Alimentos Frescos y Refrigerados', 'Congelados'],
    ['Helado congelado de frutilla 1 l', 'Alimentos Frescos y Refrigerados', 'Helados'],
  ]

  for (const [name, category, subcategory] of cases) {
    assertMapping({ name }, category, subcategory)
  }
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
})

test('uses presentation and description without allowing them to override a clearer name', () => {
  assertMapping(
    { name: 'Producto surtido', presentation: 'Verduras en conserva 300 g' },
    'Almacén y Alimentos',
    'Conservas y alimentos preparados',
  )

  assertMapping(
    { name: 'Producto listo para preparar', description: 'Caldo concentrado de verduras' },
    'Almacén y Alimentos',
    'Conservas y alimentos preparados',
    'medium',
  )

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
