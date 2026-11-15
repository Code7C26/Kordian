import assert from 'node:assert/strict';
import {
  appendUniqueProducts,
  buildFavoriteProductsQueries,
  buildProductsQuery,
} from './catalogQuery.js';

assert.equal(
  buildProductsQuery({
    page: 1,
    limit: 20,
    searchQuery: 'leche',
    category: 'todos',
    store: 'todos',
    sortBy: 'default',
  }).toString(),
  'page=1&limit=20&search=leche&catalogOnly=true&maxPrice=1000000'
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
  'page=1&limit=20&category=cat-1&supermarket=disco&sort=price-asc&catalogOnly=true&maxPrice=1000000'
);

console.log('catalogQuery test passed');

assert.equal(
  buildProductsQuery({ sortBy: 'discount' }).toString(),
  'page=1&limit=20&sort=discount-desc&catalogOnly=true&maxPrice=1000000'
);

assert.equal(
  buildProductsQuery({
    page: 3,
    subcategory: 'sub-2',
    status: 'OFERTA',
    favoritesOnly: true,
    favoriteIds: [12, 3, 12],
  }).toString(),
  'page=3&limit=20&subcategory=sub-2&status=OFERTA&favoritesOnly=true&favorites=12%2C3&catalogOnly=true&maxPrice=1000000'
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

const favoriteQueries = buildFavoriteProductsQueries([
  ...Array.from({ length: 205 }, (_, index) => index + 1),
  1,
  'invalid',
]);
const favoriteBatches = favoriteQueries.map((query) => query.get('favorites').split(',').map(Number));
assert.deepEqual(favoriteBatches.map((batch) => batch.length), [100, 100, 5]);
assert.deepEqual(
  favoriteBatches.flat().sort((left, right) => left - right),
  Array.from({ length: 205 }, (_, index) => index + 1),
);
assert.ok(favoriteQueries.every((query, index) => (
  query.get('favoritesOnly') === 'true'
  && query.get('catalogOnly') === 'true'
  && Number(query.get('limit')) === favoriteBatches[index].length
)));
