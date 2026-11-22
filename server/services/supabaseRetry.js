const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
])

function isTransientSupabaseError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status)
  if (TRANSIENT_HTTP_STATUSES.has(status)) return true
  if (status >= 500 && status <= 599) return true

  const code = error?.code || error?.cause?.code || error?.cause?.cause?.code
  if (typeof code === 'string'
    && (TRANSIENT_NETWORK_CODES.has(code) || code.startsWith('UND_ERR_'))) {
    return true
  }

  const errorText = [error?.message, error?.hint, error?.details]
    .filter(Boolean)
    .join(' ')
  return /fetch failed|network error|socket hang up|connection reset|timed out|request was aborted/i
    .test(errorText)
}

async function withSupabaseRetry(operation, { attempts = 3, baseDelayMs = 200 } = {}) {
  const maxAttempts = Number.isInteger(attempts) && attempts > 0 ? attempts : 1
  const delayMs = Number.isFinite(baseDelayMs) && baseDelayMs > 0 ? baseDelayMs : 0

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientSupabaseError(error)) throw error
      const backoffMs = delayMs * (2 ** (attempt - 1))
      if (backoffMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs))
      }
    }
  }
}

module.exports = { isTransientSupabaseError, withSupabaseRetry }
