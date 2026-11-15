const assert = require('node:assert/strict')
const test = require('node:test')
const {
  createDurablePriceStatusRefreshQueue,
  normalizeProductIds,
} = require('./durablePriceStatusQueue')

function createLogger() {
  return {
    errors: [],
    warnings: [],
    error(...args) {
      this.errors.push(args)
    },
    warn(...args) {
      this.warnings.push(args)
    },
  }
}

function createQueue(database, refreshBatch, options = {}) {
  return createDurablePriceStatusRefreshQueue({
    database,
    refreshBatch,
    logger: createLogger(),
    ...options,
  })
}

function statusRow(productId) {
  return {
    product_id: String(productId),
    classification: 'INFORMACION_INSUFICIENTE',
    rules_version: 'test-rules',
    price_fingerprint: `fingerprint-${productId}`,
    data_quality: {
      historyPoints: 0,
      supermarkets: 0,
      comparables: 0,
      quality: 'baja',
    },
    analysis_details: {
      indicators: {
        percentageVariation: null,
        inflationDeviation: null,
        signals: [],
      },
      references: { references: [] },
      priceHistory: [],
      pricePeriods: [],
    },
  }
}

test('normalizes and deduplicates product IDs before enqueueing', () => {
  assert.deepEqual(normalizeProductIds([1, '1', null, undefined, ' 2 ', '', '  ']), ['1', '2'])
})

test('enqueue persists only unique IDs through the database RPC', async () => {
  const calls = []
  const queue = createQueue({
    async rpc(name, args) {
      calls.push({ name, args })
      return { data: 2, error: null }
    },
  }, async () => {})

  assert.equal(await queue.enqueue([1, '1', 2]), 2)
  assert.deepEqual(calls, [{
    name: 'enqueue_product_price_status_refresh',
    args: { p_product_ids: ['1', '2'] },
  }])
})

test('surfaces enqueue RPC errors instead of falling back to memory', async () => {
  const failure = new Error('RPC unavailable')
  const queue = createQueue({
    async rpc() {
      return { data: null, error: failure }
    },
  }, async () => {})

  await assert.rejects(queue.enqueue([10]), failure)
})

