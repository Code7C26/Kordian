import {
  Apple,
  Baby,
  BookOpen,
  Dog,
  Dumbbell,
  Flower2,
  House,
  LayoutGrid,
  Package,
  Pill,
  Shirt,
  ShoppingCart,
  Sparkles,
  Tv,
  Wrench,
} from 'lucide-react'

const ICONS_BY_NAME = {
  Apple,
  Baby,
  BookOpen,
  Dog,
  Dumbbell,
  Flower2,
  House,
  LayoutGrid,
  Package,
  Pill,
  Shirt,
  ShoppingCart,
  Sparkles,
  Tv,
  Wrench,
}

export function getCategoryIcon(category) {
  const configuredIcon = ICONS_BY_NAME[category?.icon]
  if (configuredIcon) return configuredIcon

  const categoryName = `${category?.id || ''} ${category?.name || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (/farmacia|salud|medic|cuidado|belleza|perfumer/.test(categoryName)) return Pill
  if (/electro|tecnolog|electron|tv|comput|celular/.test(categoryName)) return Tv
  if (/ferreter|herramient|construccion/.test(categoryName)) return Wrench
  if (/ropa|calzado|indument|vestir/.test(categoryName)) return Shirt
  if (/mascota|animal|veterin/.test(categoryName)) return Dog
  if (/bebe|infantil|juguet/.test(categoryName)) return Baby
  if (/deport|fitness/.test(categoryName)) return Dumbbell
  if (/libro|libreria|educacion/.test(categoryName)) return BookOpen
  if (/hogar|mueble|decoracion/.test(categoryName)) return House
  if (/jardin|planta|flor/.test(categoryName)) return Flower2
  if (/supermerc|hipermercado|mercado/.test(categoryName)) return ShoppingCart
  if (/almacen|alimento|comida|bebida|verdura|fruta/.test(categoryName)) return Apple
  if (/limpieza/.test(categoryName)) return Sparkles
  if (/compra/.test(categoryName)) return ShoppingCart
  return Package
}
