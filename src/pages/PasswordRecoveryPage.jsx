import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LoaderCircle, LockKeyhole } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { isValidCustomerPassword } from '../utils/customerAuthValidation.js'

export default function PasswordRecoveryPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { updatePassword } = useCustomerAuth()
  const accountType = new URLSearchParams(location.search).get('account') === 'admin' ? 'admin' : 'customer'
  const accessToken = new URLSearchParams(location.hash.slice(1)).get('access_token')
  const recoveryType = new URLSearchParams(location.hash.slice(1)).get('type')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    if (!accessToken || recoveryType !== 'recovery') {
      setError('El enlace de recuperación no es válido o venció. Solicita uno nuevo.')
      return
    }
    if (!isValidCustomerPassword(password)) {
      setError('La contraseña debe tener al menos 4 caracteres alfanuméricos.')
      return
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setIsSubmitting(true)
    try {
      await updatePassword({ accessToken, password })
      navigate(accountType === 'admin' ? '/login?password=updated' : '/ingresar?password=updated', { replace: true })
    } catch (updateError) {
      setError(updateError.message || 'No se pudo actualizar la contraseña.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-100 px-4 py-8 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <section className="w-full max-w-md rounded-xl border border-stone-200 bg-white px-5 py-7 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:px-8 sm:py-8">
        <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
          <LockKeyhole className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
          {accountType === 'admin' ? 'Cuenta de administrador' : 'Cuenta de cliente'}
        </p>
        <h1 className="mt-1 text-2xl font-black">Crear contraseña nueva</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          Elige una contraseña de al menos 4 caracteres alfanuméricos.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="recovery-password" className="mb-1.5 block text-sm font-semibold">Nueva contraseña</label>
            <input
              id="recovery-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              pattern="[A-Za-z0-9]{4,}"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 dark:border-stone-700 dark:bg-stone-950 dark:focus:ring-sky-950"
            />
          </div>
          <div>
            <label htmlFor="recovery-confirmation" className="mb-1.5 block text-sm font-semibold">Repetir contraseña</label>
            <input
              id="recovery-confirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={4}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 dark:border-stone-700 dark:bg-stone-950 dark:focus:ring-sky-950"
            />
          </div>
          {error && <p className="text-sm font-semibold text-rose-600" role="alert">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
            {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Actualizar contraseña
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
          <Link to={accountType === 'admin' ? '/login' : '/ingresar'} className="font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">
            Volver al inicio de sesión
          </Link>
        </p>
      </section>
    </main>
  )
}
