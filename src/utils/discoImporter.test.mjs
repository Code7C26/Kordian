import assert from 'node:assert/strict';
import { normalizeDiscoProduct } from '../../server/services/discoImporter.js';

const yerba = normalizeDiscoProduct({
  productId: '1001',
  productName: 'Yerba Mate Taragui 1kg',
  brand: 'Taragui',
  categories: ['Abarrotes', 'Infusiones'],
  items: [{
    itemId: 'item-1001',
    ean: '1111',
    images: [{ imageUrl: 'https://example.com/yerba.png' }],
    sellers: [{
      sellerName: 'Disco',
      commertialOffer: { Price: 2450, IsAvailable: true }
    }]
  }]
});

assert.equal(yerba.proposedCategory, 'Almacén y Alimentos');
assert.equal(yerba.proposedSubcategory, 'Infusiones');

const leche = normalizeDiscoProduct({
  productId: '2002',
  productName: 'Leche Entera La Serenísima 1L',
  brand: 'La Serenísima',
  categories: ['Lácteos'],
  items: [{
    itemId: 'item-2002',
    ean: '2222',
    images: [{ imageUrl: 'https://example.com/leche.png' }],
    sellers: [{
      sellerName: 'Disco',
      commertialOffer: { Price: 980, IsAvailable: true }
    }]
  }]
});

assert.equal(leche.proposedCategory, 'Alimentos Frescos y Refrigerados');
assert.equal(leche.proposedSubcategory, 'Lácteos');

const unavailable = normalizeDiscoProduct({
  productId: '3003',
  productName: 'Actimel 100g',
  categories: ['Lácteos'],
  items: [{
    itemId: 'item-3003',
    sellers: [{
      sellerName: 'Disco',
      commertialOffer: { Price: 489.07, PriceToken: 'invalid', IsAvailable: false },
    }],
  }],
});

assert.equal(unavailable.available, false);

const beverageWithCentToken = normalizeDiscoProduct({
  productId: '4004',
  productName: 'Jugo Listo Multifruta 200cc',
  categories: ['Bebidas'],
  items: [{
    itemId: 'item-4004',
    sellers: [{
      sellerName: 'Disco',
      commertialOffer: {
        Price: 950,
        PriceToken: 'eyJhbGciOiJ9.eyJkYXRhIjp7InByaWNlIjo5NTAwMH19.signature',
        IsAvailable: true,
      },
    }],
  }],
});

assert.equal(beverageWithCentToken.price, 950);

console.log('discoImporter availability test passed');

console.log('discoImporter mapping test passed');
