import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  clearCustomerSession,
  readCustomerSession,
  storeCustomerSession,
} from './customerSessionStorage.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

const originalLocalStorage = globalThis.localStorage
const originalSessionStorage = globalThis.sessionStorage

function setStorages() {
  globalThis.localStorage = createStorage()
  globalThis.sessionStorage = createStorage()
}

afterEach(() => {
  globalThis.localStorage = originalLocalStorage
  globalThis.sessionStorage = originalSessionStorage
})

test('persists a customer session beyond the current browser tab', () => {
  setStorages()
  const session = { access_token: 'access-token', refresh_token: 'refresh-token' }

  storeCustomerSession(session)

  assert.deepEqual(readCustomerSession(), session)
  assert.equal(sessionStorage.getItem('arprice_customer_session'), null)
  assert.equal(localStorage.getItem('arprice_customer_session'), JSON.stringify(session))
})

test('migrates a session stored in sessionStorage to persistent storage', () => {
  setStorages()
  const session = { access_token: 'legacy-access-token' }
  sessionStorage.setItem('arprice_customer_session', JSON.stringify(session))

  assert.deepEqual(readCustomerSession(), session)
  assert.equal(sessionStorage.getItem('arprice_customer_session'), null)
  assert.equal(localStorage.getItem('arprice_customer_session'), JSON.stringify(session))
})

test('clears persistent and legacy session storage on logout', () => {
  setStorages()
  localStorage.setItem('arprice_customer_session', '{"access_token":"persistent"}')
  sessionStorage.setItem('arprice_customer_session', '{"access_token":"temporary"}')

  clearCustomerSession()

  assert.equal(localStorage.getItem('arprice_customer_session'), null)
  assert.equal(sessionStorage.getItem('arprice_customer_session'), null)
})
