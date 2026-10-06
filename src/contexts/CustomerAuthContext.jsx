import { createContext, useContext, useEffect, useState } from 'react'
import { apiUrl } from '../config/api.js'

const CustomerAuthContext = createContext(null)
const CUSTOMER_SESSION_KEY = 'arprice_customer_session'

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_SESSION_KEY) || 'null')
  } catch {
    localStorage.removeItem(CUSTOMER_SESSION_KEY)
    return null
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), options)
  const payload = await response.json().catch(() => ({}))
  if (response.status === 404) {
    throw new Error('El servidor todavía no tiene activado el registro de clientes. Despliega la actualización del backend.')
  }
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la solicitud.')
  return payload
}

export function CustomerAuthProvider({ children }) {
  const [session, setSession] = useState(() => readStoredSession())
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedSession = readStoredSession()
    if (!storedSession?.access_token) {
      setLoading(false)
      return undefined
    }

    let active = true
    const initializeSession = async () => {
      try {
        const result = await requestJson('/auth/customer-session', {
          headers: { Authorization: `Bearer ${storedSession.access_token}` },
        })
        if (active) setProfile(result.profile)
      } catch {
        try {
          if (!storedSession.refresh_token) throw new Error('Session expired')
          const refreshed = await requestJson('/auth/customer-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: storedSession.refresh_token }),
          })
          if (active) {
            localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(refreshed.session))
            setSession(refreshed.session)
            setProfile(refreshed.profile)
          }
        } catch {
          if (active) {
            localStorage.removeItem(CUSTOMER_SESSION_KEY)
            setSession(null)
            setProfile(null)
          }
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    initializeSession()

    return () => {
      active = false
    }
  }, [])

  const signUp = async ({ username, email, password }) => {
    const result = await requestJson('/auth/customer-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
    })
    if (result.session) {
      localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(result.session))
      setSession(result.session)
      setProfile({
        username: result.user?.user_metadata?.username || username.trim(),
        email: result.user?.email || email.trim(),
        role: 'customer',
      })
    }
    return result
  }

  const signIn = async ({ identifier, password }) => {
    const result = await requestJson('/auth/customer-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifier.trim(), password }),
    })
    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(result.session))
    setSession(result.session)
    setProfile(result.profile)
    return result
  }

  const signOut = async () => {
    localStorage.removeItem(CUSTOMER_SESSION_KEY)
    setSession(null)
    setProfile(null)
  }

  return (
    <CustomerAuthContext.Provider value={{
      configured: true,
      loading,
      user: session?.user || null,
      profile,
      signUp,
      signIn,
      signOut,
    }}>
      {children}
    </CustomerAuthContext.Provider>
  )
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext)
  if (!context) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider')
  return context
}