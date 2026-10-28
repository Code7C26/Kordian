import test from 'node:test'
import assert from 'node:assert/strict'
import { isValidCustomerPassword, isValidCustomerUsername, validateCustomerRegistration } from './customerAuthValidation.js'

test('accepts usernames with at least six alphanumeric characters and validates password format', () => {
  assert.equal(isValidCustomerUsername('Usuario25'), true)
  assert.equal(isValidCustomerUsername('user12'), true)
  assert.equal(isValidCustomerUsername('user1'), false)
  assert.equal(isValidCustomerUsername('user.name'), false)
  assert.equal(isValidCustomerUsername('user 12'), false)
  assert.equal(isValidCustomerPassword('a1b2C3d4'), true)
  assert.equal(isValidCustomerPassword('abcdefgh'), false)
  assert.equal(isValidCustomerPassword('12345678'), false)
  assert.equal(isValidCustomerPassword('a1b2C3d'), false)
  assert.equal(isValidCustomerPassword('a1b2C3d45'), false)
  assert.equal(isValidCustomerPassword('a1b2C3!4'), false)
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

test('requires registration passwords to contain exactly eight alphanumeric characters including letters and numbers', () => {
  const errors = validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: 'abcd123',
    confirmation: 'abcd123',
  })

  assert.equal(errors.password, 'La contraseña debe tener exactamente 8 caracteres e incluir letras y números.')
  assert.equal(validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: 'abc123456',
    confirmation: 'abc123456',
  }).password, 'La contraseña debe tener exactamente 8 caracteres e incluir letras y números.')
  assert.equal(validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: 'abcdefgh',
    confirmation: 'abcdefgh',
  }).password, 'La contraseña debe tener exactamente 8 caracteres e incluir letras y números.')
  assert.equal(validateCustomerRegistration({
    username: 'cliente2026',
    email: 'cliente@email.com',
    password: '12345678',
    confirmation: '12345678',
  }).password, 'La contraseña debe tener exactamente 8 caracteres e incluir letras y números.')
})