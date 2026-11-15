const DEFAULT_POLL_INTERVAL_MS = 60_000
const ERROR_LOG_INTERVAL_MS = 5 * 60_000

function isMonitorResult(value) {
  return value
    && typeof value === 'object'
    && typeof value.sampled_at === 'string'
    && Number.isFinite(Date.parse(value.sampled_at))
    && value.queue
    && Number.isInteger(value.queue.pending)
    && Number.isInteger(value.queue.processing)
    && Number.isInteger(value.queue.dead_letter)
    && Number.isInteger(value.queue.total)
    && Array.isArray(value.notifications)
}

function createDurablePriceStatusQueueMonitor({
  database,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  logger = console,
  alertDispatcher = null,
}) {
  if (!database || typeof database.rpc !== 'function') {
    throw new TypeError('A Supabase-compatible database client is required for queue monitoring')
  }
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) {
    throw new TypeError('pollIntervalMs must be a positive integer')
  }
  if (alertDispatcher !== null && typeof alertDispatcher !== 'function') {
    throw new TypeError('alertDispatcher must be a function when provided')
  }

  let started = false
  let stopped = false
  let timer = null
  let lastErrorSignature = null
  let lastErrorLoggedAt = 0

  async function pollNow() {
    const { data, error } = await database.rpc('monitor_product_price_status_refresh_queue')
    if (error) throw error
    if (!isMonitorResult(data)) {
      throw new TypeError('monitor_product_price_status_refresh_queue returned an invalid result')
    }

    for (const notification of data.notifications) {
      const details = {
        alertKey: notification.key,
        severity: notification.severity,
        threshold: notification.threshold,
        observedValue: notification.observed_value,
      }
      const alert = {
        key: notification.key,
        metric: notification.key.startsWith('queue_rows_')
          ? 'queue_physical_rows'
          : notification.key.startsWith('queue_age_')
            ? 'oldest_unresolved_age_seconds'
            : 'queue',
        severity: notification.severity,
        description: notification.description,
        threshold: notification.threshold,
        observedValue: notification.observed_value,
        observedAt: data.sampled_at,
        resolved: notification.resolved === true,
        context: {
          pending: data.queue.pending,
          processing: data.queue.processing,
          deadLetter: data.queue.dead_letter,
          total: data.queue.total,
          oldestEventAt: data.queue.oldest_event_at || null,
          oldestAgeSeconds: data.queue.oldest_age_seconds ?? null,
        },
      }
      if (notification.resolved) {
        logger.info('Durable price status queue alert resolved', details)
      } else if (notification.severity === 'warning') {
        logger.warn('Durable price status queue alert', details)
      } else {
        logger.error('Durable price status queue alert', details)
      }
      if (alertDispatcher) {
        try {
          await alertDispatcher(alert)
        } catch (error) {
          logger.error('Durable price status queue alert delivery failed', {
            ...details,
            errorType: error instanceof Error ? error.name : typeof error,
          })
        }
      }
    }

    if (lastErrorSignature) {
      logger.info('Durable price status queue monitoring recovered')
      lastErrorSignature = null
    }
    return data
  }

  function schedule() {
    if (stopped || timer) return
    timer = setTimeout(() => {
      timer = null
      void runScheduledPoll()
    }, pollIntervalMs)
    if (typeof timer.unref === 'function') timer.unref()
  }

  async function runScheduledPoll() {
    try {
      await pollNow()
    } catch (error) {
      const signature = `${error?.code || ''}:${error?.message || String(error)}`
      const now = Date.now()
      if (signature !== lastErrorSignature || now - lastErrorLoggedAt >= ERROR_LOG_INTERVAL_MS) {
        logger.error('Unable to monitor durable price status queue', error)
        lastErrorSignature = signature
        lastErrorLoggedAt = now
      }
    } finally {
      schedule()
    }
  }

  function start() {
    if (stopped) throw new Error('A stopped queue monitor cannot be restarted')
    if (started) return
    started = true
    void runScheduledPoll()
  }

  function stop() {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
  }

  return { pollNow, start, stop }
}

module.exports = {
  createDurablePriceStatusQueueMonitor,
}
