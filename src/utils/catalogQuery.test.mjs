import assert from 'node:assert/strict';
import { appendUniqueProducts, buildProductsQuery } from './catalogQuery.js';

assert.equal(
  buildProductsQuery({
    page: 1,
    limit: 20,
    searchQuery: 'leche',
    category: 'todos',
    store: 'todos',
    sortBy: 'default',
  }).toString(),
  'page=1&limit=20&search=leche'
);

assert.equal(
  buildProductsQuery({
    page: 1,
    limit: 20,
    searchQuery: '  ',
    category: 'cat-1',
    store: 'disco',
    sortBy: 'price-asc',
  }).toString(),
  'page=1&limit=20&category=cat-1&supermarket=disco&sort=price-asc'
);

console.log('catalogQuery test passed');

assert.equal(
  buildProductsQuery({ sortBy: 'discount' }).toString(),
  'page=1&limit=20&sort=discount-desc'
);

assert.deepEqual(
  appendUniqueProducts(
    [{ id: 18098, name: 'Yerba Nobleza Gaucha', offers: ['Mami', 'Disco'] }],
    [
      { id: 18098, name: 'Yerba Nobleza Gaucha', offers: ['Mami', 'Disco'] },
      { id: 20000, name: 'Otro producto' },
    ],
  ).map((product) => product.id),
  [18098, 20000],
);
