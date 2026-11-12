import assert from 'node:assert/strict';
import { buildProductsQuery } from './catalogQuery.js';

assert.equal(
  buildProductsQuery({
    page: 1,
    limit: 20,
    searchQuery: 'leche',
    category: 'todos',
    store: 'todos',
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
  }).toString(),
  'page=1&limit=20&category=cat-1&supermarket=disco'
);

console.log('catalogQuery test passed');