test('a later worker instance recovers previously persisted work', async () => {
  const pending = new Set()
  const calls = []
  const database = {
    async rpc(name, args) {
      calls.push(name)
      if (name === 'enqueue_product_price_status_refresh') {
        args.p_product_ids.forEach((id) => pending.add(id))
        return { data: args.p_product_ids.length, error: null }
      }
      if (name === 'claim_product_price_status_refresh') {
        const productId = pending.values().next().value
        if (productId === undefined) return { data: [], error: null }
        pending.delete(productId)
        return {
          data: [{ product_id: productId, generation: 1, lease_token: 'lease-1' }],
          error: null,
        }
      }
      if (name === 'save_and_complete_product_price_status_refresh') {
        pending.delete(String(args.p_product_id))
        return { data: 'completed', error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
  }

  const firstProcess = createQueue(database, async () => {})
  await firstProcess.enqueue([10])
  firstProcess.stop()

  const refreshed = []
  const restartedProcess = createQueue(database, async (ids) => {
    refreshed.push(...ids)
    return ids.map(statusRow)
  })
  assert.deepEqual(await restartedProcess.processNextBatch(), { claimed: 1, completed: 1, failed: 0 })
  restartedProcess.stop()

  assert.deepEqual(refreshed, ['10'])
  assert.deepEqual(calls, [
    'enqueue_product_price_status_refresh',
    'claim_product_price_status_refresh',
    'save_and_complete_product_price_status_refresh',
  ])
})

test('failure during a batch is persisted for every claimed item', async () => {
  const calls = []
  const logger = createLogger()
  const queue = createDurablePriceStatusRefreshQueue({
    database: {
      async rpc(name, args) {
        calls.push({ name, args })
        if (name === 'claim_product_price_status_refresh') {
          return {
            data: [
              { product_id: 10, generation: 2, lease_token: 'lease-10' },
              { product_id: 11, generation: 4, lease_token: 'lease-11' },
            ],
            error: null,
          }
        }
        if (name === 'fail_product_price_status_refresh') return { data: 'pending', error: null }
        throw new Error(`Unexpected RPC ${name}`)
      },
    },
    refreshBatch: async () => {
      throw new Error('temporary database timeout')
    },
    logger,
  })

  assert.deepEqual(await queue.processNextBatch(), { claimed: 2, completed: 0, failed: 2 })
  assert.equal(calls.filter(({ name }) => name === 'fail_product_price_status_refresh').length, 2)
  assert.equal(logger.errors.length, 1)
  queue.stop()
})

test('a stale lease acknowledgement is not reported as completed', async () => {
  const logger = createLogger()
  const queue = createDurablePriceStatusRefreshQueue({
    database: {
      async rpc(name) {
        if (name === 'claim_product_price_status_refresh') {
          return {
            data: [{ product_id: 10, generation: 3, lease_token: 'old-lease' }],
            error: null,
          }
        }
        return { data: 'lease_lost', error: null }
      },
    },
    refreshBatch: async (ids) => ids.map(statusRow),
    logger,
  })

  assert.deepEqual(await queue.processNextBatch(), { claimed: 1, completed: 0, failed: 1 })
  assert.equal(logger.warnings.length, 1)
  queue.stop()
})

test('missing fresh-analysis output is recorded as a failure and is never acknowledged', async () => {
  const calls = []
  const queue = createQueue({
    async rpc(name) {
      calls.push(name)
      if (name === 'claim_product_price_status_refresh') {
        return {
          data: [{ product_id: 10, generation: 1, lease_token: 'lease-10' }],
          error: null,
        }
      }
      if (name === 'fail_product_price_status_refresh') return { data: 'pending', error: null }
      throw new Error(`Unexpected RPC ${name}`)
    },
  }, async () => [])

  assert.deepEqual(await queue.processNextBatch(), { claimed: 1, completed: 0, failed: 1 })
  assert.deepEqual(calls, [
    'claim_product_price_status_refresh',
    'fail_product_price_status_refresh',
  ])
  queue.stop()
})

test('incomplete analysis details are recorded as failure rather than acknowledged', async () => {
  const calls = []
  const queue = createQueue({
    async rpc(name) {
      calls.push(name)
      if (name === 'claim_product_price_status_refresh') {
        return {
          data: [{ product_id: 10, generation: 1, lease_token: 'lease-10' }],
          error: null,
        }
      }
      if (name === 'fail_product_price_status_refresh') return { data: 'pending', error: null }
      throw new Error(`Unexpected RPC ${name}`)
    },
  }, async () => [{
    ...statusRow(10),
    analysis_details: {},
  }])

  assert.deepEqual(await queue.processNextBatch(), { claimed: 1, completed: 0, failed: 1 })
  assert.deepEqual(calls, [
    'claim_product_price_status_refresh',
    'fail_product_price_status_refresh',
  ])
  queue.stop()
})

test('database fence rejection does not acknowledge or overwrite a newer generation', async () => {
  const calls = []
  const logger = createLogger()
  const queue = createDurablePriceStatusRefreshQueue({
    database: {
      async rpc(name) {
        calls.push(name)
        if (name === 'claim_product_price_status_refresh') {
          return {
            data: [{ product_id: 10, generation: 2, lease_token: 'old-lease' }],
            error: null,
          }
        }
        if (name === 'save_and_complete_product_price_status_refresh') {
          return { data: 'superseded', error: null }
        }
        throw new Error(`Unexpected RPC ${name}`)
      },
    },
    refreshBatch: async () => [statusRow(10)],
    logger,
  })

  assert.deepEqual(await queue.processNextBatch(), { claimed: 1, completed: 0, failed: 1 })
  assert.deepEqual(calls, [
    'claim_product_price_status_refresh',
    'save_and_complete_product_price_status_refresh',
  ])
  assert.equal(logger.warnings.length, 1)
  queue.stop()
})

test('atomic save errors are persisted through the retry path', async () => {
  const calls = []
  const logger = createLogger()
  const failure = new Error('status constraint rejected result')
  const queue = createDurablePriceStatusRefreshQueue({
    database: {
      async rpc(name) {
        calls.push(name)
        if (name === 'claim_product_price_status_refresh') {
          return {
            data: [{ product_id: 10, generation: 1, lease_token: 'lease-10' }],
            error: null,
          }
        }
        if (name === 'save_and_complete_product_price_status_refresh') {
          return { data: null, error: failure }
        }
        if (name === 'fail_product_price_status_refresh') return { data: 'pending', error: null }
        throw new Error(`Unexpected RPC ${name}`)
      },
    },
    refreshBatch: async () => [statusRow(10)],
    logger,
  })

  assert.deepEqual(await queue.processNextBatch(), { claimed: 1, completed: 0, failed: 1 })
  assert.deepEqual(calls, [
    'claim_product_price_status_refresh',
    'save_and_complete_product_price_status_refresh',
    'fail_product_price_status_refresh',
  ])
  assert.equal(logger.errors.length, 1)
  queue.stop()
})

test('database connection failure is logged and leaves recovery to the persisted lease', async () => {
  const logger = createLogger()
  const queue = createDurablePriceStatusRefreshQueue({
    database: {
      async rpc() {
        return { data: null, error: new Error('connection lost') }
      },
    },
    refreshBatch: async () => {},
    logger,
  })

  assert.deepEqual(await queue.processNextBatch(), { claimed: 0, completed: 0, failed: 0 })
  assert.equal(logger.errors.length, 1)
  assert.match(logger.errors[0][0], /durable current price status refresh queue/)
  queue.stop()
})

test('concurrent process calls do not claim a second batch in one worker', async () => {
  let releaseClaim
  let claimCount = 0
  const claimPending = new Promise((resolve) => {
    releaseClaim = resolve
  })
  const queue = createQueue({
    async rpc(name) {
      if (name === 'claim_product_price_status_refresh') {
        claimCount += 1
        await claimPending
        return { data: [], error: null }
      }
      throw new Error(`Unexpected RPC ${name}`)
    },
  }, async () => {})

  const first = queue.processNextBatch()
  await new Promise((resolve) => setImmediate(resolve))
  const second = await queue.processNextBatch()
  releaseClaim()
  await first

  assert.deepEqual(second, { claimed: 0, completed: 0, failed: 0 })
  assert.equal(claimCount, 1)
  queue.stop()
})

test('rejects invalid worker settings before starting', () => {
  assert.throws(
    () => createQueue({ rpc() {} }, async () => {}, { batchSize: 101 }),
    /batchSize/,
  )
  assert.throws(
    () => createQueue({ rpc() {} }, async () => {}, { leaseSeconds: 10 }),
    /leaseSeconds/,
  )
})
