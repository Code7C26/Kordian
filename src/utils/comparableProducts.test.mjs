import assert from 'node:assert/strict';
import { createComparableProductIndex, extractMeasure, findComparableReferences, normalizePrice } from './comparableProducts.js';

const products = [
  { id: '1', name: 'Alfajor Jorgito Chocolate 55g', brand: 'Jorgito', offers: [{ cash_price: 1000 }] },
  { id: '2', name: 'Alfajor Terrabusi Chocolate 55g', brand: 'Terrabusi', offers: [{ cash_price: 1100 }] },
  { id: '3', name: 'Alfajor Guaymallen Chocolate 60g', brand: 'Guaymallen', offers: [{ cash_price: 1050 }] },
  { id: '5', name: 'Alfajor Jorgito Dulce de Leche 55g', brand: 'Jorgito', offers: [{ cash_price: 980 }] },
  { id: '6', name: 'Galletitas Chocolate 100g', brand: 'Otra marca', offers: [{ cash_price: 1200 }] },
  { id: '4', name: 'Leche La Serenisima 1L', brand: 'La Serenisima', offers: [{ cash_price: 900 }] },
];
const classifications = new Map([
  ['1', { categoryId: 'alimentos', subcategoryId: 'golosinas', type: 'Alfajor', variant: 'chocolate' }],
  ['2', { categoryId: 'alimentos', subcategoryId: 'golosinas', type: 'Alfajor', variant: 'chocolate' }],
  ['3', { categoryId: 'alimentos', subcategoryId: 'golosinas', type: 'Alfajor', variant: 'chocolate' }],
  ['5', { categoryId: 'alimentos', subcategoryId: 'golosinas', type: 'Alfajor', variant: 'dulce de leche' }],
  ['6', { categoryId: 'alimentos', subcategoryId: 'golosinas', type: 'Galletitas', variant: 'chocolate' }],
  ['4', { categoryId: 'alimentos', subcategoryId: 'lacteos', type: 'Leche', variant: null }],
]);

