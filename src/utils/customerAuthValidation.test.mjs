import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidCustomerPassword, isValidCustomerUsername, validateCustomerRegistration } from './customerAuthValidation.js'

test('accepts usernames with at least six alphanumeric characters and validates password format', () => {
  assert.equal(isValidCustomerUsername('Usuario25'), true)
  assert.equal(isValidCustomerUsername('user12'), true)
  assert.equal(isValidCustomerUsername('user1'), false)
  assert.equal(isValidCustomerUsername('user.name'), false)
  assert.equal(isValidCustomerUsername('user 12'), false)
  assert.equal(isValidCustomerPassword('a1b2'), true)
  assert.equal(isValidCustomerPassword('abc'), false)
  assert.equal(isValidCustomerPassword('abc!'), false)
})

test('reports invalid registration fields and mismatched passwords', () => {
  const errors = validateCustomerRegistration({
    username: 'user1',
    email: 'not-an-email',
    password: 'abc1234',
    confirmation: '4321',
  })

  assert.deepEqual(Object.keys(errors).sort(), ['confirmation', 'email', 'password', 'username'])
})

test('accepts a fully valid registration', () => {
  assert.deepEqual(validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: 'abc12345',
    confirmation: 'abc12345',
  }), {})
})

test('requires registration passwords to contain at least eight alphanumeric characters', () => {
  const errors = validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: 'abc1234',
    confirmation: 'abc1234',
  })

  assert.equal(errors.password, 'La contraseña debe tener al menos 8 caracteres alfanuméricos.')
  assert.equal(validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: 'abc12345!',
    confirmation: 'abc12345!',
  }).password, 'La contraseña debe tener al menos 8 caracteres alfanuméricos.')
})