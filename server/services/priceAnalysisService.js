const modulesPromise = Promise.all([
  import('../../src/data/taxonomy.js'),
  import('../../src/utils/comparableProducts.js'),
  import('../../src/utils/priceAnalysis.js'),
  import('../../src/utils/priceStatus.js'),
])

const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

function buildPricePeriods(history) {
  const points = (history || [])
    .map((point) => ({
      ...point,
      timestamp: new Date(point.observed_at).getTime(),
      price: numeric(point.cash_price),
    }))
    .filter((point) => Number.isFinite(point.timestamp) && point.price > 0)
    .sort((first, second) => first.timestamp - second.timestamp)

  const latestTimestamp = points.length ? points[points.length - 1].timestamp : Date.now()
  const windowStart = latestTimestamp - (90 * 24 * 60 * 60 * 1000)
  const periodDuration = (latestTimestamp - windowStart) / 4
  const periods = Array.from({ length: 4 }, (_, index) => {
    const start = windowStart + (index * periodDuration)
    const end = index === 3 ? latestTimestamp : windowStart + ((index + 1) * periodDuration)
    const periodPoints = points.filter((point) => point.timestamp >= start && (index === 3 ? point.timestamp <= end : point.timestamp < end))
    const prices = periodPoints.map((point) => point.price)
    const averagePrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null
    return {
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(),
      recordCount: prices.length,
      averagePrice,
      minimumPrice: prices.length ? Math.min(...prices) : null,
    }
  })

  return periods.map((period, index) => {
    const previous = index > 0 ? periods[index - 1] : null
    const changePercent = period.averagePrice !== null && previous?.averagePrice
      ? ((period.averagePrice - previous.averagePrice) / previous.averagePrice) * 100
      : null
    return { ...period, changePercent }
  })
}

async function analyzeProduct(product, products = [], history = [], categoryName = '') {
  const [taxonomy, comparables, analysis, status] = await modulesPromise
  const classifications = new Map(products.map((candidate) => [
    String(candidate.id),
    taxonomy.suggestTaxonomy({
      ...candidate,
      brand: candidate.brand || candidate.brands?.name,
      subcategory: candidate.subcategory || candidate.subcategories?.name,
    }),
  ]))
  const classification = classifications.get(String(product.id))
  const references = comparables.findComparableReferences(product, products, classifications)
  const offers = (product.offers || []).map((offer) => ({
    ...offer,
    price: numeric(offer.cash_price),
    previousPrice: numeric(offer.previous_price),
  })).filter((offer) => offer.price > 0)
  const currentPrice = offers.length ? Math.min(...offers.map((offer) => offer.price)) : 0
  const behavior = analysis.analyzePriceBehavior({
    history: history.map((point) => ({ date: point.observed_at, avgPrice: point.cash_price })),
    offers,
    currentPrice,
    inflationRate: status.getCategoryInflationRate(categoryName),
    comparableCount: references.references.length,
  })
  const historicalAverage = behavior.previousPrice || 0
  const marketAverage = behavior.market.median || behavior.market.average || 0
  const classificationResult = status.calculatePriceStatus({
    currentPrice,
    marketAverage,
    historicalAverage,
    inflationRate: status.getCategoryInflationRate(categoryName),
    recentDifference: behavior.recentVariation,
    peerDifference: references.referencePrice && currentPrice
      ? ((currentPrice - references.referencePrice) / references.referencePrice) * 100
      : null,
    dataPoints: history.length,
    analysis: behavior,
    supermarketCount: offers.length,
    comparableCount: references.references.length,
  })
  const pricePeriods = buildPricePeriods(history)
  const populatedPeriods = pricePeriods.filter((period) => period.recordCount > 0).length

  return {
    product,
    classification: classificationResult.status,
    score: classificationResult.anomalyScore,
    offerScore: classificationResult.offerScore,
    confidence: classificationResult.confidence,
    confidencePercentage: classificationResult.confidencePercentage,
    indicators: {
      ...behavior,
      signals: classificationResult.signals,
      reasons: classificationResult.reasons,
    },
    references,
    priceHistory: history.map((point) => ({
      date: point.observed_at,
      offerId: point.offer_id,
      avgPrice: numeric(point.cash_price),
      minPrice: numeric(point.cash_price),
    })),
    pricePeriods,
    populatedPeriods,
    evolutionAvailable: populatedPeriods >= 2,
    dataQuality: classificationResult.dataQuality,
    analyzedAt: new Date().toISOString(),
    taxonomy: classification,
  }
}

module.exports = { analyzeProduct }