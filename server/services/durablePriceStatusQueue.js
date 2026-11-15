const DEFAULT_BATCH_SIZE = 25
const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_LEASE_SECONDS = 300
const { isPersistablePriceStatusRow } = require('./currentPriceStatus')

function normalizeProductIds(productIds) {
  return [...new Set((Array.isArray(productIds) ? productIds : [])
    .filter((productId) => productId !== null && productId !== undefined)
    .map(String)
    .map((productId) => productId.trim())
    .filter(Boolean))]
}

function createDurablePriceStatusRefreshQueue({
  database,
  refreshBatch,
  batchSize = DEFAULT_BATCH_SIZE,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  leaseSeconds = DEFAULT_LEASE_SECONDS,
  logger = console,
}) {
  if (!database || typeof database.rpc !== 'function') {
    throw new TypeError('A Supabase-compatible database client is required for the durable price status queue')
  }
  if (typeof refreshBatch !== 'function') {
    throw new TypeError('refreshBatch must be a function')
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
    throw new TypeError('batchSize must be an integer between 1 and 100')
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new TypeError('pollIntervalMs must be a positive integer')
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 3600) {
    throw new TypeError('leaseSeconds must be an integer between 30 and 3600')
  }

  let started = false
  let stopped = false
  let running = false
  let timer = null

  async function callRpc(name, arguments_) {
    const { data, error } = await database.rpc(name, arguments_)
    if (error) throw error
    return data
  }

  function schedule(delay = pollIntervalMs) {
    if (!started || stopped || timer) return
    timer = setTimeout(() => {
      timer = null
      void processNextBatch()
    }, delay)
    if (typeof timer.unref === 'function') timer.unref()
  }

  async function markFailed(claim, error) {
    try {
      const state = await callRpc('fail_product_price_status_refresh', {
        p_product_id: claim.product_id,
        p_generation: claim.generation,
        p_lease_token: claim.lease_token,
        p_error: String(error?.message || error || 'Unknown refresh error'),
      })
      if (state === null) {
        logger.warn('Price status refresh lease was superseded before failure could be recorded', {
          productId: claim.product_id,
          generation: claim.generation,
        })
      }
    } catch (failureError) {
      logger.error('Unable to persist price status refresh failure; lease expiry will permit recovery', {
        productId: claim.product_id,
        generation: claim.generation,
        error: failureError,
      })
    }
  }

  async function processNextBatch() {
    if (running || stopped) return { claimed: 0, completed: 0, failed: 0 }
    running = true
    let result = { claimed: 0, completed: 0, failed: 0 }
    try {
      const claims = await callRpc('claim_product_price_status_refresh', {
        p_batch_size: batchSize,
        p_lease_seconds: leaseSeconds,
      })
      if (!Array.isArray(claims)) {
        throw new TypeError('claim_product_price_status_refresh must return an array')
      }
      if (!claims.length) return result

      const validClaims = claims.filter((claim) => (
        claim
        && claim.product_id !== null
        && claim.product_id !== undefined
        && Number.isInteger(Number(claim.generation))
        && typeof claim.lease_token === 'string'
        && claim.lease_token
      ))
      if (validClaims.length !== claims.length) {
        throw new TypeError('The durable price status queue returned an invalid lease')
      }
      result.claimed = validClaims.length

      try {
        const statusRows = await refreshBatch(validClaims.map((claim) => String(claim.product_id)))
        if (!Array.isArray(statusRows)) {
          throw new TypeError('refreshBatch must return a status row for each successfully analyzed product')
        }

        const statusByProductId = new Map()
        const duplicateProductIds = new Set()
        for (const row of statusRows) {
          const productId = row?.product_id === null || row?.product_id === undefined
            ? ''
            : String(row.product_id)
          if (!productId) continue
          if (statusByProductId.has(productId)) duplicateProductIds.add(productId)
          else statusByProductId.set(productId, row)
        }

        await Promise.all(validClaims.map(async (claim) => {
          const productId = String(claim.product_id)
          const status = statusByProductId.get(productId)
          if (!status || duplicateProductIds.has(productId) || !isPersistablePriceStatusRow(status)) {
            const error = new Error(
              duplicateProductIds.has(productId)
                ? `Fresh analysis returned duplicate status rows for product ${productId}`
                : !status
                  ? `Fresh analysis returned no persistable status row for product ${productId}`
                  : `Fresh analysis returned an incomplete status row for product ${productId}`,
            )
            result.failed += 1
            await markFailed(claim, error)
            return { claim, error }
          }

          try {
            const state = await callRpc('save_and_complete_product_price_status_refresh', {
              p_product_id: claim.product_id,
              p_generation: claim.generation,
              p_lease_token: claim.lease_token,
              p_status: status,
            })
            if (state === 'completed') result.completed += 1
            else {
              result.failed += 1
              logger.warn('Price status refresh result was rejected by the database fence', {
                productId: claim.product_id,
                generation: claim.generation,
                state,
              })
            }
            return { claim, state }
          } catch (error) {
            result.failed += 1
            await markFailed(claim, error)
            logger.error('Unable to save and complete price status refresh atomically; lease expiry will permit recovery', {
              productId: claim.product_id,
              generation: claim.generation,
              error,
            })
            return { claim, error }
          }
        }))
        return result
      } catch (error) {
        result.failed = validClaims.length
        await Promise.all(validClaims.map((claim) => markFailed(claim, error)))
        logger.error(`Unable to refresh current price statuses for ${validClaims.length} products`, error)
        return result
      }
    } catch (error) {
      logger.error('Unable to process durable current price status refresh queue', error)
      return result
    } finally {
      running = false
      schedule()
    }
  }

  async function enqueue(productIds) {
    const ids = normalizeProductIds(productIds)
    if (!ids.length) return 0
    const data = await callRpc('enqueue_product_price_status_refresh', {
      p_product_ids: ids,
    })
    const count = Number(data)
    if (!Number.isInteger(count) || count < 0) {
      throw new TypeError('enqueue_product_price_status_refresh returned an invalid row count')
    }
    schedule(0)
    return count
  }

  function start() {
    if (stopped) throw new Error('A stopped durable queue cannot be restarted')
    started = true
    schedule(0)
  }

  function stop() {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
  }

  return {
    enqueue,
    processNextBatch,
    start,
    stop,
  }
}

module.exports = {
  createDurablePriceStatusRefreshQueue,
  normalizeProductIds,
}
