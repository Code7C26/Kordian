const CATEGORY_INFLATION_RATES = [
  { matches: ['salud', 'medicamento', 'medicamentos'], rate: 8.2 },
  { matches: ['alimento', 'bebida'], rate: 5.4 },
  { matches: ['vivienda', 'electricidad', 'combustible'], rate: 9.7 },
  { matches: ['restaurante', 'hotel'], rate: 6.1 },
]

export const PRICE_CLASSIFICATION_CONFIG = {
  minimumData: {
    supermarketsForMarket: 2,
    historyPointsForTrend: 2,
    historyDaysForTrend: 14,
    comparablesForStrongReference: 3,
  },
  offerThreshold: -10,
  normalMarketUpper: 5,
  atypicalMarketUpper: 10,
  abruptIncrease: 15,
  inflationDeviation: 10,
  comparableDeviation: 10,
  isolatedIncrease: 1,
  anomalyScoreThreshold: 60,
  atypicalScoreThreshold: 15,
  offerScoreThreshold: 45,
  weights: {
    marketHigh: 2,
    historyHigh: 2,
    inflationDeviation: 2,
    comparableDeviation: 2,
    abruptIncrease: 3,
    isolatedIncrease: 2,
    marketLow: 2,
    historyLow: 2,
    generalizedIncreasePenalty: 2,
  },
}

export function getCategoryInflationRate(categoryName = '') {
  const normalizedCategory = String(categoryName).toLowerCase()
  return CATEGORY_INFLATION_RATES.find(({ matches }) => matches.some((match) => normalizedCategory.includes(match)))?.rate || 6.8
}

export function calculateMedian(values = []) {
  const sortedValues = values.filter((value) => Number.isFinite(value) && value > 0).sort((first, second) => first - second)
  if (!sortedValues.length) return 0
  const middle = Math.floor(sortedValues.length / 2)
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2
}

