process.env.DOTENV_CONFIG_QUIET = 'true'

const database = require('../supabaseAdmin')
const { syncDiscoPrices } = require('../services/discoPriceSync')
const { fetchDiscoProductById } = require('../services/discoImporter')

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function fetchProductByIdWithRetry(sourceProductId) {
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const product = await fetchDiscoProductById(sourceProductId)
      if (product || attempt === 2) return product
    } catch (error) {
      lastError = error
      if (attempt === 2) throw error
    }
    await delay(250 * (attempt + 1))
  }
  if (lastError) throw lastError
  return null
}

function countByReason(items) {
  return items.reduce((counts, item) => {
    const reason = item.reason || 'unspecified'
    counts[reason] = (counts[reason] || 0) + 1
    return counts
  }, {})
}

async function auditDiscoPrices() {
  const startedAt = new Date()
  const result = await syncDiscoPrices({
    database,
    dryRun: true,
    concurrency: 3,
    fetchProductById: fetchProductByIdWithRetry,
  })
  const completedAt = new Date()

  const report = {
    dryRun: true,
    databaseHost: new URL(process.env.SUPABASE_URL).host,
    auditStartedAt: startedAt.toISOString(),
    auditCompletedAt: completedAt.toISOString(),
    databaseProductsScanned: result.scanned,
    counts: {
      proposedPriceUpdates: result.proposed.updates.length,
      proposedPromotionChanges: result.proposed.promotions.length,
      proposedVisibilityChanges: result.proposed.visibilityChanges.length,
      unchanged: result.unchanged.length,
      unavailable: result.unavailable.length,
      suspicious: result.suspicious.length,
      identityMismatch: result.identityMismatch.length,
      errors: result.errors.length,
      listPriceWarnings: result.listPriceWarnings.length,
      unavailableByReason: countByReason(result.unavailable),
      identityMismatchByReason: countByReason(result.identityMismatch),
      errorsByReason: countByReason(result.errors),
    },
    proposed: result.proposed,
    unavailable: result.unavailable,
    suspicious: result.suspicious,
    identityMismatch: result.identityMismatch,
    errors: result.errors,
    listPriceWarnings: result.listPriceWarnings,
  }
  console.log(JSON.stringify(report, null, 2))
}

auditDiscoPrices().catch((error) => {
  console.error('Disco price audit failed:', error.message)
  process.exitCode = 1
})
