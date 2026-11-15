const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createDurablePriceStatusQueueMonitor } = require('./durablePriceStatusQueueMonitor')

function result(notifications = []) {
  return {
    sampled_at: '2026-11-14T12:00:00.000Z',
    queue: {
      pending: 15_000,
      processing: 0,
      dead_letter: 0,
      total: 15_000,
      oldest_event_at: '2026-11-14T11:00:00.000Z',
      oldest_age_seconds: 3600,
    },
    notifications,
  }
}

test('polls the monitoring RPC and reports alerts without claiming queue work', async () => {
  const calls = []
  const logs = []
  const monitor = createDurablePriceStatusQueueMonitor({
    database: {
      async rpc(name) {
        calls.push(name)
        return {
          data: result([
            { key: 'queue_rows_warning_15000', severity: 'warning', threshold: 15_000, observed_value: 15_000 },
            { key: 'queue_age_warning_12h', severity: 'warning', resolved: true },
          ]),
          error: null,
        }
      },
    },
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
    },
  })

  const observed = await monitor.pollNow()

  assert.equal(observed.queue.total, 15_000)
  assert.deepEqual(calls, ['monitor_product_price_status_refresh_queue'])
  assert.equal(logs[0][0], 'warn')
  assert.match(logs[0][1], /queue alert/)
  assert.equal(logs[1][0], 'info')
  monitor.stop()
})

test('fails explicitly when the monitoring RPC is unavailable or malformed', async () => {
  const monitor = createDurablePriceStatusQueueMonitor({
    database: { async rpc() { return { data: null, error: { code: 'PGRST202' } } } },
    logger: { info() {}, warn() {}, error() {} },
  })
  await assert.rejects(monitor.pollNow(), { code: 'PGRST202' })
  monitor.stop()
})

test('dispatches generated alerts through the optional transport boundary', async () => {
  const delivered = []
  const monitor = createDurablePriceStatusQueueMonitor({
    database: {
      async rpc() {
        return {
          data: result([{
            key: 'queue_age_critical_18h',
            severity: 'critical',
            description: 'Oldest unresolved event exceeds 18 hours',
            threshold: 64_800,
            observed_value: 65_000,
            resolved: false,
          }, {
            key: 'queue_age_warning_12h',
            severity: 'warning',
            description: 'Oldest unresolved event age warning resolved',
            threshold: 43_200,
            observed_value: 3_600,
            resolved: true,
          }]),
          error: null,
        }
      },
    },
    alertDispatcher: async (alert) => delivered.push(alert),
    logger: { info() {}, warn() {}, error() {} },
  })

  await monitor.pollNow()

  assert.deepEqual(delivered, [{
    key: 'queue_age_critical_18h',
    metric: 'oldest_unresolved_age_seconds',
    severity: 'critical',
    description: 'Oldest unresolved event exceeds 18 hours',
    threshold: 64_800,
    observedValue: 65_000,
    observedAt: '2026-11-14T12:00:00.000Z',
    resolved: false,
    context: {
      pending: 15_000,
      processing: 0,
      deadLetter: 0,
      total: 15_000,
      oldestEventAt: '2026-11-14T11:00:00.000Z',
      oldestAgeSeconds: 3600,
    },
  }, {
    key: 'queue_age_warning_12h',
    metric: 'oldest_unresolved_age_seconds',
    severity: 'warning',
    description: 'Oldest unresolved event age warning resolved',
    threshold: 43_200,
    observedValue: 3_600,
    observedAt: '2026-11-14T12:00:00.000Z',
    resolved: true,
    context: {
      pending: 15_000,
      processing: 0,
      deadLetter: 0,
      total: 15_000,
      oldestEventAt: '2026-11-14T11:00:00.000Z',
      oldestAgeSeconds: 3600,
    },
  }])
  monitor.stop()
})

test('logs alert delivery failures without failing queue monitoring', async () => {
  const logs = []
  const monitor = createDurablePriceStatusQueueMonitor({
    database: {
      async rpc() {
        return {
          data: result([{
            key: 'queue_rows_warning_15000',
            severity: 'warning',
            threshold: 15_000,
            observed_value: 15_000,
            resolved: false,
          }]),
          error: null,
        }
      },
    },
    alertDispatcher: async () => {
      throw new Error('transport detail must not be logged')
    },
    logger: {
      info() {},
      warn() {},
      error: (...args) => logs.push(args),
    },
  })

  const observed = await monitor.pollNow()

  assert.equal(observed.queue.total, 15_000)
  assert.equal(logs.length, 1)
  assert.equal(logs[0][0], 'Durable price status queue alert delivery failed')
  assert.equal(logs[0][1].alertKey, 'queue_rows_warning_15000')
  assert.equal(logs[0][1].errorType, 'Error')
  assert.doesNotMatch(JSON.stringify(logs), /transport detail must not be logged/)
  monitor.stop()
})
