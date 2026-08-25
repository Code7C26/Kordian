import assert from 'node:assert/strict';
import { calculateMedian, calculatePriceStatus, getCategoryInflationRate } from './priceStatus.js';

assert.equal(calculateMedian([1000, 1300, 1100]), 1100);
assert.equal(getCategoryInflationRate('Medicamentos'), 8.2);
assert.equal(getCategoryInflationRate('Alimentos'), 5.4);

const offerResult = calculatePriceStatus({ currentPrice: 900, marketAverage: 1000 });
assert.equal(offerResult.status, 'OFERTA');
assert.ok(offerResult.offerScore >= 45);
assert.equal(calculatePriceStatus({ currentPrice: 1040, marketAverage: 1000 }).status, 'PRECIO_NORMAL');
const atypicalResult = calculatePriceStatus({ currentPrice: 1110, marketAverage: 1000 });
assert.equal(atypicalResult.status, 'AUMENTO_ATIPICO');
assert.ok(atypicalResult.anomalyScore > 0 && atypicalResult.anomalyScore < 60);
assert.equal(calculatePriceStatus({ currentPrice: 1320, marketAverage: 1000, historicalAverage: 1050, inflationRate: 8.2 }).status, 'AUMENTO_ATIPICO');
assert.equal(calculatePriceStatus({ currentPrice: 1040, marketAverage: 1000, historicalAverage: 1050, inflationRate: 8.2 }).status, 'PRECIO_NORMAL');
assert.equal(calculatePriceStatus({ currentPrice: 1200, marketAverage: 1000 }).status, 'AUMENTO_ATIPICO');
const inflatedResult = calculatePriceStatus({
	currentPrice: 1300,
	marketAverage: 1000,
	historicalAverage: 1000,
	inflationRate: 8.5,
	recentDifference: 30,
	analysis: { recentPeriodDays: 21, periodDays: 21, inflationDeviation: 20, supermarkets: { isolated: true }, dataQuality: { historyPoints: 2 } },
	dataPoints: 5,
	supermarketCount: 2,
	comparableCount: 3,
});
assert.equal(inflatedResult.status, 'INFLADO');
assert.ok(inflatedResult.anomalyScore >= 60);
assert.ok(inflatedResult.confidencePercentage >= 50);
const limitedDataResult = calculatePriceStatus({
	currentPrice: 1300,
	marketAverage: 1000,
	historicalAverage: 1000,
	inflationRate: 8.5,
	recentDifference: 30,
	analysis: { recentPeriodDays: 21, inflationDeviation: 20, supermarkets: { isolated: true }, dataQuality: { historyPoints: 1 } },
	dataPoints: 1,
	supermarketCount: 1,
	comparableCount: 0,
});
assert.equal(limitedDataResult.status, 'AUMENTO_ATIPICO');
assert.ok(limitedDataResult.confidencePercentage < 60);
assert.equal(calculatePriceStatus({ currentPrice: 0, marketAverage: 1000 }).status, 'INFORMACION_INSUFICIENTE');

console.log('priceStatus test passed');
