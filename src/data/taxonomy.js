export const INITIAL_TAXONOMY = [
  {
    id: 'alimentos',
    name: 'Alimentos',
    subcategories: [
      { id: 'almacen', name: 'Almacen' },
      { id: 'lacteos', name: 'Lacteos' },
      { id: 'carnes', name: 'Carnes' },
      { id: 'frutas-verduras', name: 'Frutas y verduras' },
      { id: 'bebidas', name: 'Bebidas' },
      { id: 'golosinas', name: 'Golosinas' },
      { id: 'panaderia', name: 'Panaderia' },
      { id: 'congelados', name: 'Congelados' },
    ],
  },
  {
    id: 'limpieza',
    name: 'Limpieza',
    subcategories: [
      { id: 'limpieza-hogar', name: 'Limpieza del hogar' },
      { id: 'lavado-ropa', name: 'Lavado de ropa' },
      { id: 'lavavajillas', name: 'Lavavajillas' },
      { id: 'desinfeccion', name: 'Desinfeccion' },
    ],
  },
  {
    id: 'higiene-cuidado-personal',
    name: 'Higiene y cuidado personal',
    subcategories: [
      { id: 'higiene-bucal', name: 'Higiene bucal' },
      { id: 'cuidado-corporal', name: 'Cuidado corporal' },
      { id: 'cabello', name: 'Cabello' },
      { id: 'higiene-personal', name: 'Higiene personal' },
    ],
  },
  {
    id: 'salud',
    name: 'Salud',
    subcategories: [
      { id: 'medicamentos', name: 'Medicamentos' },
      { id: 'cuidado-salud', name: 'Cuidado de la salud' },
      { id: 'primeros-auxilios', name: 'Primeros auxilios' },
    ],
  },
  {
    id: 'ropa-calzado',
    name: 'Ropa y calzado',
    subcategories: [
      { id: 'indumentaria', name: 'Indumentaria' },
      { id: 'calzado', name: 'Calzado' },
      { id: 'ropa-interior', name: 'Ropa interior' },
      { id: 'accesorios', name: 'Accesorios' },
    ],
  },
  {
    id: 'electrodomesticos-tecnologia',
    name: 'Electrodomesticos y tecnologia',
    subcategories: [
      { id: 'electrodomesticos', name: 'Electrodomesticos' },
      { id: 'tecnologia', name: 'Tecnologia' },
      { id: 'informatica', name: 'Informatica' },
      { id: 'accesorios-tecnologia', name: 'Accesorios' },
    ],
  },
  {
    id: 'hogar',
    name: 'Hogar',
    subcategories: [
      { id: 'cocina', name: 'Cocina' },
      { id: 'bano', name: 'Bano' },
      { id: 'muebles', name: 'Muebles' },
      { id: 'decoracion', name: 'Decoracion' },
      { id: 'herramientas', name: 'Herramientas' },
    ],
  },
]

const classificationRules = [
  { category: 'alimentos', subcategory: 'golosinas', type: 'Alfajor', terms: ['alfajor'] },
  { category: 'alimentos', subcategory: 'golosinas', type: 'Chocolate', terms: ['chocolate'] },
  { category: 'alimentos', subcategory: 'golosinas', type: 'Caramelo', terms: ['caramelo'] },
  { category: 'alimentos', subcategory: 'golosinas', type: 'Chicle', terms: ['chicle'] },
  { category: 'alimentos', subcategory: 'lacteos', type: 'Leche', terms: ['leche'] },
  { category: 'alimentos', subcategory: 'lacteos', type: 'Yogur', terms: ['yogur'] },
  { category: 'alimentos', subcategory: 'lacteos', type: 'Queso', terms: ['queso'] },
  { category: 'alimentos', subcategory: 'bebidas', type: 'Bebida', terms: ['agua', 'gaseosa', 'jugo', 'cerveza', 'vino', 'coca'] },
  { category: 'alimentos', subcategory: 'almacen', type: 'Arroz', terms: ['arroz'] },
  { category: 'limpieza', subcategory: 'lavado-ropa', type: 'Lavado de ropa', terms: ['jabon', 'detergente', 'suavizante'] },
  { category: 'limpieza', subcategory: 'desinfeccion', type: 'Desinfeccion', terms: ['lavandina', 'desinfectante'] },
  { category: 'higiene-cuidado-personal', subcategory: 'higiene-bucal', type: 'Higiene bucal', terms: ['dentifrico', 'pasta dental', 'cepillo dental'] },
  { category: 'higiene-cuidado-personal', subcategory: 'cabello', type: 'Cuidado capilar', terms: ['shampoo', 'acondicionador'] },
  { category: 'salud', subcategory: 'medicamentos', type: 'Medicamento', terms: ['medicamento', 'alcohol etilico', 'analgesico', 'vitamina', 'jarabe', 'tafirol'] },
  { category: 'electrodomesticos-tecnologia', subcategory: 'electrodomesticos', type: 'Electrodomestico', terms: ['electrodomestico', 'pava electrica', 'licuadora', 'heladera'] },
]

const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

export function suggestTaxonomy(product) {
  const searchableText = normalize([
    product.name,
    product.brand,
    product.description,
    product.variant,
    product.presentation,
    product.subcategory,
  ].join(' '))
  const match = classificationRules.find((rule) => rule.terms.some((term) => searchableText.includes(normalize(term))))

  const presentation = searchableText.match(/\b(\d+(?:[.,]\d+)?\s*(?:kg|g|mg|l|ml|cc|un(?:idad(?:es)?)?|u))\b/i)?.[1] || product.presentation || null
  const variantTerms = ['chocolate', 'dulce de leche', 'vainilla', 'frutilla', 'triple', 'light', 'sin tacc']
  const variant = variantTerms.find((term) => searchableText.includes(normalize(term))) || product.variant || null
  const brand = product.brands?.name || product.brand || null

  if (!match) {
    return {
      confidence: 'baja',
      categoryId: null,
      subcategoryId: null,
      type: null,
      brand,
      variant,
      presentation,
      reason: 'No se encontró una coincidencia suficiente en la información disponible.',
    }
  }

  return {
    confidence: presentation && (brand || variant) ? 'alta' : 'media',
    categoryId: match.category,
    subcategoryId: match.subcategory,
    type: match.type,
    brand,
    variant,
    presentation,
    reason: `Coincide con el tipo ${match.type} por la información del producto.`,
  }
}
