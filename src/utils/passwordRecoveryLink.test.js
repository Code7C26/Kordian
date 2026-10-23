import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePasswordRecoveryLink } from './passwordRecoveryLink.js'

test('reads the Supabase recovery token from the URL fragment', () => {
  assert.deepEqual(
    parsePasswordRecoveryLink({
      search: '?account=admin',
      hash: '#access_token=recovery-token&type=recovery',
    }),
    {
      accountType: 'admin',
      accessToken: 'recovery-token',
      tokenHash: '',
      recoveryType: 'recovery',
      error: '',
    },
  )
})

test('also accepts recovery values returned as query parameters', () => {
  assert.deepEqual(
    parsePasswordRecoveryLink({
      search: '?account=customer&access_token=recovery-token&type=recovery',
    }),
    {
      accountType: 'customer',
      accessToken: 'recovery-token',
      tokenHash: '',
      recoveryType: 'recovery',
      error: '',
    },
  )
})

test('reads a recovery token hash from query parameters', () => {
  assert.deepEqual(
    parsePasswordRecoveryLink({
      search: '?account=customer&token_hash=one-time-token&type=recovery',
    }),
    {
      accountType: 'customer',
      accessToken: '',
      tokenHash: 'one-time-token',
      recoveryType: 'recovery',
      error: '',
    },
  )
})

test('surfaces an expired recovery-link error returned by Supabase', () => {
  const result = parsePasswordRecoveryLink({
    search: '?error=access_denied&error_code=otp_expired&error_description=Email+link+has+expired',
  })

  assert.equal(result.accessToken, '')
  assert.equal(result.tokenHash, '')
  assert.equal(result.error, 'El enlace de recuperación no es válido o venció. Solicita uno nuevo.')
})
