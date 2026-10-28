const USERNAME_PATTERN = /^[a-zA-Z0-9]{6,32}$/
const REGISTRATION_PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*[0-9])[a-zA-Z0-9]{8}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateCustomerRegistration({ username = '', email = '', password = '', confirmation = '' } = {}) {
  const errors = {}
  const cleanUsername = String(username).trim()
  const cleanEmail = String(email).trim()

  if (!USERNAME_PATTERN.test(cleanUsername)) errors.username = 'El usuario debe tener entre 6 y 32 caracteres alfanuméricos.'
  if (!EMAIL_PATTERN.test(cleanEmail)) errors.email = 'Ingresa un correo electrónico válido.'
  if (!REGISTRATION_PASSWORD_PATTERN.test(String(password))) errors.password = 'La contraseña debe tener exactamente 8 caracteres e incluir letras y números.'
  if (password !== confirmation) errors.confirmation = 'Las contraseñas no coinciden.'

  return errors
}

export function isValidCustomerUsername(username) {
  return USERNAME_PATTERN.test(String(username).trim())
}

export function isValidCustomerPassword(password) {
  return REGISTRATION_PASSWORD_PATTERN.test(String(password))
}