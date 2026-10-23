function readUrlParams(value, prefix) {
  return new URLSearchParams(value.startsWith(prefix) ? value.slice(1) : value)
}

export function parsePasswordRecoveryLink({ search = '', hash = '' } = {}) {
  const queryParams = readUrlParams(search, '?')
  const hashParams = readUrlParams(hash, '#')
  const errorCode = queryParams.get('error_code')
    || hashParams.get('error_code')
    || queryParams.get('error')
    || hashParams.get('error')
  const errorDescription = queryParams.get('error_description')
    || hashParams.get('error_description')
  const hasInvalidLinkError = Boolean(errorCode || errorDescription)

  return {
    accountType: queryParams.get('account') === 'admin' ? 'admin' : 'customer',
    accessToken: hashParams.get('access_token') || queryParams.get('access_token') || '',
    tokenHash: queryParams.get('token_hash') || hashParams.get('token_hash') || '',
    recoveryType: hashParams.get('type') || queryParams.get('type') || '',
    error: hasInvalidLinkError
      ? 'El enlace de recuperación no es válido o venció. Solicita uno nuevo.'
      : '',
  }
}
