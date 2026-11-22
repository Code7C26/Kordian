import assert from 'node:assert/strict';
import { calculateMedian, calculatePriceStatus, getCategoryInflationRate } from './priceStatus.js';

assert.equal(calculateMedian([1000, 1300, 1100]), 1100);
assert.equal(getCategoryInflationRate('Medicamentos'), 8.2);
assert.equal(getCategoryInflationRate('Alimentos'), 5.4);

const offerResult = calculatePriceStatus({
	currentPrice: 900,
	marketAverage: 1000,
	historicalAverage: 1000,
	dataPoints: 2,
	supermarketCount: 2,
	analysis: { periodDays: 21, dataQuality: { historyPoints: 2 } },
});
assert.equal(offerResult.status, 'OFERTA');
assert.ok(offerResult.offerScore >= 45);
assert.equal(calculatePriceStatus({ currentPrice: 1040, marketAverage: 1000, supermarketCount: 2 }).status, 'INFORMACION_INSUFICIENTE');
const atypicalResult = calculatePriceStatus({ currentPrice: 1110, marketAverage: 1000 });
assert.equal(atypicalResult.status, 'INFORMACION_INSUFICIENTE');
assert.equal(atypicalResult.anomalyScore, 0);
assert.equal(calculatePriceStatus({
	currentPrice: 1320,
	marketAverage: 1000,
	historicalAverage: 1050,
	inflationRate: 8.2,
	dataPoints: 2,
	supermarketCount: 2,
	analysis: { periodDays: 21, dataQuality: { historyPoints: 2 } },
}).status, 'AUMENTO_ATIPICO');
assert.equal(calculatePriceStatus({
	currentPrice: 1040,
	marketAverage: 1000,
	historicalAverage: 1050,
	inflationRate: 8.2,
	dataPoints: 2,
	supermarketCount: 2,
	analysis: { periodDays: 21, dataQuality: { historyPoints: 2 } },
}).status, 'PRECIO_NORMAL');
assert.equal(calculatePriceStatus({ currentPrice: 1200, marketAverage: 1000, supermarketCount: 2 }).status, 'INFORMACION_INSUFICIENTE');
assert.equal(calculatePriceStatus({ currentPrice: 1000, marketAverage: 1000, supermarketCount: 1 }).status, 'INFORMACION_INSUFICIENTE');
const delayedDataResult = calculatePriceStatus({
	currentPrice: 3150,
	marketAverage: 3150,
	historicalAverage: 3150,
	inflationRate: 8,
	dataPoints: 1,
	supermarketCount: 1,
	comparableCount: 8,
	peerDifference: 20,
	analysis: { periodDays: 30, dataQuality: { historyPoints: 1 } },
});
assert.equal(delayedDataResult.status, 'INFORMACION_INSUFICIENTE');
assert.ok(delayedDataResult.confidencePercentage < 60);
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
assert.equal(limitedDataResult.status, 'INFORMACION_INSUFICIENTE');
assert.ok(limitedDataResult.confidencePercentage < 60);

const comparableBackedResult = calculatePriceStatus({
	currentPrice: 1200,
	marketAverage: 1200,
	historicalAverage: 0,
	dataPoints: 0,
	supermarketCount: 1,
	comparableCount: 4,
	peerDifference: 18,
	analysis: { periodDays: 0, dataQuality: { historyPoints: 0 } },
});
assert.equal(comparableBackedResult.status, 'INFORMACION_INSUFICIENTE');
assert.ok(comparableBackedResult.confidencePercentage < 50);
assert.equal(comparableBackedResult.dataQuality.quality, 'baja');
assert.equal(calculatePriceStatus({ currentPrice: 0, marketAverage: 1000 }).status, 'INFORMACION_INSUFICIENTE');

console.log('priceStatus test passed');
