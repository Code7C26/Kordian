import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Bell, LoaderCircle, LogOut, Trash2, UserRound } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { apiUrl } from '../config/api.js'
import BusinessPortalPage from './BusinessPortalPage.jsx'
import BrandHeader from '../components/BrandHeader.jsx'

async function requestCustomerAccount(path, accessToken, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || 'No se pudo completar la solicitud.')
  return payload
}

const pageContent = {
  profile: { title: 'Mi cuenta', description: 'Datos de tu cuenta de Ar-Price.' },
  alerts: { title: 'Notificaciones', description: 'Aquí aparecerán las invitaciones y los cambios de tus listas compartidas.' },
  business: { title: 'Panel de gestión para comercio', description: 'Administra el catálogo y revisa la actividad de tu comercio.' },
}

const sharedListActivityLabels = {
  item_added: 'agregó un producto a la lista',
  item_updated: 'actualizó un producto de la lista',
  item_removed: 'quitó un producto de la lista',
  member_removed: 'quitó a un participante de la lista',
  member_joined: 'se unió a la lista',
  member_left: 'abandonó la lista',
}

export default function CustomerAccountPage({ section = 'profile' }) {
  const { t } = useLanguage()
  const { loading, user, profile, accessToken, refreshProfile, refreshNotifications, signOut } = useCustomerAuth()
  const [profileError, setProfileError] = useState('')
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState('')
  const [notificationsNotice, setNotificationsNotice] = useState('')
  const [processingNotificationId, setProcessingNotificationId] = useState('')
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

  useEffect(() => {
    if (loading || !accessToken || section !== 'alerts') return undefined
    let active = true
    setNotificationsLoading(true)
    setNotificationsError('')
    refreshNotifications()
      .then((result) => {
        if (active) setNotifications(result)
      })
      .catch((error) => {
        if (active) setNotificationsError(error.message || 'No se pudieron cargar las notificaciones.')
      })
      .finally(() => {
        if (active) setNotificationsLoading(false)
      })
    return () => {
      active = false
    }
  }, [accessToken, loading, refreshNotifications, section])

  const acceptNotification = async (notification) => {
    setProcessingNotificationId(notification.id)
    setNotificationsError('')
    setNotificationsNotice('')
    try {
      const list = await requestCustomerAccount(
        `/customer/notifications/${encodeURIComponent(notification.id)}/accept`,
        accessToken,
        { method: 'POST' },
      )
      setNotifications((current) => current.filter((item) => item.id !== notification.id))
      refreshNotifications().catch((error) => console.error('Customer notifications could not be refreshed', error))
      setNotificationsNotice(`${t('Te uniste a')} “${list.name}”.`)
    } catch (error) {
      setNotificationsError(error.message || 'No se pudo aceptar la invitación.')
    } finally {
      setProcessingNotificationId('')
    }
  }

  const declineNotification = async (notification) => {
    setProcessingNotificationId(notification.id)
    setNotificationsError('')
    setNotificationsNotice('')
    try {
      await requestCustomerAccount(
        `/customer/notifications/${encodeURIComponent(notification.id)}/decline`,
        accessToken,
        { method: 'POST' },
      )
      setNotifications((current) => current.filter((item) => item.id !== notification.id))
      refreshNotifications().catch((error) => console.error('Customer notifications could not be refreshed', error))
      setNotificationsNotice(t('Rechazaste la invitación.'))
    } catch (error) {
      setNotificationsError(error.message || 'No se pudo rechazar la invitación.')
    } finally {
      setProcessingNotificationId('')
    }
  }

  const deleteActivityNotification = async (notification) => {
    setProcessingNotificationId(notification.id)
    setNotificationsError('')
    try {
      await requestCustomerAccount(
        `/customer/notifications/${encodeURIComponent(notification.id)}`,
        accessToken,
        { method: 'DELETE' },
      )
      setNotifications((current) => current.filter((item) => item.id !== notification.id))
      refreshNotifications().catch((error) => console.error('Customer notifications could not be refreshed', error))
    } catch (error) {
      setNotificationsError(error.message || 'No se pudo eliminar la notificación.')
    } finally {
      setProcessingNotificationId('')
    }
  }

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
            <div className="mt-7 border-y border-stone-200 py-6 dark:border-stone-800">
              {!notificationsLoading && notifications.length > 0 && (
                <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-200" role="status">
                  {notifications.length === 1 ? t('Tienes un mensaje en tus notificaciones.') : t('Tienes mensajes en tus notificaciones.')}
                </p>
              )}
              {notificationsError && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200" role="alert">{t(notificationsError)}</p>}
              {notificationsNotice && (
                <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">
                  <p>{notificationsNotice}</p>
                  <Link to="/listas-compartidas" className="mt-2 inline-flex font-bold underline underline-offset-4">{t('Ver listas compartidas')}</Link>
                </div>
              )}
              {notificationsLoading ? (
                <p className="text-sm text-stone-500 dark:text-stone-400" role="status">{t('Cargando notificaciones…')}</p>
              ) : notifications.length ? (
                <ul className="space-y-3">
                  {notifications.map((notification) => (
                    <li key={notification.id} className="flex flex-col gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" aria-hidden="true" />
                        <p className="text-sm text-stone-700 dark:text-stone-300">
                          {notification.type === 'activity' ? (
                            <>
                              <strong>{notification.actorUsername}</strong>{' '}
                              {t(sharedListActivityLabels[notification.action] || 'actualizó la lista')} <strong>“{notification.listName}”</strong>
                              {notification.itemName && <>: <strong>{notification.itemName}</strong></>}.
                            </>
                          ) : (
                            <>
                              <strong>{notification.inviterUsername}</strong> {t('te invitó a la lista')} <strong>“{notification.listName}”</strong>.
                            </>
                          )}
                        </p>
                      </div>
                      {notification.type === 'activity' ? (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Link
                            to={`/listas-compartidas?list=${encodeURIComponent(notification.listId)}`}
                            className="inline-flex items-center justify-center rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                          >
                            {t('Ver lista')}
                          </Link>
                          <button
                            type="button"
                            onClick={() => deleteActivityNotification(notification)}
                            disabled={Boolean(processingNotificationId)}
                            aria-label={`${t('Eliminar notificación')} ${notification.listName}`}
                            title={t('Eliminar notificación')}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                          >
                            {processingNotificationId === notification.id ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                            {t('Eliminar')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => acceptNotification(notification)}
                            disabled={Boolean(processingNotificationId)}
                            className="inline-flex items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {processingNotificationId === notification.id ? t('Procesando…') : t('Aceptar invitación')}
                          </button>
                          <button
                            type="button"
                            onClick={() => declineNotification(notification)}
                            disabled={Boolean(processingNotificationId)}
                            className="inline-flex items-center justify-center rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                          >
                            {t('Rechazar')}
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-600 dark:text-stone-400">{t('No tienes notificaciones por el momento.')}</p>
              )}
            </div>
          )}

        </section>
      </div>
    </main>
  )
}