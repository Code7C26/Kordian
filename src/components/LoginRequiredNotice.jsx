import { LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext.jsx'

export default function LoginRequiredNotice({ message, nextPath, onClose }) {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const handleSignIn = () => {
    onClose()
    navigate(`/ingresar?next=${encodeURIComponent(nextPath)}`)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-stone-200 bg-white text-center text-stone-800 shadow-2xl shadow-stone-950/25 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="login-required-notice-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-sky-50 px-7 pb-8 pt-9 dark:bg-stone-800">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-sky-100 bg-white text-sky-600 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-sky-400">
            <LogIn className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 id="login-required-notice-title" className="text-xl font-extrabold tracking-tight">
            {t('Inicia sesión para continuar')}
          </h2>
        </div>
        <div className="space-y-5 px-7 pb-7 pt-6">
          <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
            {t(message)}
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSignIn}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-900"
            >
              {t('Iniciar sesión')}
              <LogIn className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl px-4 py-2 text-sm font-semibold text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            >
              {t('Ahora no')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
