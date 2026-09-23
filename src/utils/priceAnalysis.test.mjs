import assert from 'node:assert/strict';
import { analyzeMarketOffers, analyzePriceBehavior, analyzePriceHistory, calculateInflationForDays } from './priceAnalysis.js';

assert.ok(calculateInflationForDays(8.5, 21) > 1 && calculateInflationForDays(8.5, 21) < 3);

const now = Date.now();
const history = [
  { date: new Date(now - 42 * 86400000).toISOString().slice(0, 10), avgPrice: 1000 },
  { date: new Date(now - 21 * 86400000).toISOString().slice(0, 10), avgPrice: 1300 },
];
const historyAnalysis = analyzePriceHistory(history, { currentPrice: 1300, inflationRate: 8.5 });
assert.equal(historyAnalysis.changeCount, 1);
assert.equal(Math.round(historyAnalysis.percentageVariation), 30);
assert.ok(historyAnalysis.recentVariation > 0);
assert.ok(historyAnalysis.inflationDeviation > 25);
assert.ok(historyAnalysis.signals.includes('supera_inflacion'));
assert.ok(historyAnalysis.signals.includes('aumento_abrupto_reciente'));

const market = analyzeMarketOffers([{ price: 1000 }, { price: 1200 }, { price: 1500 }]);
assert.equal(market.minimum, 1000);
assert.equal(market.maximum, 1500);
assert.equal(market.median, 1200);

const behavior = analyzePriceBehavior({ history, offers: [{ price: 1000 }, { price: 1200 }], currentPrice: 1200, inflationRate: 8.5 });
assert.equal(behavior.market.count, 2);
assert.equal(behavior.dataQuality.historyPoints, 2);

console.log('priceAnalysis test passed');
