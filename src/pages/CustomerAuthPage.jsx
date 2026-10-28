import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, Moon, Sun, UserRound } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { validateCustomerRegistration } from '../utils/customerAuthValidation.js'
import BrandHeader from '../components/BrandHeader.jsx'
import CustomerRegistrationSuccessPage from './CustomerRegistrationSuccessPage.jsx'

export default function CustomerAuthPage({ mode = 'login' }) {
  const isRegistration = mode === 'register'
  const location = useLocation()
  const navigate = useNavigate()
  const { signIn, signUp, requestPasswordReset } = useCustomerAuth()
  const { language, setLanguage, t } = useLanguage()
  const confirmationComplete = new URLSearchParams(location.search).get('confirmation') === 'success'
  const passwordUpdated = new URLSearchParams(location.search).get('password') === 'updated'
  const requestedNext = new URLSearchParams(location.search).get('next')
  const nextPath = requestedNext?.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/'
  const authSwitchPath = `${isRegistration ? '/ingresar' : '/registro'}?next=${encodeURIComponent(nextPath)}`
  const [username, setUsername] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState(() => confirmationComplete
    ? { message: 'Correo confirmado. Ya puedes iniciar sesión.', type: 'success' }
    : passwordUpdated
      ? { message: 'Contraseña actualizada. Ya puedes iniciar sesión.', type: 'success' }
      : null)
  const [busy, setBusy] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('arprice_theme') === 'dark' ||
    (!('arprice_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('arprice_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    setPassword('')
    setConfirmation('')
    setShowPassword(false)
    setShowConfirmation(false)
  }, [isRegistration, location.pathname])

  useEffect(() => {
    if (!confirmationComplete || !location.hash) return
    window.history.replaceState(window.history.state, '', `${location.pathname}${location.search}`)
  }, [confirmationComplete, location.hash, location.pathname, location.search])

  if (confirmationComplete) return <CustomerRegistrationSuccessPage />

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
        if (result.user?.identities?.length === 0) {
          setErrors({ email: 'Este correo ya se encuentra registrado.' })
          showToast('Este correo ya se encuentra registrado.')
          return
        }
        if (result.session) {
          navigate(nextPath, { replace: true })
          return
        }
        showToast('Cuenta creada. Confirma tu correo para activar el acceso.', 'success')
      } else {
        await signIn({ identifier, password })
        navigate(nextPath, { replace: true })
      }
    } catch (error) {
      const message = String(error?.message || '')
      const normalized = message.toLowerCase()
      const emailAlreadyRegistered = normalized.includes('already registered')
        || normalized.includes('already been registered')
        || normalized.includes('already exists')
        || normalized.includes('email_exists')
        || normalized.includes('user_already_exists')
      const friendly = emailAlreadyRegistered
        ? 'Este correo ya se encuentra registrado.'
        : normalized.includes('customer_profiles_username_lower_unique') || normalized.includes('duplicate key') || normalized.includes('username')
          ? 'Este usuario ya se encuentra registrado o no es válido.'
          : isRegistration && normalized.includes('database error saving new user')
            ? 'No se pudo crear el perfil. Revisa si el usuario ya está registrado e inténtalo nuevamente.'
          : normalized.includes('invalid login credentials') || normalized.includes('invalid credentials')
            ? 'Credenciales inválidas.'
            : message || 'No se pudo completar la solicitud.'
      if (isRegistration && normalized.includes('username')) setErrors({ username: 'Este usuario ya se encuentra registrado.' })
      if (isRegistration && emailAlreadyRegistered) setErrors({ email: 'Este correo ya se encuentra registrado.' })
      if (!isRegistration) setErrors({ credentials: friendly })
      showToast(friendly)
    } finally {
      setBusy(false)
    }
  }

  const handleRecoverySubmit = async (event) => {
    event.preventDefault()
    setToast(null)
    if (!recoveryIdentifier.trim()) {
      showToast('Ingresa tu correo o nombre de usuario.')
      return
    }
    setBusy(true)
    try {
      const result = await requestPasswordReset(recoveryIdentifier)
      showToast(t(result.message), 'success')
    } catch (error) {
      showToast(error.message || 'No se pudo solicitar la recuperación.')
    } finally {
      setBusy(false)
    }
  }

  const fieldClass = (hasError = false) => `w-full rounded-lg border bg-white px-3 py-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:ring-2 dark:bg-stone-950 dark:text-white ${hasError ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-100 dark:focus:ring-rose-950' : 'border-stone-300 focus:border-sky-600 focus:ring-sky-100 dark:border-stone-700 dark:focus:ring-sky-950'}`

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
      <BrandHeader className="mb-6">
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800 sm:px-3"
            aria-label={t('Volver')}
            title={t('Volver')}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('Volver')}</span>
          </button>
          <button
            type="button"
            onClick={() => setDarkMode((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            aria-label={t(darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro')}
            title={t(darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro')}
          >
            {darkMode
              ? <Sun className="h-5 w-5 text-amber-400" aria-hidden="true" />
              : <Moon className="h-5 w-5 text-sky-600" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
            className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg border border-stone-200 bg-white px-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            aria-label={t(language === 'es' ? 'Cambiar idioma a inglés' : 'Switch language to Spanish')}
            title={t(language === 'es' ? 'Cambiar idioma a inglés' : 'Switch language to Spanish')}
          >
            {language === 'es' ? 'EN' : 'ES'}
          </button>
        </div>
      </BrandHeader>
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center gap-12">
        <section className="hidden max-w-md flex-1 lg:block">
          <h1 className="mt-4 text-4xl font-black leading-tight">{t(isRegistration ? 'Tu próxima compra empieza acá.' : 'Qué bueno verte de nuevo.')}</h1>
        </section>
        <section className="w-full max-w-md border-y border-stone-200 bg-white px-5 py-7 dark:border-stone-800 dark:bg-stone-900 sm:rounded-xl sm:border sm:px-8 sm:py-8">
          <div className="mb-7">
            <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              {isRegistration ? <UserRound className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">{t('Cuenta de cliente')}</p>
            <h2 className="mt-1 text-2xl font-black">{t(isRegistration ? 'Crear cuenta' : isRecovering ? 'Recuperar contraseña' : 'Iniciar sesión')}</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              {t(isRegistration
                ? 'Completa tus datos para registrarte en Ar-Price.'
                : isRecovering
                  ? 'Te enviaremos un enlace para elegir una contraseña nueva.'
                  : 'Usa tu correo electrónico o nombre de usuario.')}
            </p>
          </div>

          {isRecovering ? (
            <form onSubmit={handleRecoverySubmit} noValidate className="space-y-4">
              <div>
                <label htmlFor="customer-recovery-identifier" className="mb-1.5 block text-sm font-semibold">{t('Correo o nombre de usuario')}</label>
                <input
                  id="customer-recovery-identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={recoveryIdentifier}
                  onChange={(event) => setRecoveryIdentifier(event.target.value)}
                  className={fieldClass()}
                  placeholder={t('usuario@email.com o cliente2026')}
                />
              </div>
              <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('Enviar enlace de recuperación')}
              </button>
            </form>
          ) : <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {isRegistration ? (
              <>
                <div>
                  <label htmlFor="customer-username" className="mb-1.5 block text-sm font-semibold">{t('Usuario')}</label>
                  <input id="customer-username" name="username" autoComplete="username" required minLength={6} maxLength={32} pattern="[A-Za-z0-9]{6,32}" value={username} onChange={(event) => setUsername(event.target.value)} className={fieldClass(Boolean(errors.username))} placeholder={t('Mínimo 6 caracteres alfanuméricos')} aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-error' : 'username-hint'} />
                  <p id="username-hint" className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t('Mínimo 6 caracteres; solo letras y números.')}</p>
                  {errors.username && <p id="username-error" className="mt-1 text-xs font-medium text-rose-600">{t(errors.username)}</p>}
                </div>
                <div>
                  <label htmlFor="customer-email" className="mb-1.5 block text-sm font-semibold">{t('Email')}</label>
                  <input id="customer-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: undefined })) }} className={fieldClass(Boolean(errors.email))} placeholder="usuario@email.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} />
                  {errors.email && <p id="email-error" className="mt-1 text-xs font-medium text-rose-600">{t(errors.email)}</p>}
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="customer-identifier" className="mb-1.5 block text-sm font-semibold">{t('Email o usuario')}</label>
                <input id="customer-identifier" name="username" autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} className={fieldClass(Boolean(errors.credentials))} placeholder={t('usuario@email.com o cliente2026')} aria-invalid={Boolean(errors.credentials)} />
              </div>
            )}

            <div>
              <label htmlFor="customer-password" className="mb-1.5 block text-sm font-semibold">{t('Contraseña')}</label>
              <div className="relative">
                <input id="customer-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isRegistration ? 'new-password' : 'current-password'} required minLength={isRegistration ? 8 : 4} pattern={isRegistration ? '[A-Za-z0-9]{8,}' : '[A-Za-z0-9]{4,}'} value={password} onChange={(event) => setPassword(event.target.value)} className={`${fieldClass(Boolean(errors.password || errors.credentials))} pr-12`} placeholder={t(isRegistration ? 'Mínimo 8 caracteres alfanuméricos' : 'Mínimo 4 caracteres alfanuméricos')} aria-invalid={Boolean(errors.password || errors.credentials)} aria-describedby={errors.password ? 'password-error' : undefined} />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-stone-500 hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:text-stone-400 dark:hover:text-stone-200" aria-label={t(showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña')} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              {isRegistration && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t('La contraseña debe tener al menos 8 caracteres y usar solo letras y números.')}</p>}
                  {errors.password && <p id="password-error" className="mt-1 text-xs font-medium text-rose-600">{t(errors.password)}</p>}
                  {!isRegistration && errors.credentials && <p className="mt-1 text-xs font-medium text-rose-600">{t(errors.credentials)}</p>}
            </div>

            {!isRegistration && (
              <div className="text-right">
                <button type="button" onClick={() => { setIsRecovering(true); setErrors({}); setToast(null) }} className="text-sm font-semibold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                  {t('¿Olvidaste tu contraseña?')}
                </button>
              </div>
            )}

            {isRegistration && (
              <div>
                <label htmlFor="customer-confirmation" className="mb-1.5 block text-sm font-semibold">{t('Repetir contraseña')}</label>
                <div className="relative">
                  <input id="customer-confirmation" name="password-confirmation" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={`${fieldClass(Boolean(errors.confirmation))} pr-12`} placeholder={t('Escribe nuevamente tu contraseña')} aria-invalid={Boolean(errors.confirmation)} aria-describedby={errors.confirmation ? 'confirmation-error' : undefined} />
                  <button type="button" onClick={() => setShowConfirmation((visible) => !visible)} className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-stone-500 hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:text-stone-400 dark:hover:text-stone-200" aria-label={t(showConfirmation ? 'Ocultar contraseña' : 'Mostrar contraseña')} aria-pressed={showConfirmation}>
                    {showConfirmation ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
                {errors.confirmation && <p id="confirmation-error" className="mt-1 text-xs font-medium text-rose-600">{t(errors.confirmation)}</p>}
              </div>
            )}

            <button type="submit" disabled={busy} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {t(isRegistration ? 'REGISTRARSE' : 'INGRESAR')}
            </button>

          </form>}

          <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
            {isRecovering ? (
              <button type="button" onClick={() => { setIsRecovering(false); setToast(null) }} className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">
                {t('Volver a iniciar sesión')}
              </button>
            ) : (
              <>
                {t(isRegistration ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?')}{' '}
                <Link to={authSwitchPath} className="font-bold text-sky-700 underline decoration-sky-300 underline-offset-4 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">
                  {t(isRegistration ? 'Inicia sesión' : 'Regístrate')}
                </Link>
              </>
            )}
          </p>
        </section>
      </div>
      </div>

      {toast && (
        <div className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-xl ${toast.type === 'success' ? 'bg-emerald-700' : 'bg-rose-700'}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live="polite">
          {t(toast.message)}
        </div>
      )}
    </main>
  )
}