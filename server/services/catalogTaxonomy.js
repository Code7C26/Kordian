const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

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
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['nacho', 'papas fritas', 'papa frita', 'palito sabor', 'palitos sabor', 'palito salado', 'palitos salados'] },
  { category: 'Almacén y Alimentos', subcategory: 'Pastas y harinas', terms: ['ñoqui'] },
  { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados', terms: ['aceituna', 'sopa'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Lácteos', terms: ['queso', 'leche', 'yogur', 'yogurt', 'lacteo', 'lactea', 'bebida lactea', 'manteca'] },
  { category: 'Hogar y Otros', subcategory: 'Cocina y bazar', terms: ['extractor de jugos', 'extractor jugos'] },
  { category: 'Almacén y Alimentos', subcategory: 'Bebidas', terms: ['cerveza', 'gaseosa', 'jugo', 'agua mineral', 'vino', 'licor', 'vodka', 'soda', 'bebida', 'isotonico', 'gatorade'] },
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
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Congelados', terms: ['congelado', 'nugget', 'papas fritas'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['alfajor', 'chocolate', 'caramelo', 'chicle', 'chupetin', 'golosina', 'snack', 'oblea', 'papas fritas'] },
  { category: 'Almacén y Alimentos', subcategory: 'Granos, cereales y legumbres', terms: ['arroz', 'avena', 'lenteja', 'garbanzo', 'poroto', 'cereal', 'quinoa'] },
  { category: 'Almacén y Alimentos', subcategory: 'Pastas y harinas', terms: ['fideo', 'harina', 'semola', 'premezcla'] },
  { category: 'Almacén y Alimentos', subcategory: 'Aceites, condimentos y aderezos', terms: ['aceite', 'vinagre', 'mayonesa', 'ketchup', 'mostaza', 'sal ', 'pimienta', 'condimento'] },
  { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados', terms: ['atun', 'sardina', 'conserva', 'pure de tomate', 'tomate triturado', 'caldo', 'sopa'] },
  { category: 'Almacén y Alimentos', subcategory: 'Galletitas y productos de panificación', terms: ['galletita', 'galletitas', 'tostada', 'grisines'] },
  { category: 'Limpieza e Higiene', subcategory: 'Cuidado bucal', terms: ['pasta dental', 'dentifrico', 'cepillo dental', 'enjuague bucal'] },
  { category: 'Limpieza e Higiene', subcategory: 'Cuidado capilar', terms: ['shampoo', 'acondicionador', 'mascara capilar', 'crema para peinar'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene infantil', terms: ['pañal', 'panal', 'toallitas bebe', 'talco bebe', 'formula infantil'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene personal', terms: ['limpieza facial', 'gel de limpieza facial', 'crema facial', 'perfume', 'desodorante corporal'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene personal', terms: ['jabon de tocador', 'desodorante hombre', 'desodorante'] },
  { category: 'Limpieza e Higiene', subcategory: 'Lavado de ropa', terms: ['jabon para ropa', 'detergente para ropa', 'suavizante', 'quitamanchas'] },
  { category: 'Limpieza e Higiene', subcategory: 'Limpieza de cocina', terms: ['detergente', 'esponja', 'lavavajilla', 'limpieza cocina'] },
  { category: 'Limpieza e Higiene', subcategory: 'Limpieza del hogar', terms: ['limpiador', 'limpieza', 'ambientador', 'rejilla', 'esponja', 'sahumerio', 'sopapa', 'escoba', 'trapo'] },
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
    priority: 125,
    terms: ['desodorante de ambiente', 'desodorante ambiental'],
  },
  {
    rule: 'laundry_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Lavado de ropa',
    priority: 115,
    terms: ['jabon para ropa', 'detergente para ropa', 'suavizante', 'quitamanchas'],
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
    terms: ['congelado', 'nugget', 'papas prefritas', 'papas fritas congeladas', 'papas fritas mccain'],
  },
  {
    rule: 'snack_product_type',
    category: 'Almacén y Alimentos',
    subcategory: 'Golosinas y snacks',
    priority: 120,
    terms: [
      'snack salado', 'snacks salados', 'nacho', 'nachos', 'palito sabor',
      'palitos sabor', 'palito salado', 'palitos salados', 'papas fritas',
      'papas fritas pringles',
      'papas fritas snack', 'papas fritas en tubo', 'tostaditas de arroz',
      'mani pelado salado', 'mani frito salado', 'mani pelado y salado',
      'mani con cascara', 'mani pelado tostado y salado', 'chizitos de maiz',
      'chips de batatas', 'maicitos', 'baguetin sabor pizza', 'takis', 'cheetos',
    ],
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
    terms: ['horno electrico', 'horno microondas', 'microondas', 'heladera', 'lavarropas', 'lavavajillas'],
  },
  {
    rule: 'oral_care_product_type',
    category: 'Limpieza e Higiene',
    subcategory: 'Cuidado bucal',
    priority: 125,
    terms: ['pasta dental', 'pasta de dientes', 'dentifrico', 'cepillo dental', 'enjuague bucal'],
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
  'freezer': { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños' },
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

const SECONDARY_DESCRIPTOR_PREFIX = /(?:^|\s)(?:(?:sabor(?:es)?|aroma)(?:\s+\w+){0,3}|con|al|a la|a los|a las|relleno de)\s+$/
const PRESERVED_PRODUCE_PATTERN = /\b(?:verduras?|vegetales?|frutas?|tomates?|papas?|cebollas?|zanahorias?|arvejas?|choclos?|maiz)\b.*\b(?:en conserva|conserva|en lata|lata|salmuera|encurtid[oa]s?|en vinagre|al natural|escabeche)\b|\b(?:en conserva|conserva|en lata|lata|salmuera|encurtid[oa]s?|en vinagre|al natural|escabeche)\b.*\b(?:verduras?|vegetales?|frutas?|tomates?|papas?|cebollas?|zanahorias?|arvejas?|choclos?|maiz)\b/
const MINIMUM_CONFIDENCE_SCORE = 60
const HIGH_CONFIDENCE_SCORE = 90
const AMBIGUITY_SCORE_MARGIN = 10

function isSecondaryOccurrence(text, index, term) {
  const prefix = text.slice(0, index)
  return SECONDARY_DESCRIPTOR_PREFIX.test(prefix)
    || (['aceite', 'aceites'].includes(normalize(term).trim())
      && /(?:^|\s)en\s+$/.test(prefix))
}

function createCandidate(rule, score, matchedTerm) {
  return {
    category: rule.category,
    subcategory: rule.subcategory,
    score,
    rule: rule.rule || 'product_name_rule',
    reason: rule.reason || 'product_type_match',
    matchedTerm,
  }
}

function addBestCandidate(candidates, candidate) {
  const key = `${candidate.category}:${candidate.subcategory}`
  const previous = candidates.get(key)
  if (!previous || candidate.score > previous.score
    || (candidate.score === previous.score && candidate.matchedTerm.length > previous.matchedTerm.length)) {
    candidates.set(key, candidate)
  }
}

function getRuleCandidates(text, candidateRules, candidates, fieldAdjustment = 0) {
  for (const rule of candidateRules) {
    for (const term of rule.terms) {
      const index = matches(text, term)
      if (index < 0 || isSecondaryOccurrence(text, index, term)) continue
      addBestCandidate(candidates, createCandidate(
        rule,
        (rule.priority ?? 70) + fieldAdjustment,
        term,
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

function suggestCatalogMapping(product) {
  const candidates = new Map()
  const nameText = normalize(product.name)
  const presentationText = normalize([product.presentation, product.netContent, product.unit].filter(Boolean).join(' '))
  const descriptionText = normalize(product.description)

  getRuleCandidates(nameText, PRIMARY_TYPE_RULES, candidates)
  getRuleCandidates(nameText, rules, candidates)
  getRuleCandidates(presentationText, PRIMARY_TYPE_RULES, candidates, -15)
  getRuleCandidates(descriptionText, PRIMARY_TYPE_RULES, candidates, -25)

  if (PRESERVED_PRODUCE_PATTERN.test(nameText)) {
    const rule = PRIMARY_TYPE_RULES.find((entry) => entry.rule === 'preserved_produce')
    addBestCandidate(candidates, createCandidate(rule, rule.priority, 'produce_in_preserve'))
  }

  const sourceText = normalize([product.source_subcategory, product.source_category].filter(Boolean).join(' ')).trim()
  const sourceSubcategory = normalize(product.source_subcategory || product.source_category).trim()
  const sourceMapping = Object.hasOwn(sourceMappings, sourceSubcategory)
    ? sourceMappings[sourceSubcategory]
    : null
  if (sourceMapping) {
    addBestCandidate(candidates, createCandidate({
      ...sourceMapping,
      rule: 'source_taxonomy_mapping',
      reason: 'source_taxonomy_evidence',
    }, 65, sourceSubcategory))
  }

  getRuleCandidates(sourceText, rules, candidates, -10)

  const rankedCandidates = [...candidates.values()].sort((left, right) => right.score - left.score)
  const best = rankedCandidates[0]
  if (!best || best.score < MINIMUM_CONFIDENCE_SCORE) {
    return makeUndeterminedSuggestion('insufficient_evidence', 'no_reliable_product_type', rankedCandidates)
  }

  const competingCandidates = rankedCandidates.filter((candidate) => (
    candidate.category !== best.category
    || candidate.subcategory !== best.subcategory
  )).filter((candidate) => best.score - candidate.score <= AMBIGUITY_SCORE_MARGIN)
  if (competingCandidates.length) {
    return makeUndeterminedSuggestion('ambiguous', 'conflicting_product_types', [best, ...competingCandidates])
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

module.exports = { suggestCatalogMapping }
