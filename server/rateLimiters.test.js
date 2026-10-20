const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const { createCustomerRateLimiter } = require('./rateLimiters')

test('customer rate limits are shared across routes and isolated per customer', async (t) => {
  const app = express()
  const limiter = createCustomerRateLimiter({ windowMs: 60_000, limit: 2 })
  const authenticate = (req, _res, next) => {
    req.customerUser = { id: req.get('x-test-customer') }
    next()
  }

  app.get('/first', authenticate, limiter, (_req, res) => res.sendStatus(200))
  app.get('/second', authenticate, limiter, (_req, res) => res.sendStatus(200))

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const request = (route, customer) => fetch(`${baseUrl}${route}`, {
    headers: { 'x-test-customer': customer },
  })

  assert.equal((await request('/first', 'customer-a')).status, 200)
  assert.equal((await request('/second', 'customer-a')).status, 200)

  const limitedResponse = await request('/first', 'customer-a')
  assert.equal(limitedResponse.status, 429)
  assert.deepEqual(await limitedResponse.json(), {
    error: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo nuevamente.',
  })
  assert.ok(limitedResponse.headers.has('ratelimit-limit'))

  assert.equal((await request('/first', 'customer-b')).status, 200)
})