const reference = findComparableReferences(products[0], products.slice(0, 4), classifications);
assert.equal(reference.level, 'grupo_comparable');
assert.equal(reference.references.length, 3);
assert.ok(reference.referencePrice > 0);
const expandedProducts = products.slice(0, 4).concat(products[4]);
const expandedIndex = createComparableProductIndex(expandedProducts, classifications);
const indexedReferences = findComparableReferences(products[0], expandedProducts, classifications, expandedIndex);
assert.deepEqual(indexedReferences, findComparableReferences(products[0], expandedProducts, classifications));
assert.equal(indexedReferences.references.length, 3);
assert.equal(indexedReferences.references.some(({ id }) => id === '6'), false);
const catalogProducts = [
  { id: 'catalog-1', name: 'Producto principal', category: 'Alimentos', subcategory: 'Golosinas y snacks', offers: [{ cash_price: 1000 }] },
  { id: 'catalog-2', name: 'Otro producto', category: 'Alimentos', subcategory: 'Golosinas y snacks', offers: [{ cash_price: 1100 }] },
];
assert.equal(findComparableReferences(catalogProducts[0], catalogProducts, new Map()).references.length, 1);
const hiddenOfferProducts = [
  { id: 'target', name: 'Bebida de soja naranja 1l', category_id: 'food', subcategory_id: 'drinks', offers: [{ cash_price: 1000 }] },
  { id: 'hidden-peer', name: 'Bebida de soja manzana 1l', category_id: 'food', subcategory_id: 'drinks', offers: [{ cash_price: 301653, is_catalog_visible: false }] },
  { id: 'visible-peer', name: 'Bebida de soja natural 1l', category_id: 'food', subcategory_id: 'drinks', offers: [{ cash_price: 1200, is_catalog_visible: true }] },
];
const hiddenOfferClassifications = new Map([
  ['target', { type: 'Bebida' }],
  ['hidden-peer', { type: 'Bebida' }],
  ['visible-peer', { type: 'Bebida' }],
]);
const visibleReferences = findComparableReferences(
  hiddenOfferProducts[0],
  hiddenOfferProducts,
  hiddenOfferClassifications,
);
assert.deepEqual(visibleReferences.references.map(({ id }) => id), ['visible-peer']);
assert.equal(visibleReferences.referencePrice, 1200);
const sameNamedSubcategories = [
  { id: 'oil-1', name: 'Aceite 1l', category_id: 'food', subcategory_id: 'oils', subcategories: { id: 'oils', name: 'Otros', category_id: 'food' }, offers: [{ cash_price: 1000 }] },
  { id: 'other-1', name: 'Producto de bazar 1l', category_id: 'home', subcategory_id: 'other', subcategories: { id: 'other', name: 'Otros', category_id: 'home' }, offers: [{ cash_price: 2000 }] },
  { id: 'other-2', name: 'Otro producto de bazar 1l', category_id: 'home', subcategory_id: 'oils', subcategories: { id: 'oils', name: 'Otros', category_id: 'home' }, offers: [{ cash_price: 3000 }] },
  { id: 'oil-2', name: 'Aceite de oliva 1l', category_id: 'food', subcategory_id: 'oils', subcategories: { id: 'oils', name: 'Otros', category_id: 'food' }, offers: [{ cash_price: 1200 }] },
];
const sameNamedReferences = findComparableReferences(sameNamedSubcategories[0], sameNamedSubcategories, new Map());
assert.deepEqual(sameNamedReferences.references.map(({ id }) => id), ['oil-2']);
const sameNamedIndex = createComparableProductIndex(sameNamedSubcategories);
assert.deepEqual(
  findComparableReferences(sameNamedSubcategories[0], sameNamedSubcategories, new Map(), sameNamedIndex),
  sameNamedReferences,
);
const nameOnlySubcategory = [
  { id: 'name-only-1', name: 'Producto principal', subcategory: 'Golosinas', offers: [{ cash_price: 1000 }] },
  { id: 'name-only-2', name: 'Otro producto', subcategory: 'Golosinas', offers: [{ cash_price: 1100 }] },
];
assert.equal(findComparableReferences(nameOnlySubcategory[0], nameOnlySubcategory).level, 'inflacion_general');
assert.equal(findComparableReferences(products[0], [products[0], products[5]], classifications).references.length, 0);
const incompatibleUnits = [
  { id: 'target', name: 'Alfajor Jorgito Chocolate 55g', category_id: 'food', subcategory_id: 'sweets', offers: [{ cash_price: 1000 }] },
  { id: 'different-unit', name: 'Alfajor Jorgito Chocolate 500ml', category_id: 'food', subcategory_id: 'sweets', offers: [{ cash_price: 1000 }] },
];
const incompatibleUnitClassifications = new Map([
  ['target', { type: 'Alfajor' }],
  ['different-unit', { type: 'Alfajor' }],
]);
assert.equal(findComparableReferences(
  incompatibleUnits[0],
  incompatibleUnits,
  incompatibleUnitClassifications,
).references.length, 0);
const sameProductGroup = [
  { id: 'target-grouped', name: 'Alfajor Jorgito Chocolate 55g', category_id: 'food', subcategory_id: 'sweets', comparable_group_id: 'same-item', offers: [{ cash_price: 1000 }] },
  { id: 'same-item', name: 'Alfajor Jorgito Chocolate 55 g', category_id: 'food', subcategory_id: 'sweets', comparable_group_id: 'same-item', offers: [{ cash_price: 1100 }] },
  { id: 'peer', name: 'Alfajor Terrabusi Chocolate 55g', category_id: 'food', subcategory_id: 'sweets', offers: [{ cash_price: 1200 }] },
];
const identityReferences = findComparableReferences(
  sameProductGroup[0],
  sameProductGroup,
  new Map(),
  createComparableProductIndex(sameProductGroup),
);
assert.equal(identityReferences.referenceGroup, 'same_product');
assert.deepEqual(identityReferences.references.map(({ id }) => id), ['same-item']);
assert.equal(identityReferences.references[0].identityMatch, true);
assert.equal(normalizePrice({ name: 'Arroz 1kg' }, 2000).unitPrice, 2000);
assert.equal(extractMeasure({ name: 'Lavandina 25g 4lt' }).baseUnit, 'l');
assert.equal(extractMeasure({ name: 'Jugo en polvo 15 grs' }).normalizedAmount, 0.015);
assert.equal(extractMeasure({ name: 'Jugo listo 200cc' }).normalizedAmount, 0.2);
assert.equal(extractMeasure({ name: 'Galletitas 12 unidades' }).baseUnit, 'unit');
assert.equal(extractMeasure({ name: 'Galletitas 12 unidades' }).normalizedAmount, 12);
assert.equal(normalizePrice({ name: 'Galletitas 12 unidades' }, 240).unitPrice, 20);
