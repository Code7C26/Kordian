const assert = require('node:assert/strict')
const test = require('node:test')
const { getCustomerConfirmationRedirectUrl, getFrontendUrl } = require('./passwordRecoveryRedirect')

test('uses the public app URL when no frontend URL is configured', () => {
  assert.equal(getFrontendUrl(''), 'https://ar-price.netlify.app/')
})

test('preserves a configured public frontend URL', () => {
  assert.equal(getFrontendUrl('https://example.com/app'), 'https://example.com/app')
})

test('redirects customer confirmation to the registration success page', () => {
  assert.equal(
    getCustomerConfirmationRedirectUrl('https://example.com'),
    'https://example.com/registro-exitoso',
  )
})

test('does not create localhost recovery links in production', () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    assert.equal(getFrontendUrl('http://localhost:5173'), 'https://ar-price.netlify.app')
    assert.equal(getFrontendUrl('http://127.0.0.1:5173'), 'https://ar-price.netlify.app')
    assert.equal(
      getCustomerConfirmationRedirectUrl('http://localhost:5173'),
      'https://ar-price.netlify.app/registro-exitoso',
    )
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
