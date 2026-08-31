import { calculateMedian } from './priceStatus.js'

const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

export function calculateInflationForDays(annualizedThreeMonthRate, days) {
  if (!annualizedThreeMonthRate || !days || days <= 0) return 0
  return (Math.pow(1 + annualizedThreeMonthRate / 100, days / 90) - 1) * 100
}

export function analyzePriceHistory(history = [], { currentPrice = 0, inflationRate = 0, comparableVariation = null } = {}) {
  const points = history
    .map((point) => ({ ...point, price: asNumber(point.avgPrice), dateValue: Date.parse(point.date) }))
    .filter((point) => point.price > 0 && !Number.isNaN(point.dateValue))
    .sort((first, second) => first.dateValue - second.dateValue)

  if (!points.length) {
    return {
      previousPrice: null,
      currentPrice: currentPrice || null,
      absoluteVariation: null,
      percentageVariation: null,
      accumulatedVariation: null,
      changeCount: 0,
      averageDaysBetweenChanges: null,
      largestIncrease: null,
      largestDecrease: null,
      increaseSpeed: null,
      periodDays: 0,
      inflationVariation: null,
      inflationDeviation: null,
      comparableVariation,
      comparableDeviation: null,
      recentVariation: null,
      recentPeriodDays: 0,
      signals: [],
      confidence: 'baja',
    }
  }

  const changes = points.slice(1).map((point, index) => {
    const previous = points[index]
    const days = Math.max(1, Math.round((point.dateValue - previous.dateValue) / 86400000))
    const absolute = point.price - previous.price
    const percentage = previous.price ? (absolute / previous.price) * 100 : 0
    return { date: point.date, days, absolute, percentage, price: point.price }
  })
  const first = points[0]
  const lastPrice = currentPrice || points[points.length - 1].price
  const periodDays = Math.max(1, Math.round((Date.now() - first.dateValue) / 86400000))
  const recentChange = changes[changes.length - 1]
  const recentPeriodDays = recentChange?.days || Math.max(1, Math.round((Date.now() - points[points.length - 1].dateValue) / 86400000))
  const recentVariation = recentChange?.percentage || 0
  const inflationVariation = calculateInflationForDays(inflationRate, periodDays)
  const inflationDeviation = ((lastPrice - first.price) / first.price) * 100 - inflationVariation
  const comparableDeviation = comparableVariation == null ? null : ((lastPrice - first.price) / first.price) * 100 - comparableVariation
  const increases = changes.filter((change) => change.absolute > 0)
  const decreases = changes.filter((change) => change.absolute < 0)
  const averageDaysBetweenChanges = changes.length
    ? changes.reduce((total, change) => total + change.days, 0) / changes.length
    : null
  const increaseSpeed = increases.length
    ? increases.reduce((total, change) => total + change.percentage / change.days, 0) / increases.length
    : 0
  const signals = []
  if (recentVariation > 15 && recentPeriodDays <= 30) signals.push('aumento_abrupto_reciente')
  if (inflationDeviation > 10) signals.push('supera_inflacion')
  if (comparableDeviation != null && comparableDeviation > 10) signals.push('supera_comparables')
  if (increases.length >= 2) signals.push('multiples_aumentos')

  return {
    previousPrice: first.price,
    currentPrice: lastPrice,
    absoluteVariation: lastPrice - first.price,
    percentageVariation: ((lastPrice - first.price) / first.price) * 100,
    accumulatedVariation: changes.reduce((total, change) => total + change.percentage, 0),
    changeCount: changes.length,
    averageDaysBetweenChanges,
    largestIncrease: increases.length ? Math.max(...increases.map((change) => change.percentage)) : 0,
    largestDecrease: decreases.length ? Math.min(...decreases.map((change) => change.percentage)) : 0,
    increaseSpeed,
    periodDays,
    inflationVariation,
    inflationDeviation,
    comparableVariation,
    comparableDeviation,
    recentVariation,
    recentPeriodDays,
    changes,
    signals,
    confidence: points.length >= 4 ? 'alta' : points.length >= 2 ? 'media' : 'baja',
  }
}

export function analyzeMarketOffers(offers = []) {
  const prices = offers.map((offer) => asNumber(offer.price ?? offer.cash_price)).filter((price) => price > 0)
  if (!prices.length) return { count: 0, minimum: 0, maximum: 0, average: 0, median: 0, spread: 0, spreadPercentage: 0 }
  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)
  return {
    count: prices.length,
    minimum,
    maximum,
    average: prices.reduce((total, price) => total + price, 0) / prices.length,
    median: calculateMedian(prices),
    spread: maximum - minimum,
    spreadPercentage: minimum ? ((maximum - minimum) / minimum) * 100 : 0,
  }
}

export function analyzePriceBehavior({ history = [], offers = [], currentPrice = 0, inflationRate = 0, comparableVariation = null, comparableCount = 0 } = {}) {
  const historyAnalysis = analyzePriceHistory(history, { currentPrice, inflationRate, comparableVariation })
  const marketAnalysis = analyzeMarketOffers(offers)
  const offerPrices = offers.map((offer) => asNumber(offer.price ?? offer.cash_price)).filter((price) => price > 0)
  const offerChanges = offers.filter((offer) => asNumber(offer.previousPrice) > 0 && asNumber(offer.price) > 0).map((offer) => ((offer.price - offer.previousPrice) / offer.previousPrice) * 100)
  const increases = offerChanges.filter((change) => change > 0).length
  const decreases = offerChanges.filter((change) => change < 0).length
  const stable = offerChanges.filter((change) => change === 0).length
  const sortedIncreases = offerChanges.filter((change) => change > 0).sort((first, second) => first - second)
  const medianIncrease = sortedIncreases.length ? calculateMedian(sortedIncreases) : 0
  const maximumIncrease = sortedIncreases.length ? sortedIncreases[sortedIncreases.length - 1] : 0
  const generalizedIncrease = sortedIncreases.length > 0
    && increases >= Math.ceil(Math.max(1, offers.length) / 2)
    && maximumIncrease - sortedIncreases[0] <= 5
  const isolatedIncrease = offers.length > 1
    && (increases === 1 || maximumIncrease - medianIncrease >= 10)

  return {
    ...historyAnalysis,
    market: marketAnalysis,
    supermarkets: {
      total: offers.length,
      increased: increases,
      decreased: decreases,
      stable,
      variations: offerChanges,
      generalized: generalizedIncrease,
      isolated: isolatedIncrease,
    },
    dataQuality: {
      historyPoints: history.length,
      offerCount: offerPrices.length,
      comparableCount,
      periodDays: historyAnalysis.periodDays,
      frequency: history.length > 1 && historyAnalysis.periodDays ? `${(historyAnalysis.periodDays / (history.length - 1)).toFixed(0)} días entre registros` : 'No disponible',
      confidence: historyAnalysis.confidence,
      quality: history.length >= 4 && offerPrices.length >= 2 && comparableCount >= 3 ? 'alta' : history.length >= 2 || offerPrices.length >= 2 || comparableCount >= 2 ? 'media' : 'baja',
    },
  }
}
