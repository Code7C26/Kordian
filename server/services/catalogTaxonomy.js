const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')

const rules = [
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['alfajor', 'golosina', 'chupetin', 'chicle', 'oblea', 'snack'] },
  { category: 'Almacén y Alimentos', subcategory: 'Golosinas y snacks', terms: ['chocolate', 'bombon', 'confite'] },
  { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Lácteos', terms: ['queso', 'leche', 'yogur', 'yogurt', 'lacteo', 'manteca', 'crema'] },
  { category: 'Hogar y Otros', subcategory: 'Cocina y bazar', terms: ['extractor de jugos', 'extractor jugos'] },
  { category: 'Almacén y Alimentos', subcategory: 'Bebidas', terms: ['cerveza', 'gaseosa', 'jugo', 'agua mineral', 'vino', 'licor', 'vodka', 'soda', 'bebida'] },
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
  { category: 'Almacén y Alimentos', subcategory: 'Pastas y harinas', terms: ['fideo', 'pasta', 'harina', 'semola', 'premezcla'] },
  { category: 'Almacén y Alimentos', subcategory: 'Aceites, condimentos y aderezos', terms: ['aceite', 'vinagre', 'mayonesa', 'ketchup', 'mostaza', 'sal ', 'pimienta', 'condimento'] },
  { category: 'Almacén y Alimentos', subcategory: 'Conservas y alimentos preparados', terms: ['atun', 'sardina', 'conserva', 'pure de tomate', 'tomate triturado', 'caldo', 'sopa'] },
  { category: 'Almacén y Alimentos', subcategory: 'Galletitas y productos de panificación', terms: ['galletita', 'galletitas', 'tostada', 'grisines'] },
  { category: 'Limpieza e Higiene', subcategory: 'Cuidado bucal', terms: ['pasta dental', 'dentifrico', 'cepillo dental', 'enjuague bucal'] },
  { category: 'Limpieza e Higiene', subcategory: 'Cuidado capilar', terms: ['shampoo', 'acondicionador', 'mascara capilar', 'crema para peinar'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene infantil', terms: ['pañal', 'panal', 'toallitas bebe', 'talco bebe', 'formula infantil'] },
  { category: 'Limpieza e Higiene', subcategory: 'Higiene personal', terms: ['limpieza facial', 'gel de limpieza facial', 'crema facial', 'perfume', 'desodorante corporal'] },
  { category: 'Limpieza e Higiene', subcategory: 'Lavado de ropa', terms: ['jabon para ropa', 'detergente para ropa', 'suavizante', 'quitamanchas'] },
  { category: 'Limpieza e Higiene', subcategory: 'Limpieza de cocina', terms: ['detergente', 'esponja', 'lavavajilla', 'limpieza cocina'] },
  { category: 'Limpieza e Higiene', subcategory: 'Limpieza del hogar', terms: ['limpiador', 'limpieza', 'ambientador', 'rejilla', 'esponja', 'sahumerio', 'sopapa', 'escoba', 'trapo'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Televisores y entretenimiento', terms: ['smart tv', 'televisor', 'televis', 'roku', 'streaming'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Climatización', terms: ['aire acondicionado', 'ventilador', 'caloventor', 'estufa'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos grandes', terms: ['microondas', 'horno', 'heladera', 'lavarropas', 'lavavajillas'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Electrodomésticos pequeños', terms: ['licuadora', 'pava electrica', 'freidora', 'tostadora', 'cafetera', 'batidora'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Telefonía', terms: ['celular', 'telefono', 'smartphone'] },
  { category: 'Electrónica y Electrodomésticos', subcategory: 'Audio', terms: ['parlante', 'auricular', 'barra de sonido', 'audio'] },
  { category: 'Hogar y Otros', subcategory: 'Mascotas', terms: ['perro', 'gato', 'mascota', 'alimento balanceado', 'arena sanitaria'] },
  { category: 'Hogar y Otros', subcategory: 'Herramientas', terms: ['taladro', 'herramienta', 'destornillador', 'llave', 'martillo'] },
  { category: 'Hogar y Otros', subcategory: 'Juguetes', terms: ['juguete', 'muñeca', 'muneca', 'pelota', 'juego de mesa'] },
]

function matches(text, term) {
  const normalizedTerm = normalize(term).trim()
  if (normalizedTerm.length <= 3) return new RegExp(`\\b${normalizedTerm}\\b`).test(text)
  return text.includes(normalizedTerm)
}

function suggestCatalogMapping(product) {
  const text = normalize([product.name, product.brand, product.source_category, product.source_subcategory].join(' '))
  const directMatch = rules.find((rule) => rule.terms.some((term) => matches(text, term)))
  if (directMatch) return directMatch

  // Disco often supplies the normalized subcategory even when its source
  // category is a path such as "/Almacén/". Use that value as a fallback.
  const sourceSubcategory = normalize(product.source_subcategory).trim()
  const sourceMappings = {
    'lacteos': { category: 'Alimentos Frescos y Refrigerados', subcategory: 'Lácteos' },
    'infusiones': { category: 'Almacén y Alimentos', subcategory: 'Infusiones' },
    'azucares y dulces': { category: 'Almacén y Alimentos', subcategory: 'Azúcares y dulces' },
    'computacion': { category: 'Electrónica y Electrodomésticos', subcategory: 'Computación' },
  }
  return sourceMappings[sourceSubcategory] || null
}

module.exports = { suggestCatalogMapping }
