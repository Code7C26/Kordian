import assert from 'node:assert/strict';
import { findComparableReferences, normalizePrice } from './comparableProducts.js';

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
assert.equal(findComparableReferences(products[0], products.slice(0, 4).concat(products[4]), classifications).references.length, 4);
const catalogProducts = [
  { id: 'catalog-1', name: 'Producto principal', subcategory: 'Golosinas y snacks', offers: [{ cash_price: 1000 }] },
  { id: 'catalog-2', name: 'Otro producto', subcategory: 'Golosinas y snacks', offers: [{ cash_price: 1100 }] },
];
assert.equal(findComparableReferences(catalogProducts[0], catalogProducts, new Map()).references.length, 1);
assert.equal(findComparableReferences(products[0], [products[0], products[5]], classifications).references.length, 0);
assert.equal(normalizePrice({ name: 'Arroz 1kg' }, 2000).unitPrice, 2000);

console.log('comparableProducts test passed');
