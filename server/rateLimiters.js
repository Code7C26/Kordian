const { rateLimit } = require('express-rate-limit')

const rateLimitMessage = {
  error: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo nuevamente.',
}

function createIpRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
  })
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

const customerIpReadRateLimit = createIpRateLimiter({
  windowMs: 60 * 1000,
  limit: 300,
})

const customerIpWriteRateLimit = createIpRateLimiter({
  windowMs: 60 * 1000,
  limit: 120,
})

const sharedListJoinIpRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
})

const customerRegisterIpRateLimit = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
})

const customerPasswordResetIpRateLimit = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
})

const customerPriceReportIpRateLimit = createIpRateLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
})

const customerLoginIpRateLimit = createIpRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
})

const customerRefreshIpRateLimit = createIpRateLimiter({
  windowMs: 60 * 1000,
  limit: 60,
})

const customerSessionIpRateLimit = createIpRateLimiter({
  windowMs: 60 * 1000,
  limit: 120,
})

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
  createIpRateLimiter,
  createCustomerRateLimiter,
  customerIpReadRateLimit,
  customerIpWriteRateLimit,
  sharedListJoinIpRateLimit,
  customerRegisterIpRateLimit,
  customerPasswordResetIpRateLimit,
  customerPriceReportIpRateLimit,
  customerLoginIpRateLimit,
  customerRefreshIpRateLimit,
  customerSessionIpRateLimit,
  customerReadRateLimit,
  customerWriteRateLimit,
  sharedListJoinRateLimit,
}
