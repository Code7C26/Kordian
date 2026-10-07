import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, LogOut, UserRound } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'

const pageContent = {
  profile: { title: 'Mi perfil', description: 'Datos de tu cuenta de Ar-Price.' },
  alerts: { title: 'Mis alertas', description: 'Aquí se mostrarán las alertas de precios asociadas a tu cuenta.' },
  business: { title: 'Panel de gestión', description: 'Herramientas para cuentas comerciales.' },
}

export default function CustomerAccountPage({ section = 'profile' }) {
  const { loading, user, profile, signOut } = useCustomerAuth()
  const content = pageContent[section] || pageContent.profile

  if (loading) return <main className="min-h-screen bg-stone-100 p-8 dark:bg-stone-950" role="status">Cargando cuenta…</main>
  if (!user) return <Navigate to="/ingresar" replace />
  if (section === 'business' && profile?.role !== 'business') {
    return <Navigate to="/perfil" replace />
  }

  const username = profile?.username || user.user_metadata?.username || 'Cliente'

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between border-b border-stone-300 pb-4 dark:border-stone-800">
          <Link to="/" className="text-lg font-black text-sky-800 dark:text-sky-300">AR-PRICE</Link>
          <button type="button" onClick={() => signOut()} className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-stone-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-900">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Cerrar sesión
          </button>
        </header>

        <section className="py-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a productos
          </Link>
          <div className="mt-7 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <h1 className="text-2xl font-black">{content.title}</h1>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{content.description}</p>
            </div>
          </div>

          {section === 'profile' && (
            <dl className="mt-7 divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
              <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4"><dt className="text-sm font-semibold text-stone-500">Usuario</dt><dd className="text-sm font-bold">{username}</dd></div>
              <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4"><dt className="text-sm font-semibold text-stone-500">Email</dt><dd className="text-sm font-bold">{profile?.email || user.email}</dd></div>
              <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4"><dt className="text-sm font-semibold text-stone-500">Tipo de cuenta</dt><dd className="text-sm font-bold">{profile?.role === 'business' ? 'Comercial' : 'Cliente'}</dd></div>
            </dl>
          )}

          {section === 'alerts' && (
            <div className="mt-7 border-y border-stone-200 py-6 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
              <p>No tienes alertas guardadas por el momento.</p>
              <Link to="/buscar" className="mt-4 inline-flex font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">Buscar productos</Link>
            </div>
          )}

          {section === 'business' && (
            <div className="mt-7 border-y border-stone-200 py-6 text-sm text-stone-600 dark:border-stone-800 dark:text-stone-400">
              <p>Tu cuenta comercial está habilitada. Contacta al equipo Ar-Price para gestionar los permisos del comercio.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}