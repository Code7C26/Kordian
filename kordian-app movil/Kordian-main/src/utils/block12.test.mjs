import assert from 'node:assert/strict';
import { analyzePriceBehavior, analyzePriceHistory } from './priceAnalysis.js';
import { findComparableReferences } from './comparableProducts.js';
import { calculatePriceStatus } from './priceStatus.js';
import { suggestTaxonomy } from '../data/taxonomy.js';

const now = Date.now();
const dateFromNow = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString().slice(0, 10);

const classify = (overrides = {}) => calculatePriceStatus({
  currentPrice: 1090,
  marketAverage: 1090,
  historicalAverage: 1000,
  inflationRate: 8.5,
  dataPoints: 4,
  supermarketCount: 4,
  comparableCount: 3,
  analysis: { periodDays: 90, dataQuality: { historyPoints: 4 } },
  ...overrides,
});

// A: price close to inflation, market, and comparable products.
assert.equal(classify().status, 'PRECIO_NORMAL');

// B: current price is materially below historical and market references.
assert.equal(classify({
  currentPrice: 1500,
  marketAverage: 1850,
  historicalAverage: 2000,
  inflationRate: 0,
}).status, 'OFERTA');

// C: a moderate increase alone must not become an inflated-price verdict.
assert.notEqual(classify({
  currentPrice: 1150,
  marketAverage: 1110,
  historicalAverage: 1000,
  inflationRate: 9,
  analysis: { periodDays: 60, inflationDeviation: 6, comparableDeviation: 4, dataQuality: { historyPoints: 4 } },
}).status, 'INFLADO');

// D and the historical alfajor case: 30% in 21 days is an abrupt anomaly.
const abruptHistory = [
  { date: dateFromNow(21), avgPrice: 1000 },
  { date: dateFromNow(0), avgPrice: 1300 },
];
const abruptAnalysis = analyzePriceHistory(abruptHistory, { currentPrice: 1300, inflationRate: 8.5 });
assert.ok(abruptAnalysis.signals.includes('aumento_abrupto_reciente'));
assert.ok(abruptAnalysis.increaseSpeed > 1);
assert.equal(classify({
  currentPrice: 1300,
  marketAverage: 1300,
  historicalAverage: 1000,
  recentDifference: abruptAnalysis.recentVariation,
  analysis: {
    ...abruptAnalysis,
    inflationDeviation: abruptAnalysis.inflationDeviation,
    supermarkets: { isolated: true },
    dataQuality: { historyPoints: 4 },
  },
}).status, 'INFLADO');

// A slower 30% increase is materially less fast and is not marked abrupt.
const slowAnalysis = analyzePriceHistory([
  { date: dateFromNow(180), avgPrice: 1000 },
  { date: dateFromNow(0), avgPrice: 1300 },
], { currentPrice: 1300, inflationRate: 8.5 });
assert.ok(abruptAnalysis.increaseSpeed > slowAnalysis.increaseSpeed);
assert.ok(!slowAnalysis.signals.includes('aumento_abrupto_reciente'));

// E/F: distinguish generalized movement from one isolated supermarket increase.
const generalized = analyzePriceBehavior({
  offers: [
    { price: 1100, previousPrice: 1000 },
    { price: 1090, previousPrice: 1000 },
    { price: 1110, previousPrice: 1000 },
    { price: 1100, previousPrice: 1000 },
  ],
});
assert.equal(generalized.supermarkets.generalized, true);
assert.equal(generalized.supermarkets.isolated, false);

const isolated = analyzePriceBehavior({
  offers: [
    { price: 1100, previousPrice: 1000 },
    { price: 1090, previousPrice: 1000 },
    { price: 1110, previousPrice: 1000 },
    { price: 1300, previousPrice: 1000 },
  ],
});
assert.equal(isolated.supermarkets.generalized, false);
assert.equal(isolated.supermarkets.isolated, true);

// G: one source and one short history cannot produce medium/high confidence.
const limitedData = classify({
  currentPrice: 1100,
  marketAverage: 1100,
  historicalAverage: 1000,
  dataPoints: 1,
  supermarketCount: 1,
  comparableCount: 1,
  analysis: { periodDays: 7, dataQuality: { historyPoints: 1 } },
});
assert.equal(limitedData.confidence, 'baja');

// Comparable references stay within type/category and normalize presentation units.
const products = [
  { id: 'alfajor', name: 'Alfajor Chocolate 500g', offers: [{ cash_price: 1000 }] },
  { id: 'similar', name: 'Alfajor Chocolate 1kg', offers: [{ cash_price: 1900 }] },
  { id: 'rice', name: 'Arroz 1kg', offers: [{ cash_price: 2000 }] },
];
const classifications = new Map([
  ['alfajor', { categoryId: 'alimentos', subcategoryId: 'golosinas', type: 'Alfajor', variant: 'chocolate' }],
  ['similar', { categoryId: 'alimentos', subcategoryId: 'golosinas', type: 'Alfajor', variant: 'chocolate' }],
  ['rice', { categoryId: 'alimentos', subcategoryId: 'almacen', type: 'Arroz', variant: null }],
]);
const references = findComparableReferences(products[0], products, classifications);
assert.deepEqual(references.references.map((reference) => reference.id), ['similar']);
assert.equal(references.normalized, true);

const newProduct = suggestTaxonomy({ name: 'Alfajor Nuevo Chocolate 55g', brand: 'Marca Nueva' });
assert.equal(newProduct.categoryId, 'alimentos');
assert.equal(newProduct.subcategoryId, 'golosinas');
assert.equal(newProduct.subcategoryId, 'golosinas');

// Missing inputs return finite, user-safe values instead of NaN/null leakage.
const missingData = classify({ currentPrice: 0, marketAverage: 0, dataPoints: 0, supermarketCount: 0, comparableCount: 0 });
assert.equal(missingData.status, 'INFORMACION_INSUFICIENTE');
assert.equal(Number.isFinite(missingData.score), true);
assert.equal(Number.isFinite(missingData.confidencePercentage ?? 0), true);
assert.equal(missingData.reasons.includes('NaN'), false);

console.log('block12 test passed');