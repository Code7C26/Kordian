function getPasswordRecoveryFailure(error) {
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) {
    return {
      status: 429,
      message: 'Se enviaron demasiados correos de recuperación. Espera unos minutos antes de volver a intentar.',
    }
  }

  if (error?.code === 'email_address_not_authorized') {
    return {
      status: 503,
      message: 'El proveedor de correo de Supabase no autoriza esta dirección. Configura un proveedor SMTP para enviar correos a cualquier cuenta.',
    }
  }

  if (error?.code === 'email_provider_disabled') {
    return {
      status: 503,
      message: 'El envío de correos está desactivado en Supabase. Revisa la configuración de autenticación.',
    }
  }

  if (error?.code === 'email_address_invalid') {
    return {
      status: 400,
      message: 'La dirección de correo no es válida.',
    }
  }

  return {
    status: 503,
    message: 'No se pudo enviar el correo de recuperación. Revisa la configuración del proveedor de correo en Supabase.',
  }
}

module.exports = { getPasswordRecoveryFailure }