export function calculatePriceStatus({
  currentPrice,
  marketAverage,
  historicalAverage = 0,
  inflationRate = 0,
  recentDifference = null,
  peerDifference = null,
  dataPoints = 0,
  analysis = null,
  supermarketCount = 0,
  comparableCount = 0,
}) {
  if (!currentPrice || !marketAverage) {
    return {
      status: 'INFORMACION_INSUFICIENTE',
      marketDifference: 0,
      historicalDifference: null,
      historicalReference: 0,
      score: 0,
      anomalyScore: 0,
      offerScore: 0,
      confidencePercentage: 0,
      confidence: 'baja',
      reasons: [],
      dataQuality: {
        supermarkets: supermarketCount,
        historyPoints: analysis?.dataQuality?.historyPoints ?? dataPoints,
        historyDays: analysis?.periodDays || 0,
        comparables: comparableCount,
        quality: 'baja',
        requirements: PRICE_CLASSIFICATION_CONFIG.minimumData,
      },
    };
  }

  const marketDifference = ((currentPrice - marketAverage) / marketAverage) * 100;
  const historicalReference = historicalAverage ? historicalAverage * (1 + inflationRate / 100) : 0;
  const historicalDifference = historicalReference
    ? ((currentPrice - historicalReference) / historicalReference) * 100
    : null;
  const hasHistory = Boolean(historicalReference);
  const signals = []
  let anomalyRawScore = 0
  let offerRawScore = 0
  const addSignal = (id, label, score, direction = 'risk') => {
    signals.push({ id, label, score, direction })
    if (direction === 'offer') offerRawScore += score
    else anomalyRawScore += score
  }

  if (marketDifference <= PRICE_CLASSIFICATION_CONFIG.offerThreshold) addSignal('market_low', 'por debajo del mercado', PRICE_CLASSIFICATION_CONFIG.weights.marketLow, 'offer')
  if (historicalDifference != null && historicalDifference <= PRICE_CLASSIFICATION_CONFIG.offerThreshold) addSignal('history_low', 'por debajo del historial ajustado', PRICE_CLASSIFICATION_CONFIG.weights.historyLow, 'offer')
  if (marketDifference > PRICE_CLASSIFICATION_CONFIG.atypicalMarketUpper) addSignal('market_high', 'por encima del mercado', PRICE_CLASSIFICATION_CONFIG.weights.marketHigh)
  if (historicalDifference != null && historicalDifference > PRICE_CLASSIFICATION_CONFIG.inflationDeviation) addSignal('history_high', 'por encima del historial ajustado', PRICE_CLASSIFICATION_CONFIG.weights.historyHigh)
  if (analysis?.inflationDeviation > PRICE_CLASSIFICATION_CONFIG.inflationDeviation) addSignal('inflation_deviation', 'supera la inflación esperada', PRICE_CLASSIFICATION_CONFIG.weights.inflationDeviation)
  if (analysis?.comparableDeviation > PRICE_CLASSIFICATION_CONFIG.comparableDeviation) addSignal('comparable_deviation', 'supera a productos comparables', PRICE_CLASSIFICATION_CONFIG.weights.comparableDeviation)
  if ((recentDifference ?? analysis?.recentVariation ?? 0) > PRICE_CLASSIFICATION_CONFIG.abruptIncrease && (analysis?.recentPeriodDays || 999) <= 30) addSignal('abrupt_increase', 'aumento abrupto reciente', PRICE_CLASSIFICATION_CONFIG.weights.abruptIncrease)
  if (analysis?.supermarkets?.isolated) addSignal('isolated_increase', 'aumento aislado de un supermercado', PRICE_CLASSIFICATION_CONFIG.weights.isolatedIncrease)
  if (analysis?.supermarkets?.generalized) addSignal('generalized_increase', 'aumento compartido por varios supermercados', -PRICE_CLASSIFICATION_CONFIG.weights.generalizedIncreasePenalty, 'mitigating')

  const maximumRiskScore = Object.entries(PRICE_CLASSIFICATION_CONFIG.weights)
    .filter(([key]) => key !== 'marketLow' && key !== 'historyLow' && key !== 'generalizedIncreasePenalty')
    .reduce((total, [, weight]) => total + weight, 0)
  const maximumOfferScore = PRICE_CLASSIFICATION_CONFIG.weights.marketLow + PRICE_CLASSIFICATION_CONFIG.weights.historyLow
  const riskScore = Math.max(0, anomalyRawScore - signals.filter((signal) => signal.direction === 'mitigating').reduce((total, signal) => total + Math.abs(signal.score), 0))
  const anomalyScore = Math.min(100, Math.round((riskScore / maximumRiskScore) * 100))
  const offerScore = Math.min(100, Math.round((offerRawScore / maximumOfferScore) * 100))
  const evidenceCount = signals.filter((signal) => signal.direction !== 'mitigating').length + (hasHistory ? 1 : 0) + (peerDifference != null ? 1 : 0)
  const sourceCount = Math.min(4, (dataPoints > 0 ? 1 : 0) + (hasHistory ? 1 : 0) + (peerDifference != null ? 1 : 0) + (analysis?.market?.count >= 2 ? 1 : 0))
  const hasMarketSample = supermarketCount >= PRICE_CLASSIFICATION_CONFIG.minimumData.supermarketsForMarket
  const hasHistorySample = (analysis?.dataQuality?.historyPoints || dataPoints) >= PRICE_CLASSIFICATION_CONFIG.minimumData.historyPointsForTrend
    && (analysis?.periodDays || 0) >= PRICE_CLASSIFICATION_CONFIG.minimumData.historyDaysForTrend
  const hasComparableSample = comparableCount >= PRICE_CLASSIFICATION_CONFIG.minimumData.comparablesForStrongReference
  const qualityFactors = [hasMarketSample, hasHistorySample, hasComparableSample, evidenceCount >= 2]
  const qualityScore = qualityFactors.filter(Boolean).length
  const rawConfidencePercentage = Math.round(20 + (sourceCount * 12) + (Math.min(evidenceCount, 6) * 6) + (qualityScore * 8))
  const confidencePercentage = Math.min(
    hasMarketSample && hasHistorySample ? 98 : 50,
    rawConfidencePercentage,
  )
  const confidence = !hasMarketSample && !hasHistorySample && !hasComparableSample
    ? 'baja'
    : confidencePercentage >= 75
      ? 'alta'
      : confidencePercentage >= 50
        ? 'media'
        : 'baja';
  const result = (status) => ({
    status,
    marketDifference,
    historicalDifference,
    historicalReference,
    recentDifference,
    peerDifference,
    score: anomalyScore,
    anomalyScore,
    offerScore,
    signals,
    evidenceCount,
    confidencePercentage,
    dataQuality: {
      supermarkets: supermarketCount,
      historyPoints: analysis?.dataQuality?.historyPoints ?? dataPoints,
      historyDays: analysis?.periodDays || 0,
      comparables: comparableCount,
      quality: qualityScore >= 3 ? 'alta' : qualityScore >= 2 ? 'media' : 'baja',
      requirements: PRICE_CLASSIFICATION_CONFIG.minimumData,
    },
    confidence,
    reasons: signals.map((signal) => signal.label),
  });

  if (offerScore >= PRICE_CLASSIFICATION_CONFIG.offerScoreThreshold && offerScore > anomalyScore) {
    return result('OFERTA');
  }

  const riskSignalCount = signals.filter((signal) => signal.direction === 'risk').length
  if (anomalyScore >= PRICE_CLASSIFICATION_CONFIG.anomalyScoreThreshold && riskSignalCount >= 2 && confidencePercentage >= 60) {
    return result('INFLADO');
  }

  if (anomalyScore >= PRICE_CLASSIFICATION_CONFIG.atypicalScoreThreshold) {
    return result('AUMENTO_ATIPICO');
  }

  return result('PRECIO_NORMAL');
}
