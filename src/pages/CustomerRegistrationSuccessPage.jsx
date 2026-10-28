import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function CustomerRegistrationSuccessPage() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) return
    window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`)
  }, [location.hash, location.pathname, location.search])

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 text-center text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <p className="max-w-2xl text-xl font-semibold leading-relaxed" role="status">
        Cuenta verificada, inicia sesión en Ar-Price para empezar a navegar
      </p>
    </main>
  )
}
