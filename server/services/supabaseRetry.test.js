const assert = require('node:assert/strict')
const { test } = require('node:test')
const { isTransientSupabaseError, withSupabaseRetry } = require('./supabaseRetry')

test('recognizes transient HTTP and network failures', () => {
  assert.equal(isTransientSupabaseError({ status: 503 }), true)
  assert.equal(isTransientSupabaseError({ cause: { code: 'ECONNRESET' } }), true)
  assert.equal(isTransientSupabaseError(new TypeError('fetch failed')), true)
})

test('retries a transient failure and returns the successful result', async () => {
  let calls = 0
  const result = await withSupabaseRetry(async () => {
    calls += 1
    if (calls === 1) throw { status: 503 }
    return 'ok'
  }, { baseDelayMs: 0 })

  assert.equal(result, 'ok')
  assert.equal(calls, 2)
})

test('does not retry permanent database errors', async () => {
  const error = { code: '42501', message: 'permission denied' }
  let calls = 0

  await assert.rejects(withSupabaseRetry(async () => {
    calls += 1
    throw error
  }, { baseDelayMs: 0 }), (actual) => actual === error)

  assert.equal(calls, 1)
})

test('stops after the configured attempt limit', async () => {
  const error = { cause: { code: 'ECONNRESET' } }
  let calls = 0

  await assert.rejects(withSupabaseRetry(async () => {
    calls += 1
    throw error
  }, { attempts: 3, baseDelayMs: 0 }), (actual) => actual === error)

  assert.equal(calls, 3)
})
