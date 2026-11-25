const modulesPromise = Promise.all([
  import('../../src/data/taxonomy.js'),
  import('../../src/utils/comparableProducts.js'),
  import('../../src/utils/priceAnalysis.js'),
  import('../../src/utils/priceStatus.js'),
])

const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const { normalizeDiscoStoredPrice } = require('../priceNormalization')
const PRICE_TOKEN_NORMALIZATION_SOURCE = 'price_token_normalization'
const DISCO_PUBLIC_SEARCH_SOURCE = 'disco_public_search'
const MAX_SOURCE_REFERENCE_AGE_MS = 30 * 24 * 60 * 60 * 1000

function isScaleArtifactRatio(price, referencePrice, minimumRatio, maximumRatio) {
  if (!price || !referencePrice || price <= 0 || referencePrice <= 0) return false
  const ratio = Math.max(price, referencePrice) / Math.min(price, referencePrice)
  return ratio >= minimumRatio && ratio <= maximumRatio
}

function filterKnownPriceScaleArtifacts(history, product) {
  const discoPrices = new Map((product.offers || [])
    .filter((offer) => offer.is_catalog_visible !== false && offer.supermarket === 'Disco')
    .map((offer) => [String(offer.id), normalizeDiscoStoredPrice(offer.cash_price, product.source)]))
  const mamiPrices = new Map((product.offers || [])
    .filter((offer) => offer.is_catalog_visible !== false && offer.supermarket === 'Mami')
    .map((offer) => [String(offer.id), normalizeDiscoStoredPrice(offer.cash_price, product.source)]))
  const currentPrices = new Map([...discoPrices, ...mamiPrices])
  const publicSearchPrices = new Map()
  for (const point of history) {
    if (point.source !== DISCO_PUBLIC_SEARCH_SOURCE || !point.offer_id) continue
    const price = normalizeDiscoStoredPrice(point.cash_price, product.source)
    const timestamp = Date.parse(point.observed_at)
    if (!price || price <= 0 || !Number.isFinite(timestamp)) continue
    const offerId = String(point.offer_id)
    const references = publicSearchPrices.get(offerId) || []
    references.push({ price, timestamp })
    publicSearchPrices.set(offerId, references)
  }

  return history.filter((point) => {
    if (point.source === 'price_token_normalization') return false

    const currentPrice = currentPrices.get(String(point.offer_id))
    if (!currentPrice || currentPrice <= 0) return true

    const historicalPrice = normalizeDiscoStoredPrice(point.cash_price, product.source)
    if (!historicalPrice || historicalPrice <= 0) return true

    const [minimumScaleRatio, maximumScaleRatio] = point.source === PRICE_TOKEN_NORMALIZATION_SOURCE
      ? [90, 110]
      : [95, 105]
    const matchesCurrentPriceScale = isScaleArtifactRatio(
      historicalPrice,
      currentPrice,
      minimumScaleRatio,
      maximumScaleRatio,
    )
    if (matchesCurrentPriceScale) return false

    if (point.source === PRICE_TOKEN_NORMALIZATION_SOURCE) {
      const timestamp = Date.parse(point.observed_at)
      const references = publicSearchPrices.get(String(point.offer_id)) || []
      const matchesNearbyPublicSearch = Number.isFinite(timestamp) && references.some((reference) => (
        Math.abs(timestamp - reference.timestamp) <= MAX_SOURCE_REFERENCE_AGE_MS
          && isScaleArtifactRatio(historicalPrice, reference.price, 90, 110)
      ))
      if (matchesNearbyPublicSearch) return false
    }

    return true
  })
}

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

async function createAnalysisContext(products = []) {
  const [taxonomy, comparables, analysis, status] = await modulesPromise
  const classifications = new Map(products.map((candidate) => [
    String(candidate.id),
    taxonomy.suggestTaxonomy({
      ...candidate,
      brand: candidate.brand || candidate.brands?.name,
      subcategory: candidate.subcategory || candidate.subcategories?.name,
    }),
  ]))
  return {
    comparables,
    analysis,
    status,
    classifications,
    productIndex: comparables.createComparableProductIndex(products, classifications),
  }
}

async function analyzeProduct(product, products = [], history = [], categoryName = '', context = null) {
  const analysisContext = context || await createAnalysisContext(products)
  const { comparables, analysis, status, classifications, productIndex } = analysisContext
  const classification = classifications.get(String(product.id))
  const references = comparables.findComparableReferences(product, products, classifications, productIndex)
  const relevantHistory = filterKnownPriceScaleArtifacts(history, product)
    .map((point) => ({
      ...point,
      cash_price: normalizeDiscoStoredPrice(point.cash_price, product.source),
    }))
  const offers = (product.offers || [])
    .filter((offer) => offer.is_catalog_visible !== false)
    .map((offer) => ({
      ...offer,
      price: normalizeDiscoStoredPrice(offer.cash_price, product.source),
      previousPrice: numeric(offer.previous_price),
    }))
    .filter((offer) => offer.price > 0)
  const currentPrice = offers.length ? Math.min(...offers.map((offer) => offer.price)) : 0
  const behavior = analysis.analyzePriceBehavior({
    history: relevantHistory.map((point) => ({ date: point.observed_at, avgPrice: point.cash_price })),
    offers,
    currentPrice,
    inflationRate: status.getCategoryInflationRate(categoryName),
    comparableCount: references.references.length,
  })
  const historicalAverage = behavior.previousPrice || 0
  const marketAverage = behavior.market.median || behavior.market.average || 0
  const effectiveCurrentPrice = behavior.market.minimum || currentPrice
  const supermarketCount = new Set(offers
    .map((offer) => String(offer.supermarket || offer.supermarket_name || '').trim().toLowerCase())
    .filter(Boolean)).size
  const normalizedCurrentPrice = references.normalized
    ? comparables.normalizePrice(product, effectiveCurrentPrice).unitPrice
    : effectiveCurrentPrice
  const classificationResult = status.calculatePriceStatus({
    currentPrice: effectiveCurrentPrice,
    marketAverage,
    historicalAverage,
    inflationRate: status.getCategoryInflationRate(categoryName),
    recentDifference: behavior.recentVariation,
    peerDifference: references.referencePrice && normalizedCurrentPrice
      ? ((normalizedCurrentPrice - references.referencePrice) / references.referencePrice) * 100
      : null,
    dataPoints: relevantHistory.length,
    analysis: behavior,
    supermarketCount,
    comparableCount: references.references.length,
  })
  const pricePeriods = buildPricePeriods(relevantHistory)
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
    priceHistory: relevantHistory.map((point) => ({
      date: point.observed_at,
      offerId: point.offer_id,
      avgPrice: numeric(point.cash_price),
      minPrice: numeric(point.cash_price),
      source: point.source,
    })),
    pricePeriods,
    populatedPeriods,
    evolutionAvailable: populatedPeriods >= 2,
    dataQuality: classificationResult.dataQuality,
    analyzedAt: new Date().toISOString(),
    taxonomy: classification,
  }
}

module.exports = { analyzeProduct, createAnalysisContext, filterKnownPriceScaleArtifacts }