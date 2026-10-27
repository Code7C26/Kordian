import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, LogOut, UserRound } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import BusinessPortalPage from './BusinessPortalPage.jsx'
import BrandHeader from '../components/BrandHeader.jsx'

const pageContent = {
  profile: { title: 'Mi cuenta', description: 'Datos de tu cuenta de Ar-Price.' },
  alerts: { title: 'Mis alertas', description: 'Aquí se mostrarán las alertas de precios asociadas a tu cuenta.' },
  business: { title: 'Panel de gestión para comercio', description: 'Administra el catálogo y revisa la actividad de tu comercio.' },
}

export default function CustomerAccountPage({ section = 'profile' }) {
  const { t } = useLanguage()
  const { loading, user, profile, refreshProfile, signOut } = useCustomerAuth()
  const [profileError, setProfileError] = useState('')
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false)
  const content = pageContent[section] || pageContent.profile

  useEffect(() => {
    if (loading || !user || section !== 'profile') return undefined
    let active = true
    setIsRefreshingProfile(true)
    setProfileError('')
    refreshProfile()
      .catch((error) => {
        if (active) setProfileError(error.message || 'No se pudo actualizar el tipo de cuenta.')
      })
      .finally(() => {
        if (active) setIsRefreshingProfile(false)
      })
    return () => {
      active = false
    }
  }, [loading, refreshProfile, section, user])

  if (loading) return (
    <main className="min-h-screen bg-stone-100 px-4 py-6 dark:bg-stone-950 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <BrandHeader />
        <p className="py-8 text-stone-900 dark:text-stone-100" role="status">{t('Cargando cuenta…')}</p>
      </div>
    </main>
  )
  if (!user && section !== 'profile') return <Navigate to="/ingresar" replace />
  if (section === 'business' && !['business', 'administrator'].includes(profile?.role)) {
    return <Navigate to="/mi-cuenta" replace />
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <BrandHeader />
          <section className="py-8">
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Volver a productos')}
            </Link>
            <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                <UserRound className="h-6 w-6" aria-hidden="true" />
              </span>
              <h1 className="mt-4 text-2xl font-black">{t('Mi cuenta')}</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">
                {t('Debes iniciar sesión en tu cuenta para acceder a este menú.')}
              </p>
              <Link
                to="/ingresar?next=%2Fmi-cuenta"
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-sky-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-800 sm:w-auto"
              >
                {t('Iniciar sesión')}
              </Link>
              <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
                {t('¿Todavía no tienes cuenta?')}{' '}
                <Link to="/registro?next=%2Fmi-cuenta" className="font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                  {t('Registrarse')}
                </Link>
              </p>
            </div>
          </section>
        </div>
      </main>
    )
  }

  const username = profile?.username || user.user_metadata?.username || 'Cliente'

  if (section === 'business') {
    return <BusinessPortalPage user={{ email: user.email || username }} onSignOut={signOut} isAdministrator={profile?.role === 'administrator'} />
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <BrandHeader>
          <button type="button" onClick={() => signOut()} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-900">
            <LogOut className="h-4 w-4" aria-hidden="true" /> {t('Cerrar sesión')}
          </button>
        </BrandHeader>

        <section className="py-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Volver a productos')}
          </Link>
          <div className="mt-7 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h1 className="text-2xl font-black">{t(content.title)}</h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t(content.description)}</p>
            </div>
          </div>

          {section === 'profile' && (
            <>
              {profileError && <p className="mt-5 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200" role="alert">{t(profileError)}</p>}
              <dl className="mt-7 divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4"><dt className="text-sm font-semibold text-stone-500">{t('Usuario')}</dt><dd className="text-sm font-bold">{username}</dd></div>
                <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4"><dt className="text-sm font-semibold text-stone-500">{t('Email')}</dt><dd className="text-sm font-bold">{profile?.email || user.email}</dd></div>
                <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4">
                  <dt className="text-sm font-semibold text-stone-500">{t('Tipo de cuenta')}</dt>
                  <dd className="text-sm font-bold">
                    {t(profile?.role === 'administrator' ? 'Administrador' : profile?.role === 'business' ? 'Comercio' : 'Cliente')}
                    {isRefreshingProfile && <span className="ml-2 font-normal text-stone-500">{t('Actualizando…')}</span>}
                  </dd>
                </div>
              </dl>
            </>
          )}

          {section === 'alerts' && (
            <div className="mt-7 border-y border-stone-200 py-6 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
              <p>{t('No tienes alertas guardadas por el momento.')}</p>
              <Link to="/buscar" className="mt-4 inline-flex font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">{t('Buscar productos')}</Link>
            </div>
          )}

        </section>
      </div>
    </main>
  )
}