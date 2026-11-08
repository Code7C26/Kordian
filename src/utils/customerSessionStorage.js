const CUSTOMER_SESSION_KEY = 'arprice_customer_session'

export function readCustomerSession() {
  const persistentSession = localStorage.getItem(CUSTOMER_SESSION_KEY)
  if (persistentSession) {
    try {
      const session = JSON.parse(persistentSession)
      sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
      return session
    } catch {
      localStorage.removeItem(CUSTOMER_SESSION_KEY)
    }
  }

  const temporarySession = sessionStorage.getItem(CUSTOMER_SESSION_KEY)
  if (!temporarySession) return null

  try {
    const session = JSON.parse(temporarySession)
    localStorage.setItem(CUSTOMER_SESSION_KEY, temporarySession)
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
    return session
  } catch {
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
    return null
  }
}

export function storeCustomerSession(session) {
  localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(session))
  sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
}

export function clearCustomerSession() {
  localStorage.removeItem(CUSTOMER_SESSION_KEY)
  sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
}
