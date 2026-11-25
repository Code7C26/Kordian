const { extractGtin } = require('./productIdentityAudit')

const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

const normalizeIdentityText = (value) => normalize(value)
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ')

function getCatalogExampleAuthority(example) {
  const reviewStatus = String(example.reviewStatus || example.review_status || '').toLowerCase()
  if (reviewStatus === 'resolved' || reviewStatus === 'dismissed') return 3

  const source = String(example.classification_source || example.classificationSource || '').toLowerCase()
  if (source === 'manual' || source === 'manual_override') return 2
  if (source === 'automatic'
    && String(example.classification_confidence || example.classificationConfidence || '').toLowerCase() === 'high') {
    return 1
  }
  return 0
}

function hasSameCatalogIdentity(product, example) {
  const productGtin = extractGtin(product)
  const exampleGtin = extractGtin(example)
  const productBrand = normalizeIdentityText(product.brand || product.brands?.name)
  const exampleBrand = normalizeIdentityText(example.brand || example.brands?.name)
  if (productGtin && exampleGtin) {
    if (productGtin !== exampleGtin) return false
    return !productBrand || !exampleBrand || productBrand === exampleBrand
  }

  const productName = normalizeIdentityText(product.name)
  const exampleName = normalizeIdentityText(example.name)
  return Boolean(productName && productName === exampleName
    && (!productBrand || !exampleBrand || productBrand === exampleBrand))
}

function buildCatalogTaxonomyExamples(products = [], decisions = []) {
  const decisionsByProductId = new Map(
    decisions.map((decision) => [String(decision.product_id), decision.status]),
  )

  return products
    .filter((product) => product.category_id && product.subcategory_id
      && product.categories?.name && product.subcategories?.name
      && (!product.subcategories.category_id
        || String(product.subcategories.category_id) === String(product.category_id)))
    .map((product) => ({
      ...product,
      reviewStatus: decisionsByProductId.get(String(product.id)) || null,
    }))
    .filter((product) => getCatalogExampleAuthority(product) > 0)
}

function resolveCatalogMappingFromExamples(product, suggestion, examples = []) {
  const matches = examples.filter((example) => (
    getCatalogExampleAuthority(example) > 0
    && example.categories?.name
    && example.subcategories?.name
    && hasSameCatalogIdentity(product, example)
  ))
  if (!matches.length) return suggestion

  const authority = Math.max(...matches.map(getCatalogExampleAuthority))
  const authoritativeMatches = matches.filter((example) => getCatalogExampleAuthority(example) === authority)
  const destinations = new Map(authoritativeMatches.map((example) => [
    `${example.categories.name}\u0000${example.subcategories.name}`,
    example,
  ]))

  if (destinations.size > 1 || (authority === 1
    && suggestion.status === 'determined'
    && !destinations.has(`${suggestion.category}\u0000${suggestion.subcategory}`))) {
    return makeUndeterminedSuggestion(
      'ambiguous',
      'conflicting_existing_product_classifications',
      [
        ...[...destinations.values()].map((example) => ({
          category: example.categories.name,
          subcategory: example.subcategories.name,
          rule: 'existing_product_identity_match',
        })),
        ...(suggestion.status === 'determined' ? [{
          category: suggestion.category,
          subcategory: suggestion.subcategory,
          rule: suggestion.rule,
        }] : []),
      ],
    )
  }

  const [destinationKey, example] = destinations.entries().next().value
  if (authority === 1 && suggestion.status === 'determined') return suggestion

  const [category, subcategory] = destinationKey.split('\u0000')
  return {
    category,
    subcategory,
    confidence: authority === 1 ? 'medium' : 'high',
    reason: 'matched_existing_product_identity',
    rule: authority === 3
      ? 'reviewed_product_identity_match'
      : authority === 2
        ? 'manual_product_identity_match'
        : 'suggested_product_identity_match',
    status: 'determined',
    alternatives: [],
    matchedProductId: example.id,
  }
}

