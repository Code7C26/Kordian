import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { apiUrl } from '../config/api.js'
import { useLanguage } from './LanguageContext.jsx'
import {
  clearCustomerSession,
  readCustomerSession,
  storeCustomerSession,
} from '../utils/customerSessionStorage.js'
import { clearSharedListNotifications } from '../utils/sharedListNotificationCleanup.js'

const CustomerAuthContext = createContext(null)

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), options)
  const payload = await response.json().catch(() => ({}))
  if (response.status === 404) {
    const error = new Error('El servidor todavía no tiene activadas las funciones de cuenta y recuperación de contraseña. Despliega la actualización del backend.')
    error.status = response.status
    throw error
  }
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo completar la solicitud.')
    error.status = response.status
    throw error
  }
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
    throw new Error('El servidor todavía no tiene activada esta función. Actualiza el backend.')
  }
  if (!response.ok) {
    const error = new Error(payload.error || 'No se pudo completar la solicitud.')
    error.status = response.status
    throw error
  }
  return payload
}

export function CustomerAuthProvider({ children }) {
  const { t } = useLanguage()
  const [session, setSession] = useState(() => readCustomerSession())
  const [logoutNotice, setLogoutNotice] = useState(false)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState([])
  const [favoritesAccountId, setFavoritesAccountId] = useState(session?.user?.id || null)
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState('')
  const [pendingNotificationCount, setPendingNotificationCount] = useState(0)
  const pushTokenRef = useRef('')
  const pushTokenRegistrationRef = useRef(Promise.resolve())
  const pushLifecycleRef = useRef(Promise.resolve())
  const pushRegistrationEnabledRef = useRef(false)

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
    const storedSession = readCustomerSession()
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
      } catch (sessionError) {
        if (sessionError.status !== 401) {
          console.error('Customer session could not be validated', sessionError)
          return
        }

        if (!storedSession.refresh_token) {
          if (active) {
            clearCustomerSession()
            setSession(null)
            setProfile(null)
          }
          return
        }

        try {
          const refreshed = await requestJson('/auth/customer-refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: storedSession.refresh_token }),
          })
          if (active) {
            storeCustomerSession(refreshed.session)
            setSession(refreshed.session)
            setProfile(refreshed.profile)
          }
        } catch (refreshError) {
          if (refreshError.status === 401 && active) {
            clearCustomerSession()
            setSession(null)
            setProfile(null)
          } else {
            console.error('Customer session could not be refreshed', refreshError)
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
    let intervalId
    // The access token expires after ~1 hour. Without this, an open tab keeps
    // polling with the expired token forever (403 bad_jwt on every request).
    const renewExpiredSession = async () => {
      window.clearInterval(intervalId)
      if (!session.refresh_token) {
        clearCustomerSession()
        setSession(null)
        setProfile(null)
        return
      }
      try {
        const refreshed = await requestJson('/auth/customer-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refresh_token }),
        })
        if (!active) return
        // Changing access_token re-runs this effect and restarts polling.
        storeCustomerSession(refreshed.session)
        setSession(refreshed.session)
        setProfile(refreshed.profile)
      } catch (refreshError) {
        if (!active) return
        if (refreshError.status === 401) {
          clearCustomerSession()
          setSession(null)
          setProfile(null)
        } else {
          console.error('Customer session could not be refreshed', refreshError)
        }
      }
    }
    const loadNotifications = async () => {
      try {
        const result = await requestCustomerJson('/customer/notifications', session.access_token)
        if (active) setPendingNotificationCount(Array.isArray(result) ? result.length : 0)
      } catch (error) {
        if (active && error.status === 401) {
          await renewExpiredSession()
          return
        }
        console.error('Customer notifications could not be loaded', error)
      }
    }

    loadNotifications()
    intervalId = window.setInterval(loadNotifications, 30000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [session?.access_token])

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return undefined

    let active = true
    const listeners = []
    const addListener = async (plugin, eventName, callback) => {
      const listener = await plugin.addListener(eventName, callback)
      if (active) listeners.push(listener)
      else await listener.remove()
    }

    const initializePushNotifications = async () => {
      await pushLifecycleRef.current
      if (!session?.access_token) {
        pushRegistrationEnabledRef.current = false
        await PushNotifications.unregister()
        await clearSharedListNotifications(LocalNotifications, PushNotifications)
        return
      }

      pushRegistrationEnabledRef.current = true
      await addListener(PushNotifications, 'registration', async ({ value }) => {
        if (!active || !pushRegistrationEnabledRef.current) return
        pushTokenRef.current = value
        const registration = requestCustomerJson('/customer/push-token', session.access_token, {
            method: 'POST',
            body: JSON.stringify({ token: value }),
          }).catch((error) => {
            console.error('Android push token could not be registered', error)
          })
        pushTokenRegistrationRef.current = registration
        await registration
      })
      await addListener(PushNotifications, 'registrationError', (error) => {
        console.error('Android push registration failed', error)
      })
      await addListener(PushNotifications, 'pushNotificationReceived', async (notification) => {
        if (!active || !pushRegistrationEnabledRef.current || !['shared_list_item_added', 'shared_list_invitation'].includes(notification.data?.type)) return
        try {
          const permission = await LocalNotifications.checkPermissions()
          if (!active || !pushRegistrationEnabledRef.current || permission.display !== 'granted') return
          await LocalNotifications.schedule({
            notifications: [{
              id: Math.floor(Math.random() * 2_147_483_647),
              title: notification.title || 'Lista compartida',
              body: notification.body || '',
              channelId: 'shared-list-activity',
              extra: notification.data,
            }],
          })
        } catch (error) {
          console.error('Android foreground push could not be displayed', error)
        }
      })

      const pushPermission = await PushNotifications.checkPermissions()
      const grantedPushPermission = pushPermission.receive === 'granted'
        ? pushPermission
        : await PushNotifications.requestPermissions()
      if (!active || grantedPushPermission.receive !== 'granted') return
      await PushNotifications.register()

      const localPermission = await LocalNotifications.checkPermissions()
      const grantedLocalPermission = localPermission.display === 'granted'
        ? localPermission
        : await LocalNotifications.requestPermissions()
      if (!active || grantedLocalPermission.display !== 'granted') return

      await LocalNotifications.createChannel({
        id: 'shared-list-activity',
        name: 'Listas compartidas',
        description: 'Invitaciones y actividad de tus listas compartidas',
        importance: 5,
      })
    }

    pushLifecycleRef.current = initializePushNotifications().catch((error) => {
      console.error('Android push notifications could not be initialized', error)
    })

    return () => {
      active = false
      pushRegistrationEnabledRef.current = false
      listeners.forEach((listener) => listener.remove())
    }
  }, [session?.access_token, session?.user?.id])

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
      storeCustomerSession(result.session)
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
    storeCustomerSession(result.session)
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
    const pushToken = pushTokenRef.current
    pushRegistrationEnabledRef.current = false
    if (Capacitor.getPlatform() === 'android') {
      await pushTokenRegistrationRef.current
      try {
        await PushNotifications.unregister()
      } catch (error) {
        console.error('Android push token could not be unregistered at sign-out', error)
      }
      try {
        await clearSharedListNotifications(LocalNotifications, PushNotifications)
      } catch (error) {
        console.error('Shared-list notifications could not be cleared at sign-out', error)
      }
    }
    if (session?.access_token && pushToken) {
      try {
        await requestCustomerJson('/customer/push-token', session.access_token, {
          method: 'DELETE',
          body: JSON.stringify({ token: pushToken }),
        })
      } catch (error) {
        console.error('Android push token could not be removed at sign-out', error)
      }
    }
    pushTokenRef.current = ''
    clearCustomerSession()
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