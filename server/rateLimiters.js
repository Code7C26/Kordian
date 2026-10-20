const { rateLimit } = require('express-rate-limit')

const rateLimitMessage = {
  error: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo nuevamente.',
}

function createCustomerRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `customer:${req.customerUser?.id || 'unknown'}`,
    message: rateLimitMessage,
  })
}

const customerReadRateLimit = createCustomerRateLimiter({
  windowMs: 60 * 1000,
  limit: 120,
})

const customerWriteRateLimit = createCustomerRateLimiter({
  windowMs: 60 * 1000,
  limit: 60,
})

const sharedListJoinRateLimit = createCustomerRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
})

module.exports = {
  createCustomerRateLimiter,
  customerReadRateLimit,
  customerWriteRateLimit,
  sharedListJoinRateLimit,
}
