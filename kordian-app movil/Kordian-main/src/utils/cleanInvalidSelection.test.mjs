import assert from 'node:assert/strict';
import { sanitizeProductSelections } from './cleanInvalidSelection.js';

const favorites = ['p1', 'missing-id', 'p3'];
const basket = [
  { id: 'b1', product: { id: 'p1' }, quantity: 1 },
  { id: 'b2', product: { id: 'missing-id' }, quantity: 2 },
  { id: 'b3', product: { id: 'p3' }, quantity: 1 },
];

const result = sanitizeProductSelections({
  favorites,
  basket,
  productIds: new Set(['p1', 'p3']),
});

assert.deepEqual(result.favorites, ['p1', 'p3']);
assert.deepEqual(result.basket, [
  { id: 'b1', product: { id: 'p1' }, quantity: 1 },
  { id: 'b3', product: { id: 'p3' }, quantity: 1 },
]);

console.log('cleanInvalidSelection test passed');