const rules = [
  { category: 'Almacén y Alimentos', subcategory: 'Aceites, condimentos y aderezos', terms: [
    'provenzal', 'oregano', 'esencia de vainilla', 'polvo para hornear', 'bicarbonato de sodio',
    'pimenton', 'ajo en polvo', 'ajo triturado', 'ajo picado deshidratado', 'adobo para pizza',
    'chimichurri', 'aji molido', 'aceto balsamico', 'vinagre balsamico', 'canela molida',
    'nuez moscada molida', 'comino molido', 'especias para empanadas', 'salsa guiso y arroces',
    'salsa bbq', 'salsa barbacoa', 'salsa golf', 'salsa caesar', 'salsa cheddar', 'salsa de soja',
    'salsa alioli', 'honey mustard',
  ] },
  { category: 'Almacén y Alimentos', subcategory: 'Pastas y harinas', terms: [
    'polenta', 'almidon de maiz', 'fecula de mandioca', 'lasagna precocida', 'rebozador',
  ] },
  { category: 'Almacén y Alimentos', subcategory: 'Granos, cereales y legumbres', terms: [
    'maiz pisingallo', 'arvejas partidas', 'lentejones', 'semillas de chia', 'semillas de girasol',
    'cous cous',
  ] },
  { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados', terms: [
    'choclo amarillo cremoso', 'choclo dulce en granos', 'maiz dulce en granos', 'duraznos en mitades', 'jardinera',
    'anana en rodajas', 'palmitos trozados', 'pate de foie', 'merluza al natural',
    'filet de anchoas', 'salsa pomodoro con zapallo',
  ] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: [
    'mani pelado salado', 'mani frito salado', 'mani pelado y salado', 'mani con cascara',
    'mani pelado tostado y salado', 'chizitos de maiz', 'chips de batatas', 'maicitos',
    'baguetin sabor pizza', 'takis',
  ] },
  { category: 'Almacén y Alimentos', subcategory: 'Azúcares y dulces', terms: [
    'gelatina', 'flan', 'postre',
  ] },
  { category: 'Almacén y Alimentos', subcategory: 'Pastas y harinas', terms: ['fideos', 'ramen', 'ravioles', 'ñoqui'] },
  { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados', terms: ['pure de tomate', 'tomate triturado', 'salsa pomarola', 'salsa filetto', 'salsa pizza', 'choclo en crema', 'choclo cremoso', 'choclo amarillo en granos', 'choclo en granos', 'arvejas secas remojadas', 'garbanzos secos remojados', 'durazno en mitades', 'picadillo', 'risotto'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['palitos de maiz'] },
  { category: 'Almacén y Alimentos', subcategory: 'Aceites, condimentos y aderezos', terms: ['rocio vegetal'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene infantil', terms: ['aceite para bebe', 'aceite johnson', 'aceite baby'] },
  { category: 'Limpieza e Higiene', subcategory: 'Limpieza del hogar', terms: ['desodorante de ambiente', 'desodorante ambiental'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['tostaditas de arroz', 'snack salado', 'snacks salados', 'cheetos'] },
  { category: 'Almacén y Alimentos', subcategory: 'Azúcares y dulces', terms: ['dulce de batata', 'dulce de membrillo'] },
  { category: 'Almacén y Alimentos', subcategory: 'Granos, cereales y legumbres', terms: ['cereal infantil', 'cereales infantiles'] },
  { category: 'Almacén y Alimentos', subcategory: 'Galletitas y productos de panificación', terms: ['galletita sin azucar', 'galletitas sin azucar'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['alfajor', 'golosina', 'chupetin', 'chicle', 'oblea', 'snack'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['chocolate', 'bombon', 'confite'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['nacho', 'palito sabor', 'palitos sabor', 'palito salado', 'palitos salados'] },
  { category: 'Almacén y Alimentos', subcategory: 'Pastas y harinas', terms: ['ñoqui'] },
  { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados', terms: ['aceituna', 'sopa'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Lácteos', terms: ['queso', 'leche', 'yogur', 'yogurt', 'lacteo', 'lactea', 'bebida lactea', 'manteca'] },
  { category: 'Hogar y Otros', subcategory: 'Cocina y bazar', terms: ['extractor de jugos', 'extractor jugos'] },
  { category: 'Almacén y Alimentos', subcategory: 'Bebidas', terms: ['cerveza', 'gaseosa', 'jugo', 'agua mineral', 'vino', 'licor', 'vodka', 'ron', 'gin', 'ginebra', 'whisky', 'whiskey', 'aperitivo', 'soda', 'bebida', 'isotonico', 'gatorade'] },
  { category: 'Almacén y Alimentos', subcategory: 'Infusiones', terms: ['yerba', 'mate', 'te ', 'cafe', 'infusion'] },
  { category: 'Almacén y Alimentos', subcategory: 'Azúcares y dulces', terms: ['azucar', 'azucares', 'edulcorante'] },
  { category: 'Almacén y Alimentos', subcategory: 'Bebidas', terms: ['energizante', 'energetica', 'energeticas'] },
  { category: 'Limpieza e Higiene', subcategory: 'Papel y descartables', terms: ['papel higienico', 'papel de cocina', 'toalla de papel', 'servilleta', 'panuelos', 'rollo de cocina', 'bolsa de residuos', 'bolsa para residuos', 'vasos descartables', 'platos descartables', 'cubiertos descartables', 'descartable'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Helados', terms: ['helado', 'helados'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Carnes y pescados', terms: ['carne', 'pollo', 'pescado', 'milanesa', 'hamburguesa'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Fiambres y embutidos', terms: ['jamon', 'salame', 'salamin', 'mortadela', 'fiambre', 'chorizo', 'salchicha'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Frutas y verduras', terms: ['banana', 'manzana', 'papa', 'cebolla', 'tomate', 'zanahoria', 'lechuga', 'fruta', 'verdura'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Huevos', terms: ['huevo', 'huevos'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Panadería y pastelería', terms: ['pan ', 'panaderia', 'factura', 'torta', 'budin', 'bizcochuelo', 'medialuna'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Congelados', terms: ['congelado', 'nugget'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['alfajor', 'chocolate', 'caramelo', 'chicle', 'chupetin', 'golosina', 'snack', 'oblea'] },
  { category: 'Almacén y Alimentos', subcategory: 'Granos, cereales y legumbres', terms: ['arroz', 'avena', 'lenteja', 'garbanzo', 'poroto', 'cereal', 'quinoa'] },
  { category: 'Almacén y Alimentos', subcategory: 'Pastas y harinas', terms: ['fideo', 'harina', 'semola', 'premezcla'] },
  { category: 'Almacén y Alimentos', subcategory: 'Aceites, condimentos y aderezos', terms: ['aceite', 'vinagre', 'mayonesa', 'ketchup', 'mostaza', 'sal ', 'pimienta', 'condimento'] },
  { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados', terms: ['atun', 'sardina', 'conserva', 'pure de tomate', 'tomate triturado', 'caldo', 'sopa'] },
  { category: 'Almacén y Alimentos', subcategory: 'Galletitas y productos de panificación', terms: ['galleta', 'galletita', 'tostada', 'bizcocho', 'grisines', 'cracker'] },
  { category: 'Limpieza e Higiene', subcategory: 'Cuidado bucal', terms: ['pasta dental', 'dentifrico', 'cepillo dental', 'enjuague bucal'] },
  { category: 'Limpieza e Higiene', subcategory: 'Cuidado capilar', terms: ['shampoo', 'acondicionador', 'mascara capilar', 'crema para peinar'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene infantil', terms: ['pañal', 'panal', 'toallitas bebe', 'talco bebe', 'formula infantil'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene personal', terms: ['limpieza facial', 'gel de limpieza facial', 'crema facial', 'perfume', 'desodorante corporal'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene personal', terms: ['jabon de tocador', 'desodorante hombre', 'desodorante'] },
  { category: 'Limpieza e Higiene', subcategory: 'Lavado de ropa', terms: ['jabon para ropa', 'detergente para ropa', 'suavizante', 'quitamanchas'] },
  { category: 'Limpieza e Higiene', subcategory: 'Limpieza de cocina', terms: ['detergente', 'esponja', 'lavavajilla', 'limpieza cocina', 'limpieza de cocina'] },
  { category: 'Limpieza e Higiene', subcategory: 'Limpieza del hogar', terms: ['limpiador', 'limpieza del hogar', 'limpieza de hogar', 'ambientador', 'rejilla', 'esponja', 'sahumerio', 'sopapa', 'escoba', 'trapo'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Televisores y entretenimiento', terms: ['smart tv', 'televisor', 'televis', 'roku', 'streaming'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Climatización', terms: ['aire acondicionado', 'ventilador', 'caloventor', 'estufa'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos grandes', terms: ['microondas', 'horno electrico', 'horno microondas', 'heladera', 'lavarropas', 'lavavajillas'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños', terms: ['licuadora', 'pava electrica', 'freidora', 'tostadora', 'cafetera', 'batidora'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Telefonía', terms: ['celular', 'telefono', 'smartphone'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Audio', terms: ['parlante', 'auricular', 'barra de sonido', 'audio'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Gaming', terms: ['consola', 'consolas', 'videojuego'] },
  { category: 'Hogar y Otros', subcategory: 'Hogar textil', terms: ['sabana', 'sabanas', 'frazada', 'frazadas', 'cobertor', 'toallon', 'toalla', 'toallas'] },
  { category: 'Hogar y Otros', subcategory: 'Cocina y bazar', terms: ['cubierto', 'cubiertos', 'cuchara', 'tenedor', 'cuchillo'] },
  { category: 'Hogar y Otros', subcategory: 'Automotor', terms: ['neumatico', 'neumaticos', 'camioneta'] },
  { category: 'Hogar y Otros', subcategory: 'Mascotas', terms: ['perro', 'gato', 'mascota', 'alimento balanceado', 'arena sanitaria'] },
  { category: 'Hogar y Otros', subcategory: 'Herramientas', terms: ['taladro', 'herramienta', 'destornillador', 'llave', 'martillo'] },
  { category: 'Hogar y Otros', subcategory: 'Juguetes', terms: ['juguete', 'muñeca', 'muneca', 'pelota', 'juego de mesa'] },
]

const PRIMARY_TYPE_RULES = [
  {
    rule: 'baby_oil_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene infantil',
    priority: 125,
    terms: ['aceite para bebe', 'aceite johnson', 'aceite baby'],
  },
  {
    rule: 'ambient_deodorizer_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Limpieza del hogar',
    priority: 140,
    terms: [
      'desodorante de ambiente', 'desodorante ambiental',
      'aromatizante de ambiente', 'aromatizante de ambientes',
      'aromatizante de ambiente y telas', 'aromatizante textil',
      'repuesto de aromatizante', 'aceite aromatizante',
      'aromatizante aceite natural', 'aromatizante aerosol',
    ],
  },
  {
    rule: 'laundry_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Lavado de ropa',
    priority: 140,
    terms: [
      'jabon de lavar en pan', 'jabon en pan', 'jabon pan',
      'jabon para ropa', 'jabon para lavar ropa', 'jabon de lavar',
      'detergente para ropa', 'detergente liquido para ropa',
      'detergente en polvo para ropa', 'suavizante', 'quitamanchas',
    ],
  },
  {
    rule: 'personal_soap_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene personal',
    priority: 135,
    terms: [
      'jabon de tocador', 'jabon tocador', 'jabon liquido corporal',
      'jabon corporal', 'jabon liquido para manos', 'jabon liquido de manos',
      'jabon liquido antibacterial', 'jabon antibacterial',
    ],
  },
  {
    rule: 'personal_care_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene personal',
    priority: 135,
    terms: [
      'antitranspirante', 'repelente', 'crema de afeitar', 'crema para afeitar',
      'crema depilatoria', 'crema hidratante', 'crema humectante',
      'crema corporal', 'crema facial', 'crema gel facial',
      'crema de manos', 'crema para manos', 'crema noche', 'crema dia',
      'protector solar', 'crema protectora solar', 'agua micelar',
      'leche y tonico micelar', 'hidratacion extrema',
      'leche micelar', 'tonico micelar', 'ordeñe',
    ],
  },
  {
    rule: 'baby_care_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene infantil',
    priority: 145,
    terms: [
      'crema corporal johnson baby', 'crema para bebe', 'crema bebe',
      'crema para bebes', 'crema recien nacido',
    ],
  },
  {
    rule: 'kitchen_cleaning_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Limpieza de cocina',
    priority: 135,
    terms: ['detergente'],
  },
  {
    rule: 'household_cleaning_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Limpieza del hogar',
    priority: 130,
    terms: [
      'lustramuebles', 'crema para cueros', 'crema para zapatos',
      'soda caustica', 'cristal de soda', 'ablandador de agua',
      'destapacañerias',
    ],
  },
  {
    rule: 'kitchenware_product_type',
    category: 'Hogar y Otros',
    subcategory: 'Cocina y bazar',
    priority: 140,
    terms: [
      'corta queso', 'cortador de queso', 'sarten',
      'bowl jaspeado', 'mug jaspeado',
      'mug mate', 'bowl mate', 'plato de fondo linea',
      'vasito de vidrio', 'vaso de vidrio', 'set de vasos',
      'juego de vasos', 'set x 6 vaso', 'pack x 3 copas',
      'set de copas', 'copas de vino',
      'azucarera', 'yerbero', 'yerbera', 'aceitera', 'vinagrera',
      'molinillo de pimienta', 'salero y pimentero', 'salero pimentero',
    ],
  },
  {
    rule: 'kitchen_playset_product_type',
    category: 'Hogar y Otros',
    subcategory: 'Juguetes',
    priority: 145,
    terms: ['super hamburguesa'],
  },
  {
    rule: 'dishwasher_detergent_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Limpieza de cocina',
    priority: 140,
    terms: [
      'detergente en polvo lavavajillas', 'detergente en polvo lavavajilla',
      'detergente para lavavajillas', 'detergente para lavavajilla',
      'detergente en polvo para lavavajillas', 'detergente en polvo para lavavajilla',
      'detergente lavavajillas', 'detergente lavavajilla',
    ],
  },
  {
    rule: 'hair_care_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Cuidado capilar',
    priority: 135,
    terms: [
      'shampoo', 'acondicionador', 'mascara capilar', 'mascarilla capilar',
      'mascara capilatis', 'mascarilla dove bond',
      'mascarilla kera-liso', 'mascarilla elvive',
      'mascarilla intensiva hidratacion', 'mascarilla intensiva nutricion',
      'mascarilla intensiva restauracion', 'mascara tratamiento sedal',
      'tratamiento capilar', 'tratamiento capilatis', 'tratamiento tresemme',
      'tratamiento oil nutritivo', 'kit de coloracion', 'coloracion',
      'crema para peinar',
      'crema de peinar', 'crema peinar', 'para peinar', 'crema capilar',
      'crema tratamiento', 'tintura',
    ],
  },
  {
    rule: 'preserved_food_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Conservas y alimentos preparados',
    priority: 110,
    terms: [
      'atun', 'sardina', 'merluza al natural', 'filet de anchoas', 'caldo', 'sopa',
      'aceituna', 'conserva', 'pure de tomate', 'tomate triturado', 'salsa pomarola',
      'salsa filetto', 'salsa pizza', 'choclo en crema', 'choclo cremoso',
      'choclo amarillo en granos', 'choclo en granos', 'arvejas secas remojadas',
      'garbanzos secos remojados', 'durazno en mitades', 'picadillo', 'risotto',
      'pate de foie', 'choclo amarillo cremoso', 'choclo dulce en granos',
      'maiz dulce en granos', 'jardinera', 'anana en rodajas', 'palmitos trozados',
    ],
  },
  {
    rule: 'preserved_produce',
    category: 'Almacén y Alimentos',
    subcategory: 'Conservas y alimentos preparados',
    priority: 110,
    terms: [],
  },
  {
    rule: 'oil_or_condiment_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Aceites, condimentos y aderezos',
    priority: 105,
    terms: [
      'aceite', 'aceites', 'rocio vegetal', 'mayonesa', 'vinagre', 'ketchup',
      'mostaza', 'pimienta', 'condimento', 'provenzal', 'oregano',
      'esencia de vainilla', 'polvo para hornear', 'bicarbonato de sodio',
      'pimenton', 'ajo en polvo', 'ajo triturado', 'ajo picado deshidratado',
      'adobo para pizza', 'chimichurri', 'aji molido', 'aceto balsamico',
      'vinagre balsamico', 'canela molida', 'nuez moscada molida', 'comino molido',
      'especias para empanadas', 'salsa guiso y arroces', 'salsa bbq',
      'salsa barbacoa', 'salsa golf', 'salsa caesar', 'salsa cheddar',
      'salsa de soja', 'salsa alioli', 'honey mustard',
    ],
  },
  {
    rule: 'fresh_produce_type',
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Frutas y verduras',
    priority: 82,
    terms: ['banana', 'manzana', 'papa', 'cebolla', 'tomate', 'zanahoria', 'lechuga', 'fruta', 'verdura', 'vegetal'],
  },
  {
    rule: 'ice_cream_product_type',
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Helados',
    priority: 150,
    terms: ['helado'],
  },
  {
    rule: 'frozen_food_state',
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Congelados',
    priority: 135,
    terms: [
      'congelado', 'nugget', 'papas prefritas', 'papas fritas congeladas',
      'papas fritas listas para freir',
    ],
  },
  {
    rule: 'snack_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Golosinas y snacks',
    priority: 120,
    terms: [
      'snack salado', 'snacks salados', 'nacho', 'nachos', 'palito sabor',
      'palitos sabor', 'palito salado', 'palitos salados', 'papas fritas pringles',
      'papas fritas lay', 'papas fritas sabor', 'tableta de chocolate', 'oblea',
      'papas fritas snack', 'papas fritas en tubo', 'tostaditas de arroz',
      'mani pelado salado', 'mani frito salado', 'mani pelado y salado',
      'mani con cascara', 'mani pelado tostado y salado', 'chizitos de maiz',
      'chips de batatas', 'maicitos', 'baguetin sabor pizza', 'takis', 'cheetos',
      'salmas',
    ],
  },
  {
    rule: 'sweet_spread_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Azúcares y dulces',
    priority: 110,
    terms: ['mermelada', 'jalea', 'dulce de leche'],
  },
  {
    rule: 'candy_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Golosinas y snacks',
    priority: 130,
    terms: [
      'bon o bon', 'bombon', 'alfajor', 'gomita', 'caramelo masticable',
      'caramelos masticables', 'chupetin', 'chicle', 'oblea', 'confite',
      'chocolate',
    ],
  },
  {
    rule: 'seasoning_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Aceites, condimentos y aderezos',
    priority: 145,
    terms: ['sazonador'],
  },
  {
    rule: 'pasta_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Pastas y harinas',
    priority: 120,
    terms: ['fideo', 'fideos', 'raviol', 'ravioles', 'ñoqui', 'noqui', 'ramen', 'lasagna'],
  },
  {
    rule: 'kitchen_accessory_type',
    category: 'Hogar y Otros',
    subcategory: 'Cocina y bazar',
    priority: 110,
    terms: ['bolsa para horno', 'bolsas para horno', 'papel para horno', 'fuente para horno', 'molde para horno'],
  },
  {
    rule: 'dairy_product_type',
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Lácteos',
    priority: 105,
    terms: ['postre lacteo', 'bebida lactea', 'crema de leche', 'queso', 'leche', 'yogur', 'yogurt', 'manteca'],
  },
  {
    rule: 'drink_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Bebidas',
    priority: 100,
    terms: ['gaseosa', 'agua mineral', 'jugo', 'vino', 'cerveza', 'bebida', 'soda', 'isotonico', 'gatorade', 'energizante'],
  },
  {
    rule: 'infusion_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Infusiones',
    priority: 100,
    terms: ['yerba', 'cafe', 'infusion', 'te'],
  },
  {
    rule: 'kitchen_appliance_type',
    category: 'Electrónica y Electrodomésticos',
    subcategory: 'Electrodomésticos grandes',
    priority: 125,
    terms: [
      'freezer vertical', 'freezer horizontal', 'freezer', 'congelador',
      'refrigerador', 'frigobar', 'horno electrico', 'horno microondas',
      'microondas', 'heladera', 'lavarropas', 'secarropas', 'lavavajillas',
    ],
  },
  {
    rule: 'small_appliance_product_type',
    category: 'Electrónica y Electrodomésticos',
    subcategory: 'Electrodomésticos pequeños',
    priority: 125,
    terms: ['aspiradora', 'molinillo electrico de cafe'],
  },
  {
    rule: 'oral_care_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Cuidado bucal',
    priority: 135,
    terms: [
      'pasta dental', 'pasta de dientes', 'crema dental', 'dentifrico',
      'crema adhesiva para protesis dental', 'crema adhesiva para protesis dentales',
      'cepillo dental', 'enjuague bucal',
    ],
  },
  {
    rule: 'feminine_care_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene personal',
    priority: 125,
    terms: ['protector diario', 'protectores diarios', 'toalla femenina', 'toallas femeninas'],
  },
]

const sourceMappings = {
  'lacteos': { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Lácteos' },
  'infusiones': { category: 'Almacén y Alimentos', subcategory: 'Infusiones' },
  'azucares y dulces': { category: 'Almacén y Alimentos', subcategory: 'Azúcares y dulces' },
  'computacion': { category: 'Electrónica y Electrodomésticos', subcategory: 'Computación' },
  'cuidado personal y salud': { category: 'Limpieza e Higiene', subcategory: 'Higiene personal' },
  'aspiradoras y lustradoras': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños' },
  'accesorios computacion': { category: 'Electrónica y Electrodomésticos', subcategory: 'Accesorios electrónicos' },
  'anafes': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos grandes' },
  'soportes led': { category: 'Electrónica y Electrodomésticos', subcategory: 'Accesorios electrónicos' },
  'calefaccion': { category: 'Electrónica y Electrodomésticos', subcategory: 'Climatización' },
  'calefones y termotanques': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos grandes' },
  'cocinas': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos grandes' },
  'freezer': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos grandes' },
  'balanza de cocina': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños' },
  'corta cabello': { category: 'Limpieza e Higiene', subcategory: 'Higiene personal' },
  'balanzas de bano': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños' },
  'afeitadoras y corta barba': { category: 'Limpieza e Higiene', subcategory: 'Higiene personal' },
  'lavado': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos grandes' },
  'pequenos electrodomesticos': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños' },
  'pavas electricas': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños' },
  'otras salsas': { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados' },
}

function matches(text, term) {
  const normalizedTerm = normalize(term).trim()
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\b${escapedTerm.replace(/\s+/g, '\\s+')}(?:s|es)?\\b`).exec(text)
  return match ? match.index : -1
}

const SECONDARY_DESCRIPTOR_PREFIX = /(?:^|\s)(?:(?:sabor(?:es)?|aroma)(?:\s+\w+){0,3}|con|sin|al|a la|a los|a las|relleno de)\s+$/
const SECONDARY_AFTER_DE_TERMS = new Set([
  'arroz', 'avena', 'carne', 'chocolate', 'garbanzo', 'leche', 'maiz', 'tomate',
  'dulce de leche', 'verdura', 'verduras', 'vino',
])
const SECONDARY_AFTER_PARA_TERMS = new Set([
  'horno electrico', 'horno microondas', 'microondas', 'heladera', 'lavarropas', 'lavavajillas',
])
const PRESERVED_PRODUCE_PATTERN = /\b(?:verduras?|vegetales?|frutas?|tomates?|papas?|cebollas?|zanahorias?|arvejas?|choclos?|maiz)\b.*\b(?:en conserva|conserva|en lata|lata|salmuera|encurtid[oa]s?|en vinagre|al natural|escabeche)\b|\b(?:en conserva|conserva|en lata|lata|salmuera|encurtid[oa]s?|en vinagre|al natural|escabeche)\b.*\b(?:verduras?|vegetales?|frutas?|tomates?|papas?|cebollas?|zanahorias?|arvejas?|choclos?|maiz)\b/
const MINIMUM_CONFIDENCE_SCORE = 60
const HIGH_CONFIDENCE_SCORE = 90
const AMBIGUITY_SCORE_MARGIN = 10
const DESCRIPTION_MAX_SCORE = 65
const PRODUCT_TYPE_CONTEXT_RULES = [...PRIMARY_TYPE_RULES, ...rules]

function hasProductTypeBeforeSecondaryDescriptor(text, index) {
  const prefix = text.slice(0, index)
  const clauseStart = Math.max(
    prefix.lastIndexOf(';'),
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('!'),
    prefix.lastIndexOf('?'),
  ) + 1
  const clause = prefix.slice(clauseStart)
  const descriptorMatches = [...clause.matchAll(/\b(?:sabor(?:es)?|aroma)\b/g)]
  const descriptor = descriptorMatches[descriptorMatches.length - 1]
  if (!descriptor) return false

  const productTypePrefix = clause.slice(0, descriptor.index)
  return PRODUCT_TYPE_CONTEXT_RULES.some((rule) => (
    rule.terms.some((candidateTerm) => matches(productTypePrefix, candidateTerm) >= 0)
  ))
}

function isFreezerAccessory(text, index = null) {
  if (index === null) {
    return /\b(?:bolsas?|organizad(?:or|ores)|accesorios?)\s+para\s+freezer\b/.test(text)
  }

  const accessoryPrefix = text.slice(0, index)
  return /(?:^|\s)(?:bolsas?|organizad(?:or|ores)|accesorios?)\s+para\s+$/.test(accessoryPrefix)
    && text.slice(index).startsWith('freezer')
}

function isSecondaryOccurrence(text, index, term) {
  const prefix = text.slice(0, index)
  const normalizedTerm = normalize(term).trim()
  const suffix = text.slice(index + normalizedTerm.length).replace(/^(?:s|es)(?=\s|$)/, '')
  return SECONDARY_DESCRIPTOR_PREFIX.test(prefix)
    || hasProductTypeBeforeSecondaryDescriptor(text, index)
    || (normalizedTerm === 'chocolate'
      && PRODUCT_TYPE_CONTEXT_RULES.some((rule) => rule.terms.some((candidateTerm) => (
        matches(prefix, candidateTerm) >= 0
      ))))
    || (normalizedTerm === 'papa' && /\bpapas?\s+(?:pre)?fritas?\b/.test(text))
    || (normalizedTerm === 'freezer' && isFreezerAccessory(text, index))
    || (SECONDARY_AFTER_DE_TERMS.has(normalizedTerm)
      && /(?:^|\s)de\s+$/.test(prefix))
    || (normalizedTerm === 'leche'
      && /^\s+y\s+tonico\s+micelar\b/.test(suffix))
    || (['aceite', 'aceites'].includes(normalizedTerm)
      && /(?:^|\s)en\s+$/.test(prefix))
    || (SECONDARY_AFTER_PARA_TERMS.has(normalizedTerm)
      && /(?:^|\s)para\s+$/.test(prefix))
    || (normalizedTerm === 'nacho' && /(?:^|\s)tio\s+$/.test(prefix))
    || (normalizedTerm === 'gomita' && (
      /\b(?:vitaminas?|suplementos?)\b(?:\s+\w+){0,3}\s+$/.test(prefix)
      || /^s?\s+(?:(?:de|para)\s+)?(?:las?\s+)?(?:vitaminas?|suplementos?)\b/.test(suffix)
    ))
    || (normalizedTerm === 'jalea' && /^\s+real\b/.test(suffix))
    || (normalizedTerm === 'detergente' && /^\s+en\s+polvo\b/.test(suffix))
    || (['lavavajilla', 'lavavajillas'].includes(normalizedTerm)
      && /(?:^|\s)detergente(?:\s+en\s+polvo)?(?:\s+para)?\s+$/.test(prefix))
    || (['lavavajilla', 'lavavajillas'].includes(normalizedTerm)
      && /^\s+finish\s+(?:en\s+)?polvo\b/.test(suffix))
}

function isSupersededByMoreSpecificTerm(text, candidateRules, term, index) {
  const normalizedTerm = normalize(term).trim()
  return candidateRules.some((rule) => rule.terms.some((candidateTerm) => {
    const normalizedCandidateTerm = normalize(candidateTerm).trim()
    return normalizedCandidateTerm.length > normalizedTerm.length
      && normalizedCandidateTerm.startsWith(`${normalizedTerm} `)
      && matches(text, candidateTerm) === index
  }))
}

function createCandidate(rule, score, matchedTerm, evidenceTier, index) {
  return {
    category: rule.category,
    subcategory: rule.subcategory,
    score,
    evidenceTier,
    index,
    rule: rule.rule || 'product_name_rule',
    reason: rule.reason || 'product_type_match',
    matchedTerm,
  }
}

function addBestCandidate(candidates, candidate) {
  const key = `${candidate.category}:${candidate.subcategory}`
  const previous = candidates.get(key)
  if (!previous) {
    candidates.set(key, {
      ...candidate,
      matchedTerms: [{ index: candidate.index, term: candidate.matchedTerm }],
    })
    return
  }

  const isBetter = candidate.score > previous.score
    || (candidate.score === previous.score && candidate.matchedTerm.length > previous.matchedTerm.length)
  const best = isBetter ? candidate : previous
  candidates.set(key, {
    ...best,
    matchedTerms: [
      ...(previous.matchedTerms || [{ index: previous.index, term: previous.matchedTerm }]),
      { index: candidate.index, term: candidate.matchedTerm },
    ],
  })
}

function getRuleCandidates(
  text,
  candidateRules,
  candidates,
  evidenceTier,
  fieldAdjustment = 0,
  maximumScore = Infinity,
) {
  for (const rule of candidateRules) {
    for (const term of rule.terms) {
      const index = matches(text, term)
      if (index < 0
        || isSecondaryOccurrence(text, index, term)
        || isSupersededByMoreSpecificTerm(text, candidateRules, term, index)) continue
      addBestCandidate(candidates, createCandidate(
        rule,
        Math.min((rule.priority ?? 70) + fieldAdjustment, maximumScore),
        term,
        evidenceTier,
        index,
      ))
    }
  }
}

function makeUndeterminedSuggestion(status, reason, candidates = []) {
  return {
    category: null,
    subcategory: null,
    confidence: 'low',
    reason,
    rule: null,
    status,
    alternatives: candidates.map(({ category, subcategory, rule, matchedTerm }) => ({
      category,
      subcategory,
      rule,
      matchedTerm,
    })),
  }
}

function areCoordinatedProductTypes(text, first, second) {
  if (first.category === second.category && first.subcategory === second.subcategory) return false
  const firstMatches = first.matchedTerms || [{ index: first.index, term: first.matchedTerm }]
  const secondMatches = second.matchedTerms || [{ index: second.index, term: second.matchedTerm }]
  return firstMatches.some((firstMatch) => secondMatches.some((secondMatch) => {
    const [left, right] = firstMatch.index <= secondMatch.index
      ? [firstMatch, secondMatch]
      : [secondMatch, firstMatch]
    const connector = text.slice(left.index + normalize(left.term).length, right.index)
    return /^\s*(?:y|e)\s*$|^\s*[+/&]\s*$/.test(connector)
  }))
}

function suggestCatalogMapping(product) {
  const nameTypeCandidates = new Map()
  const nameFallbackCandidates = new Map()
  const presentationCandidates = new Map()
  const sourceCandidates = new Map()
  const descriptionCandidates = new Map()
  const nameText = normalize(product.name)
  const presentationText = normalize([product.presentation, product.netContent, product.unit].filter(Boolean).join(' '))
  const descriptionText = normalize(product.description)

  getRuleCandidates(nameText, PRIMARY_TYPE_RULES, nameTypeCandidates, 3)
  getRuleCandidates(nameText, rules, nameFallbackCandidates, 2)
  getRuleCandidates(presentationText, PRIMARY_TYPE_RULES, presentationCandidates, 1, -15)
  getRuleCandidates(
    descriptionText,
    PRIMARY_TYPE_RULES,
    descriptionCandidates,
    0,
    -25,
    DESCRIPTION_MAX_SCORE,
  )

  const hasSoapProductType = /\bjabon(?:es)?\b/.test(nameText)
  const hasExplicitSoapUse = [...nameTypeCandidates.values()].some((candidate) => (
    candidate.rule === 'laundry_product_type'
    || candidate.rule === 'personal_soap_product_type'
  ))
  if (hasSoapProductType && !hasExplicitSoapUse) {
    return makeUndeterminedSuggestion(
      'insufficient_evidence',
      'soap_use_not_identified',
      [...nameTypeCandidates.values(), ...nameFallbackCandidates.values()],
    )
  }

  const frozenFriesMatch = /\bpapas?\s+(?:pre)?fritas?\b(?:\s+\w+){0,4}\s+congelad[oa]s?\b|\bcongelad[oa]s?\b(?:\s+\w+){0,4}\s+\bpapas?\s+(?:pre)?fritas?\b/.exec(nameText)
  if (frozenFriesMatch) {
    const rule = PRIMARY_TYPE_RULES.find((entry) => entry.rule === 'frozen_food_state')
    addBestCandidate(nameTypeCandidates, createCandidate(
      rule,
      rule.priority,
      'frozen_fries_with_explicit_state',
      3,
      frozenFriesMatch.index,
    ))
  }

  const preservedProduceMatch = PRESERVED_PRODUCE_PATTERN.exec(nameText)
  if (preservedProduceMatch) {
    const rule = PRIMARY_TYPE_RULES.find((entry) => entry.rule === 'preserved_produce')
    addBestCandidate(nameTypeCandidates, createCandidate(
      rule,
      rule.priority,
      'produce_in_preserve',
      3,
      preservedProduceMatch.index,
    ))
  }

  const sourceSubcategory = normalize(product.source_subcategory || product.source_category).trim()
  const sourceMapping = Object.hasOwn(sourceMappings, sourceSubcategory)
    && !(sourceSubcategory === 'freezer' && isFreezerAccessory(nameText))
    ? sourceMappings[sourceSubcategory]
    : null
  if (sourceMapping) {
    addBestCandidate(sourceCandidates, createCandidate({
      ...sourceMapping,
      rule: 'source_taxonomy_mapping',
      reason: 'source_taxonomy_evidence',
    }, 65, sourceSubcategory, 0))
  }

  const candidateTiers = [
    nameTypeCandidates,
    nameFallbackCandidates,
    presentationCandidates,
    sourceCandidates,
  ]
  const activeTierIndex = candidateTiers.findIndex((tier) => (
    [...tier.values()].some((candidate) => candidate.score >= MINIMUM_CONFIDENCE_SCORE)
  ))
  const activeCandidates = candidateTiers[activeTierIndex]
  const rankedCandidates = [...(activeCandidates?.values() || [])]
    .sort((left, right) => right.score - left.score)
  const best = rankedCandidates[0]
  if (!best || best.score < MINIMUM_CONFIDENCE_SCORE) {
    const descriptionAlternatives = [...descriptionCandidates.values()].map((candidate) => ({
      ...candidate,
      rule: 'description_supporting_evidence',
    }))
    return makeUndeterminedSuggestion(
      'insufficient_evidence',
      'no_reliable_product_type',
      [...rankedCandidates, ...descriptionAlternatives],
    )
  }

  const competingCandidates = rankedCandidates.filter((candidate) => (
    candidate.category !== best.category
    || candidate.subcategory !== best.subcategory
  )).filter((candidate) => best.score - candidate.score <= AMBIGUITY_SCORE_MARGIN)
  const coordinatedCandidates = (activeTierIndex === 0 ? [...nameFallbackCandidates.values()] : [])
    .filter((candidate) => candidate.score >= MINIMUM_CONFIDENCE_SCORE
      && areCoordinatedProductTypes(nameText, best, candidate))
  if (competingCandidates.length || coordinatedCandidates.length) {
    return makeUndeterminedSuggestion(
      'ambiguous',
      'conflicting_product_types',
      [best, ...competingCandidates, ...coordinatedCandidates],
    )
  }

  return {
    category: best.category,
    subcategory: best.subcategory,
    confidence: best.score >= HIGH_CONFIDENCE_SCORE ? 'high' : 'medium',
    reason: best.reason,
    rule: best.rule,
    status: 'determined',
    alternatives: rankedCandidates.slice(1).map(({ category, subcategory, rule, matchedTerm }) => ({
      category,
      subcategory,
      rule,
      matchedTerm,
    })),
  }
}

function suggestCatalogMappingWithExamples(product, examples = []) {
  return resolveCatalogMappingFromExamples(product, suggestCatalogMapping(product), examples)
}

module.exports = {
  buildCatalogTaxonomyExamples,
  resolveCatalogMappingFromExamples,
  suggestCatalogMapping,
  suggestCatalogMappingWithExamples,
}
