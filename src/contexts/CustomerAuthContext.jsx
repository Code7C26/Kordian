import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiUrl } from '../config/api.js'

const CustomerAuthContext = createContext(null)
const CUSTOMER_SESSION_KEY = 'arprice_customer_session'
const LOCAL_FAVORITES_KEY = 'arprice_local_favorites'
const LOCAL_FAVORITE_PRODUCTS_KEY = 'arprice_local_favorite_products'
export const isLocalDevelopment = import.meta.env.DEV

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_SESSION_KEY) || 'null')
  } catch {
    localStorage.removeItem(CUSTOMER_SESSION_KEY)
    return null
  }
}

function readLocalFavorites() {
  try {
    const storedFavorites = JSON.parse(localStorage.getItem(LOCAL_FAVORITES_KEY) || '[]')
    return Array.isArray(storedFavorites) ? storedFavorites.map(String) : []
  } catch {
    localStorage.removeItem(LOCAL_FAVORITES_KEY)
    return []
  }
}

function readLocalFavoriteProducts() {
  try {
    const storedProducts = JSON.parse(localStorage.getItem(LOCAL_FAVORITE_PRODUCTS_KEY) || '[]')
    return Array.isArray(storedProducts) ? storedProducts.filter((product) => product?.id != null) : []
  } catch {
    localStorage.removeItem(LOCAL_FAVORITE_PRODUCTS_KEY)
    return []
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
<<<<<<< Updated upstream
=======
  const [favorites, setFavorites] = useState(() =>
    isLocalDevelopment && !readStoredSession()?.access_token ? readLocalFavorites() : []
  )
  const [localFavoriteProducts, setLocalFavoriteProducts] = useState(() =>
    isLocalDevelopment && !readStoredSession()?.access_token ? readLocalFavoriteProducts() : []
  )
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState('')
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
=======
  useEffect(() => {
    if (!session?.access_token) {
      setFavorites(isLocalDevelopment ? readLocalFavorites() : [])
      setLocalFavoriteProducts(isLocalDevelopment ? readLocalFavoriteProducts() : [])
      setFavoritesError('')
      setFavoritesLoading(false)
      return undefined
    }

    let active = true
    setFavoritesLoading(true)
    setFavoritesError('')
    requestCustomerJson('/customer/favorites', session.access_token)
      .then((result) => {
        if (active) setFavorites(result.ids.map(String))
      })
      .catch((error) => {
        console.error('Customer favorites could not be loaded', error)
        if (active) {
          setFavorites([])
          setFavoritesError(error.message || 'No se pudieron cargar los favoritos.')
        }
      })
      .finally(() => {
        if (active) setFavoritesLoading(false)
      })

    return () => {
      active = false
    }
  }, [session?.access_token])

  const accessToken = session?.access_token
  const refreshProfile = useCallback(async () => {
    if (!accessToken) return null
    const result = await requestJson('/auth/customer-session', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    setProfile(result.profile)
    return result.profile
  }, [accessToken])

  const toggleFavorite = async (productId, product = null) => {
    const normalizedId = String(productId)
    const isFavorite = favorites.includes(normalizedId)
    if (!session?.access_token) {
      if (!isLocalDevelopment) throw new Error('Inicia sesión para guardar favoritos en tu cuenta.')
      const nextFavorites = isFavorite
        ? favorites.filter((id) => id !== normalizedId)
        : [...favorites, normalizedId]
      const nextFavoriteProducts = isFavorite
        ? localFavoriteProducts.filter((favoriteProduct) => String(favoriteProduct.id) !== normalizedId)
        : product && !localFavoriteProducts.some((favoriteProduct) => String(favoriteProduct.id) === normalizedId)
          ? [...localFavoriteProducts, product]
          : localFavoriteProducts
      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(nextFavorites))
      localStorage.setItem(LOCAL_FAVORITE_PRODUCTS_KEY, JSON.stringify(nextFavoriteProducts))
      setFavorites(nextFavorites)
      setLocalFavoriteProducts(nextFavoriteProducts)
      setFavoritesError('')
      return
    }

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
    setFavoritesError('')
  }

>>>>>>> Stashed changes
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
      accessToken: session?.access_token || null,
      profile,
<<<<<<< Updated upstream
=======
      refreshProfile,
      favorites,
      localFavoriteProducts,
      favoritesLoading,
      favoritesError,
      toggleFavorite,
>>>>>>> Stashed changes
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