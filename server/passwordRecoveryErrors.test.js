const assert = require('node:assert/strict')
const test = require('node:test')
const { getPasswordRecoveryFailure } = require('./passwordRecoveryErrors')

test('explains when Supabase rate-limits recovery emails', () => {
  assert.deepEqual(
    getPasswordRecoveryFailure({ code: 'over_email_send_rate_limit', status: 429 }),
    {
      status: 429,
      message: 'Se enviaron demasiados correos de recuperación. Espera unos minutos antes de volver a intentar.',
    },
  )
})

test('explains when Supabase only authorizes configured email recipients', () => {
  assert.deepEqual(
    getPasswordRecoveryFailure({ code: 'email_address_not_authorized' }),
    {
      status: 503,
      message: 'El proveedor de correo de Supabase no autoriza esta dirección. Configura un proveedor SMTP para enviar correos a cualquier cuenta.',
    },
  )
})

test('explains when the Supabase email provider is disabled', () => {
  assert.deepEqual(
    getPasswordRecoveryFailure({ code: 'email_provider_disabled' }),
    {
      status: 503,
      message: 'El envío de correos está desactivado en Supabase. Revisa la configuración de autenticación.',
    },
  )
})

test('rejects malformed email addresses distinctly', () => {
  assert.deepEqual(
    getPasswordRecoveryFailure({ code: 'email_address_invalid' }),
    {
      status: 400,
      message: 'La dirección de correo no es válida.',
    },
  )
})

test('keeps unknown provider errors generic and does not expose their details', () => {
  assert.deepEqual(
    getPasswordRecoveryFailure({ code: 'unexpected_failure', message: 'SMTP password leaked' }),
    {
      status: 503,
      message: 'No se pudo enviar el correo de recuperación. Revisa la configuración del proveedor de correo en Supabase.',
    },
  )
})
