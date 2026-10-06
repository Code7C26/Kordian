import assert from 'node:assert/strict';
import { suggestTaxonomy } from './taxonomy.js';

const alfajor = suggestTaxonomy({
  name: 'Alfajor Jorgito Chocolate 55g',
  brand: 'Jorgito',
  description: 'Alfajor relleno de dulce de leche',
});

assert.equal(alfajor.categoryId, 'alimentos');
assert.equal(alfajor.subcategoryId, 'golosinas');
assert.equal(alfajor.type, 'Alfajor');
assert.equal(alfajor.brand, 'Jorgito');
assert.equal(alfajor.variant, 'chocolate');
assert.equal(alfajor.presentation, '55g');
assert.equal(alfajor.confidence, 'alta');
assert.equal(alfajor.subcategoryId, 'golosinas');

const unknown = suggestTaxonomy({ name: 'Producto especial', brand: 'Jorgito' });
assert.equal(unknown.categoryId, null);
assert.equal(unknown.confidence, 'baja');

console.log('taxonomy test passed');
