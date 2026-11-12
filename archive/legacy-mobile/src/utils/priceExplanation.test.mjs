import assert from 'node:assert/strict';
import { calculatePriceStatus } from './priceStatus.js';

const result = calculatePriceStatus({
  currentPrice: 1300,
  marketAverage: 1000,
  historicalAverage: 1000,
  inflationRate: 8.5,
  recentDifference: 30,
  analysis: {
    recentPeriodDays: 21,
    periodDays: 21,
    inflationDeviation: 20,
    supermarkets: { isolated: true },
    dataQuality: { historyPoints: 2 },
  },
  dataPoints: 5,
  supermarketCount: 2,
  comparableCount: 3,
});

assert.equal(result.status, 'INFLADO');
assert.ok(result.signals.length >= 2);
assert.ok(result.anomalyScore >= 60);
assert.ok(result.confidencePercentage >= 50);
assert.ok(result.reasons.includes('aumento abrupto reciente'));

console.log('priceExplanation test passed');
