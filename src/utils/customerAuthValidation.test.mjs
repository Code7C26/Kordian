import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidCustomerPassword, isValidCustomerUsername, validateCustomerRegistration } from './customerAuthValidation.js'

test('accepts alphanumeric usernames and four-character passwords', () => {
  assert.equal(isValidCustomerUsername('Usuario25'), true)
  assert.equal(isValidCustomerUsername('user.name'), false)
  assert.equal(isValidCustomerPassword('a1b2'), true)
  assert.equal(isValidCustomerPassword('abc'), false)
  assert.equal(isValidCustomerPassword('abc!'), false)
})

test('reports invalid registration fields and mismatched passwords', () => {
  const errors = validateCustomerRegistration({
    username: 'user name',
    email: 'not-an-email',
    password: '1234',
    confirmation: '4321',
  })

  assert.deepEqual(Object.keys(errors).sort(), ['confirmation', 'email', 'username'])
})

test('accepts a fully valid registration', () => {
  assert.deepEqual(validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: 'abc123',
    confirmation: 'abc123',
  }), {})
})