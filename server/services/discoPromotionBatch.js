const MAX_DISCO_PROMOTION_BATCH_SIZE = 20
const DEFAULT_DISCO_PROMOTION_CONCURRENCY = 4

class InvalidDiscoPromotionBatchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidDiscoPromotionBatchError'
    this.status = 400
  }
}

function normalizeEans(eans) {
  if (!Array.isArray(eans)) {
    throw new InvalidDiscoPromotionBatchError('eans debe ser una lista')
  }
  if (eans.length > MAX_DISCO_PROMOTION_BATCH_SIZE) {
    throw new InvalidDiscoPromotionBatchError('El lote supera el máximo de productos permitido')
  }

  const normalized = [...new Set(eans.map((ean) => String(ean || '').replace(/\D/g, '')))]
  if (normalized.some((ean) => !/^\d{8,14}$/.test(ean))) {
    throw new InvalidDiscoPromotionBatchError('Todos los EAN deben tener entre 8 y 14 dígitos')
  }
  return normalized
}

async function fetchDiscoPromotionBatch(
  eans,
  { fetchPromotion, concurrency = DEFAULT_DISCO_PROMOTION_CONCURRENCY } = {},
) {
  if (typeof fetchPromotion !== 'function') throw new TypeError('fetchPromotion must be a function')

  const normalizedEans = normalizeEans(eans)
  const safeConcurrency = Number.isSafeInteger(concurrency) && concurrency > 0
    ? concurrency
    : DEFAULT_DISCO_PROMOTION_CONCURRENCY
  const results = new Array(normalizedEans.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(safeConcurrency, normalizedEans.length) }, async () => {
    while (nextIndex < normalizedEans.length) {
      const index = nextIndex++
      const ean = normalizedEans[index]
      try {
        results[index] = { ean, status: 'ready', promotion: await fetchPromotion(ean) }
      } catch (error) {
        results[index] = { ean, status: 'error', error }
      }
    }
  })

  await Promise.all(workers)
  return results
}

module.exports = {
  DEFAULT_DISCO_PROMOTION_CONCURRENCY,
  InvalidDiscoPromotionBatchError,
  MAX_DISCO_PROMOTION_BATCH_SIZE,
  fetchDiscoPromotionBatch,
}
