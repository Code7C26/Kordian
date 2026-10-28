import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LoaderCircle, Moon, Sun } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import BrandHeader from '../components/BrandHeader.jsx'

export default function Login() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, createAdminSession, requestPasswordReset, signOut } = useCustomerAuth()
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('arprice_theme') === 'dark' ||
    (!('arprice_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )

  const [username, setUsername] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [error, setError] =
    useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState(
    new URLSearchParams(location.search).get('password') === 'updated'
      ? 'Contraseña actualizada. Ya puedes iniciar sesión.'
      : ''
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('arprice_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      const result = await signIn({ identifier: username.trim(), password })
      if (result.profile?.role !== 'administrator') {
        await signOut()
        setError('Esta cuenta no tiene permisos de administrador.')
        return
      }

      await createAdminSession(result.session.access_token)
      navigate('/admin', { replace: true, state: { adminEntry: 'login' } })
    } catch (err) {
      console.error('Admin login failed', err)
      setError(err.message || 'No se pudo conectar con el servidor de autenticación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRecovery = async (e) => {
    e.preventDefault()
    setError('')
    setRecoveryMessage('')
    if (!recoveryEmail.trim()) {
      setError('Ingresa el correo asociado a la cuenta administradora.')
      return
    }
    setIsSubmitting(true)
    try {
      const result = await requestPasswordReset(recoveryEmail, 'admin')
      setRecoveryMessage(t(result.message))
    } catch (err) {
      console.error('Admin password recovery request failed', err)
      setError(err.message || 'No se pudo solicitar la recuperación.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 px-4 py-10 dark:bg-stone-950">
      <BrandHeader className="mx-auto w-full max-w-6xl" />
      <button
        type="button"
        onClick={() => setDarkMode((current) => !current)}
        className="fixed right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        aria-label={t(darkMode ? 'Activar modo claro' : 'Activar modo oscuro')}
        title={t(darkMode ? 'Activar modo claro' : 'Activar modo oscuro')}
      >
        {darkMode
          ? <Sun className="h-5 w-5 text-amber-400" aria-hidden="true" />
          : <Moon className="h-5 w-5 text-sky-600" aria-hidden="true" />}
      </button>
      <div className="flex w-full flex-1 items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-[32px] bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-700/70 shadow-[0_30px_80px_rgba(15,23,42,0.12)] p-8">
          <div className="text-center mb-8">
            <span className="inline-flex rounded-full bg-gradient-to-r from-sky-600 to-emerald-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-white shadow-lg shadow-sky-500/20">ADMIN</span>
            <h1 className="mt-6 text-3xl font-extrabold text-stone-900 dark:text-white">{t('Accede al panel')}</h1>
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">{t('Inicia sesión para administrar categorías, marcas y precios.')}</p>
          </div>

          {isRecovering ? (
            <form onSubmit={handleRecovery} className="space-y-4">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {t('Ingresa el correo asociado a tu cuenta administradora. Te enviaremos un enlace para cambiar la contraseña. Las cuentas antiguas sin correo asociado no pueden recuperarse por este medio.')}
              </p>
              <div>
                <label className="mb-2 block text-sm font-semibold text-stone-700 dark:text-stone-200">{t('Correo electrónico')}</label>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-sky-400 dark:focus:ring-sky-900/30"
                  placeholder="admin@email.com"
                />
              </div>
              {error && <p className="text-sm font-semibold text-rose-600" role="alert">{t(error)}</p>}
              {recoveryMessage && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400" role="status">{t(recoveryMessage)}</p>}
              <button type="submit" disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 disabled:opacity-50">
                {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('Enviar enlace de recuperación')}
              </button>
              <button type="button" onClick={() => { setIsRecovering(false); setError(''); setRecoveryMessage('') }} className="w-full text-sm font-semibold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                {t('Volver al inicio de sesión')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
            {recoveryMessage && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400" role="status">{t(recoveryMessage)}</p>}
            <div>
            <label className="block text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">{t('Usuario o correo electrónico')}</label>
              <input
                type="text"
                autoComplete="username"
                required
                placeholder={t('Usuario o correo electrónico')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-sky-400 dark:focus:ring-sky-900/30"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">{t('Contraseña')}</label>
              <input
                type="password"
                placeholder={t('Contraseña')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-sky-400 dark:focus:ring-sky-900/30"
              />
            </div>

            {error && (
              <p className="text-sm font-semibold text-rose-600">{t(error)}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500"
            >
              {t(isSubmitting ? 'Ingresando…' : 'Ingresar')}
            </button>
            <button type="button" onClick={() => { setIsRecovering(true); setError(''); setRecoveryMessage('') }} className="w-full text-sm font-semibold text-sky-700 underline underline-offset-4 dark:text-sky-300">
              {t('¿Olvidaste tu contraseña?')}
            </button>
          </form>
            )}

        </div>
        </div>
      </div>
    </div>
  )
}
