
    if (!session?.access_token) {
      if (!isLocalDevelopment) {
        throw new Error('Inicia sesión para guardar favoritos en tu cuenta.')
      }

      const nextFavorites = isFavorite
        ? favorites.filter((id) => id !== normalizedId)
        : [...favorites, normalizedId]

      const nextFavoriteProducts = isFavorite
        ? localFavoriteProducts.filter(
            (favoriteProduct) => String(favoriteProduct.id) !== normalizedId
          )
        : product &&
            !localFavoriteProducts.some(
              (favoriteProduct) => String(favoriteProduct.id) === normalizedId
            )
          ? [...localFavoriteProducts, product]
          : localFavoriteProducts

      localStorage.setItem(LOCAL_FAVORITES_KEY, JSON.stringify(nextFavorites))
      localStorage.setItem(
        LOCAL_FAVORITE_PRODUCTS_KEY,
        JSON.stringify(nextFavoriteProducts)
      )
      setFavorites(nextFavorites)
      setLocalFavoriteProducts(nextFavoriteProducts)
      setFavoritesError('')
      return
    }

    await requestCustomerJson(
      isFavorite
        ? `/customer/favorites/${encodeURIComponent(normalizedId)}`
        : '/customer/favorites',
      session.access_token,
      isFavorite
        ? { method: 'DELETE' }
        : { method: 'POST', body: JSON.stringify({ productId: normalizedId }) }
    )

    setFavorites((current) =>
      isFavorite
        ? current.filter((id) => id !== normalizedId)
        : current.includes(normalizedId)
          ? current
          : [...current, normalizedId]
    )
    setFavoritesError('')
  }, [favorites, localFavoriteProducts, session?.access_token])

  const signUp = async ({ username, email, password }) => {
    const result = await requestJson('/auth/customer-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.trim(),
        email: email.trim(),
        password,
      }),
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
    <CustomerAuthContext.Provider
      value={{
        configured: true,
        loading,
        user: session?.user || null,
        accessToken: session?.access_token || null,
        profile,
        refreshProfile,
        favorites,
        localFavoriteProducts,
        favoritesLoading,
        favoritesError,
        toggleFavorite,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  )
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext)
  if (!context) {
    throw new Error('useCustomerAuth must be used inside CustomerAuthProvider')
  }
  return context
}
