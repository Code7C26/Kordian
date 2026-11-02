const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const {
  createIpRateLimiter,
  createCustomerRateLimiter,
  sharedListInvitationRateLimit,
} = require('./rateLimiters')

test('IP rate limits are shared across routes and isolated per client IP', async (t) => {
  const app = express()
  app.set('trust proxy', 'loopback')
  const limiter = createIpRateLimiter({ windowMs: 60_000, limit: 2 })

  app.get('/first', limiter, (_req, res) => res.sendStatus(200))
  app.get('/second', limiter, (_req, res) => res.sendStatus(200))

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const request = (route, ip) => fetch(`${baseUrl}${route}`, {
    headers: { 'x-forwarded-for': ip },
  })

  assert.equal((await request('/first', '192.0.2.1')).status, 200)
  assert.equal((await request('/second', '192.0.2.1')).status, 200)
  assert.equal((await request('/first', '192.0.2.1')).status, 429)
  assert.equal((await request('/first', '192.0.2.2')).status, 200)
})

test('IP rate limiter supports a route-specific response message', async (t) => {
  const app = express()
  const limiter = createIpRateLimiter({
    windowMs: 60_000,
    limit: 1,
    message: { error: 'Custom rate limit message.' },
  })

  app.get('/', limiter, (_req, res) => res.sendStatus(200))

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const url = `http://127.0.0.1:${server.address().port}`
  assert.equal((await fetch(url)).status, 200)
  const limitedResponse = await fetch(url)
  assert.equal(limitedResponse.status, 429)
  assert.deepEqual(await limitedResponse.json(), { error: 'Custom rate limit message.' })
})

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

test('shared-list invitation rate limit caps repeated invitations per customer', async (t) => {
  const app = express()
  const authenticate = (req, _res, next) => {
    req.customerUser = { id: req.get('x-test-customer') }
    next()
  }

  app.post('/', authenticate, sharedListInvitationRateLimit, (_req, res) => res.sendStatus(201))

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  }))

  const url = `http://127.0.0.1:${server.address().port}`
  const request = (customer) => fetch(url, {
    method: 'POST',
    headers: { 'x-test-customer': customer },
  })

  for (let attempt = 0; attempt < 10; attempt += 1) {
    assert.equal((await request('customer-a')).status, 201)
  }
  assert.equal((await request('customer-a')).status, 429)
  assert.equal((await request('customer-b')).status, 201)
})
