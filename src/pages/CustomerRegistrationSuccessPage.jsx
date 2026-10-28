import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'

export default function CustomerRegistrationSuccessPage() {
  const location = useLocation()

  useEffect(() => {
    if (!location.hash) return
    window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`)
  }, [location.hash, location.pathname, location.search])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-50 px-6 text-center text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <span className="registration-success-badge inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" aria-hidden="true">
        <Check className="registration-success-check h-10 w-10" strokeWidth={3} />
      </span>
      <p className="max-w-2xl text-xl font-semibold leading-relaxed" role="status">
        Cuenta verificada, inicia sesión en Ar-Price para empezar a navegar
      </p>
    </main>
  )
}
