import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { validateCustomerRegistration } from '../utils/customerAuthValidation.js'

export default function CustomerAuthPage({ mode = 'login' }) {
  const isRegistration = mode === 'register'
  const navigate = useNavigate()
  const { signIn, signUp } = useCustomerAuth()
  const [username, setUsername] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState(null)
  const [busy, setBusy] = useState(false)

  const showToast = (message, type = 'error') => setToast({ message, type })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setToast(null)

    if (isRegistration) {
      const nextErrors = validateCustomerRegistration({ username, email, password, confirmation })
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length) {
        showToast('Revisa los campos marcados antes de continuar.')
        return
      }
    } else if (!identifier.trim() || password.length < 4) {
      setErrors({ credentials: 'Ingresa tu correo o usuario y una contraseña de 4 caracteres como mínimo.' })
      showToast('Completa tus credenciales para ingresar.')
      return
    } else {
      setErrors({})
    }

    setBusy(true)
    try {
      if (isRegistration) {
        const result = await signUp({ username, email, password })
        if (result.session) {
          navigate('/', { replace: true })
          return
        }
        showToast('Cuenta creada. Confirma tu correo para activar el acceso.', 'success')
      } else {
        await signIn({ identifier, password })
        navigate('/', { replace: true })
      }
    } catch (error) {
      const message = String(error?.message || '')
      const normalized = message.toLowerCase()
      const friendly = normalized.includes('already registered') || normalized.includes('already been registered')
        ? 'Este correo ya se encuentra registrado.'
        : normalized.includes('customer_profiles_username_lower_unique') || normalized.includes('duplicate key') || normalized.includes('username')
          ? 'Este usuario ya se encuentra registrado o no es válido.'
          : isRegistration && normalized.includes('database error saving new user')
            ? 'No se pudo crear el perfil. Revisa si el usuario ya está registrado e inténtalo nuevamente.'
          : normalized.includes('invalid login credentials') || normalized.includes('invalid credentials')
            ? 'Credenciales inválidas.'
            : message || 'No se pudo completar la solicitud.'
      if (isRegistration && normalized.includes('username')) setErrors({ username: 'Este usuario ya se encuentra registrado.' })
      if (!isRegistration) setErrors({ credentials: friendly })
      showToast(friendly)
    } finally {
      setBusy(false)
    }
  }

  const fieldClass = (hasError = false) => `w-full rounded-lg border bg-white px-3 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:ring-2 dark:bg-stone-950 dark:text-white ${hasError ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 dark:focus:ring-rose-950' : 'border-stone-300 focus:border-sky-600 focus:ring-sky-100 dark:border-stone-700 dark:focus:ring-sky-950'}`

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center gap-12">
        <section className="hidden max-w-md flex-1 lg:block">
          <Link to="/" className="mb-10 inline-flex items-center gap-3 text-sm font-bold text-sky-700 dark:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver a AR-Price
          </Link>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">Ar-Price · Alta Gracia</p>
          <h1 className="mt-4 text-4xl font-black leading-tight">{isRegistration ? 'Tu próxima compra empieza acá.' : 'Qué bueno verte de nuevo.'}</h1>
          <p className="mt-4 max-w-sm text-base leading-7 text-stone-600 dark:text-stone-400">
            {isRegistration ? 'Crea tu cuenta para guardar favoritos y seguir tus precios.' : 'Ingresa para volver a tus favoritos y alertas de precios.'}
          </p>
          <div className="mt-8 h-1 w-20 rounded bg-emerald-500" />
        </section>

        <section className="w-full max-w-md border-y border-stone-200 bg-white px-5 py-7 dark:border-stone-800 dark:bg-stone-900 sm:rounded-xl sm:border sm:px-8 sm:py-8">
          <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-sky-700 dark:text-stone-400 dark:hover:text-sky-300 lg:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
          </Link>
          <div className="mb-7">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              {isRegistration ? <UserRound className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">Cuenta de cliente</p>
            <h2 className="mt-1 text-2xl font-black">{isRegistration ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              {isRegistration ? 'Completa tus datos para registrarte en Ar-Price.' : 'Usa tu correo electrónico o nombre de usuario.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {isRegistration ? (
              <>
                <div>
                  <label htmlFor="customer-username" className="mb-1.5 block text-sm font-semibold">Usuario</label>
                  <input id="customer-username" name="username" autoComplete="username" required maxLength={32} value={username} onChange={(event) => setUsername(event.target.value)} className={fieldClass(Boolean(errors.username))} placeholder="Ej. cliente2026" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-error' : undefined} />
                  {errors.username && <p id="username-error" className="mt-1 text-xs font-medium text-rose-600">{errors.username}</p>}
                </div>
                <div>
                  <label htmlFor="customer-email" className="mb-1.5 block text-sm font-semibold">Email</label>
                  <input id="customer-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass(Boolean(errors.email))} placeholder="usuario@email.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
                  {errors.email && <p id="email-error" className="mt-1 text-xs font-medium text-rose-600">{errors.email}</p>}
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="customer-identifier" className="mb-1.5 block text-sm font-semibold">Email o usuario</label>
                <input id="customer-identifier" name="username" autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} className={fieldClass(Boolean(errors.credentials))} placeholder="usuario@email.com o cliente2026" aria-invalid={Boolean(errors.credentials)} />
              </div>
            )}

            <div>
              <label htmlFor="customer-password" className="mb-1.5 block text-sm font-semibold">Contraseña</label>
              <input id="customer-password" name="password" type="password" autoComplete={isRegistration ? 'new-password' : 'current-password'} required minLength={4} pattern="[A-Za-z0-9]{4,}" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClass(Boolean(errors.password || errors.credentials))} placeholder="Mínimo 4 caracteres alfanuméricos" aria-invalid={Boolean(errors.password || errors.credentials)} aria-describedby={errors.password ? 'password-error' : undefined} />
              {errors.password && <p id="password-error" className="mt-1 text-xs font-medium text-rose-600">{errors.password}</p>}
              {!isRegistration && errors.credentials && <p className="mt-1 text-xs font-medium text-rose-600">{errors.credentials}</p>}
            </div>

            {isRegistration && (
              <div>
                <label htmlFor="customer-confirmation" className="mb-1.5 block text-sm font-semibold">Repetir contraseña</label>
                <input id="customer-confirmation" name="password-confirmation" type="password" autoComplete="new-password" required minLength={4} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={fieldClass(Boolean(errors.confirmation))} placeholder="Escribe nuevamente tu contraseña" aria-invalid={Boolean(errors.confirmation)} aria-describedby={errors.confirmation ? 'confirmation-error' : undefined} />
                {errors.confirmation && <p id="confirmation-error" className="mt-1 text-xs font-medium text-rose-600">{errors.confirmation}</p>}
              </div>
            )}

            <button type="submit" disabled={busy} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isRegistration ? 'REGISTRARSE' : 'INGRESAR'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
            {isRegistration ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
            <Link to={isRegistration ? '/ingresar' : '/registro'} className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">
              {isRegistration ? 'Inicia sesión' : 'Regístrate'}
            </Link>
          </p>
        </section>
      </div>

      {toast && (
        <div className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.type === 'success' ? 'bg-emerald-700' : 'bg-rose-700'}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live="polite">
          {toast.message}
        </div>
      )}
    </main>
  )
}