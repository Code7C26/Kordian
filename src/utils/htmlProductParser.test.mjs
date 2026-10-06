import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDiscoProductDetailHtml } from '../../server/services/discoImporter.js';

test('Disco detail HTML uses the shared JSON-LD parser and common product shape', () => {
  const item = {
    '@type': 'Product',
    name: 'Yerba Taragui 1kg',
    brand: { name: 'Taragui' },
    offers: { price: 2450 },
    sku: '1001',
    gtin13: '7790000001001',
    category: 'Infusiones',
    image: 'https://example.com/yerba.png',
    url: 'https://www.disco.com.ar/yerba-taragui',
  };
  const html = `<script type="application/ld+json">${JSON.stringify(item)}</script>`;
  const report = parseDiscoProductDetailHtml(html);

  assert.equal(report.jsonLdProductCount, 1);
  assert.equal(report.discarded.length, 0);
  assert.equal(report.products.length, 1);
  assert.equal(report.products[0].source, 'disco');
  assert.equal(report.products[0].name, 'Yerba Taragui 1kg');
  assert.equal(report.products[0].price, 2450);
  assert.equal(report.products[0].sourceCategory, 'Infusiones');
  assert.equal(report.products[0].sourceSku, '1001');
});
