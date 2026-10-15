const USERNAME_PATTERN = /^[a-zA-Z0-9]{1,32}$/
const PASSWORD_PATTERN = /^[a-zA-Z0-9]{4,}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCustomerRegistration({ username = '', email = '', password = '', confirmation = '' } = {}) {
  const errors = {}
  const cleanUsername = String(username).trim()
  const cleanEmail = String(email).trim()

  if (!USERNAME_PATTERN.test(cleanUsername)) errors.username = 'Usa solo letras y números (máximo 32 caracteres).'
  if (!EMAIL_PATTERN.test(cleanEmail)) errors.email = 'Ingresa un correo electrónico válido.'
  if (!PASSWORD_PATTERN.test(String(password))) errors.password = 'La contraseña debe tener al menos 4 caracteres alfanuméricos.'
  if (password !== confirmation) errors.confirmation = 'Las contraseñas no coinciden.'

  return errors
}

export function isValidCustomerUsername(username) {
  return USERNAME_PATTERN.test(String(username).trim())
}

export function isValidCustomerPassword(password) {
  return PASSWORD_PATTERN.test(String(password))
}