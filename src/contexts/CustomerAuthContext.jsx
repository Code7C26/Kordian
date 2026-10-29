import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiUrl } from '../config/api.js'
import { useLanguage } from './LanguageContext.jsx'

const CustomerAuthContext = createContext(null)
const CUSTOMER_SESSION_KEY = 'arprice_customer_session'

function readStoredSession() {
  const currentSession = sessionStorage.getItem(CUSTOMER_SESSION_KEY)
  if (currentSession) {
    try {
      return JSON.parse(currentSession)
    } catch {
      sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
      return null
    }
  }

  const legacySession = localStorage.getItem(CUSTOMER_SESSION_KEY)
  if (!legacySession) return null

  try {
    const parsedSession = JSON.parse(legacySession)
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, legacySession)
    localStorage.removeItem(CUSTOMER_SESSION_KEY)
    return parsedSession
  } catch {
    localStorage.removeItem(CUSTOMER_SESSION_KEY)
    return null
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), options)
  const payload = await response.json().catch(() => ({}))
  if (response.status === 404) {
    throw new Error('El servidor todavía no tiene activadas las funciones de cuenta y recuperación de contraseña. Despliega la actualización del backend.')
  }
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la solicitud.')
  return payload
}

async function requestCustomerJson(path, accessToken, options = {}) {
  const headers = new Headers(options.headers || {})
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(apiUrl(path), { ...options, headers })
  const payload = await response.json().catch(() => ({}))
  if (response.status === 404) {
    throw new Error('El servidor todavía no tiene activada la función de favoritos. Actualiza el backend.')
  }
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la solicitud.')
  return payload
}

export function CustomerAuthProvider({ children }) {
  const { t } = useLanguage()
  const [session, setSession] = useState(() => readStoredSession())
  const [logoutNotice, setLogoutNotice] = useState(false)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState([])
  const [favoritesAccountId, setFavoritesAccountId] = useState(session?.user?.id || null)
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState('')
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0)

  useEffect(() => {
    if (!logoutNotice) return undefined
    const timeoutId = window.setTimeout(() => setLogoutNotice(false), 3500)
    return () => window.clearTimeout(timeoutId)
  }, [logoutNotice])

  const refreshProfile = useCallback(async () => {
    if (!session?.access_token) {
      throw new Error('Inicia sesión para actualizar los datos de tu cuenta.')
    }

    const result = await requestJson('/auth/customer-session', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setProfile(result.profile)
    return result.profile
  }, [session])

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
            sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(refreshed.session))
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

  useEffect(() => {
    if (!session?.access_token) {
      setFavorites([])
      setFavoritesAccountId(null)
      setFavoritesError('')
      setFavoritesLoading(false)
      return undefined
    }

    let active = true
    const accountId = session.user?.id || null
    setFavoritesLoading(true)
    setFavoritesError('')
    requestCustomerJson('/customer/favorites', session.access_token)
      .then((result) => {
        if (active) {
          setFavorites(result.ids.map(String))
          setFavoritesAccountId(accountId)
        }
      })
      .catch((error) => {
        console.error('Customer favorites could not be loaded', error)
        if (active) {
          setFavorites([])
          setFavoritesAccountId(accountId)
          setFavoritesError(error.message || 'No se pudieron cargar los favoritos.')
        }
      })
      .finally(() => {
        if (active) setFavoritesLoading(false)
      })

    return () => {
      active = false
    }
  }, [session?.access_token, session?.user?.id])

  const refreshNotifications = useCallback(async () => {
    if (!session?.access_token) {
      setPendingNotificationCount(0)
      return []
    }

    const result = await requestCustomerJson('/customer/notifications', session.access_token)
    setPendingNotificationCount(Array.isArray(result) ? result.length : 0)
    return result
  }, [session])

  useEffect(() => {
    if (!session?.access_token) {
      setPendingNotificationCount(0)
      return undefined
    }

    let active = true
    const loadNotifications = async () => {
      try {
        const result = await requestCustomerJson('/customer/notifications', session.access_token)
        if (active) setPendingNotificationCount(Array.isArray(result) ? result.length : 0)
      } catch (error) {
        console.error('Customer notifications could not be loaded', error)
      }
    }

    loadNotifications()
    const intervalId = window.setInterval(loadNotifications, 30000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [session?.access_token])

  const toggleFavorite = async (productId) => {
    const normalizedId = String(productId)
    if (!session?.access_token) throw new Error('Inicia sesión para guardar favoritos en tu cuenta.')

    const accountFavorites = favoritesAccountId === session.user?.id ? favorites : []
    const isFavorite = accountFavorites.includes(normalizedId)
    await requestCustomerJson(
      isFavorite ? `/customer/favorites/${encodeURIComponent(normalizedId)}` : '/customer/favorites',
      session.access_token,
      isFavorite
        ? { method: 'DELETE' }
        : { method: 'POST', body: JSON.stringify({ productId: normalizedId }) },
    )
    setFavorites((current) => isFavorite
      ? current.filter((id) => id !== normalizedId)
      : current.includes(normalizedId) ? current : [...current, normalizedId])
    setFavoritesAccountId(session.user?.id || null)
    setFavoritesError('')
  }

  const signUp = async ({ username, email, password }) => {
    const result = await requestJson('/auth/customer-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
    })
    if (result.session) {
      sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(result.session))
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
    sessionStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(result.session))
    setSession(result.session)
    setProfile(result.profile)
    return result
  }

  const createAdminSession = useCallback(async (accessToken = session?.access_token) => {
    if (!accessToken) throw new Error('Inicia sesión con una cuenta administradora para continuar.')
    const result = await requestJson('/auth/admin-session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    localStorage.setItem('adminAuth', 'true')
    localStorage.setItem('adminToken', result.token)
    localStorage.setItem('currentAdmin', result.username)
    return result
  }, [session])

  const requestPasswordReset = async (identifier, accountType = 'customer') => {
    const path = accountType === 'admin' ? '/auth/admin-password-reset' : '/auth/customer-password-reset'
    const body = accountType === 'admin'
      ? { email: identifier.trim() }
      : { identifier: identifier.trim() }
    return requestJson(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const updatePassword = async ({ accessToken, tokenHash, password }) => requestJson('/auth/password-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, tokenHash, password }),
  })

  const signOut = async ({ showNotice = true } = {}) => {
    const hadSession = Boolean(session)
    sessionStorage.removeItem(CUSTOMER_SESSION_KEY)
    setSession(null)
    setProfile(null)
    setFavorites([])
    setFavoritesAccountId(null)
    if (showNotice && hadSession) setLogoutNotice(true)
  }

  return (
    <>
    <CustomerAuthContext.Provider value={{
      configured: true,
      loading,
      user: session?.user || null,
      accessToken: session?.access_token || null,
      profile,
      refreshProfile,
      pendingNotificationCount,
      refreshNotifications,
      favorites: favoritesAccountId === (session?.user?.id || null) ? favorites : [],
      favoritesLoading,
      favoritesError,
      toggleFavorite,
      signUp,
      signIn,
      createAdminSession,
      requestPasswordReset,
      updatePassword,
      signOut,
    }}>
      {children}
    </CustomerAuthContext.Provider>
    {logoutNotice && (
      <div className="fixed bottom-5 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-900 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="status" aria-live="polite">
        {t('Cerraste sesión en tu cuenta')}
      </div>
    )}
    </>
  )
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext)
  if (!context) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider')
  return context
}