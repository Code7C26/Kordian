import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'

export default function ProtectedRoute({
  children,
}) {
  const { loading, profile, accessToken, createAdminSession } = useCustomerAuth()
  const location = useLocation()
  const [adminSessionReady, setAdminSessionReady] = useState(false)
  const [adminSessionError, setAdminSessionError] = useState('')
  const hasAdminSession = localStorage.getItem('adminAuth') === 'true'
    && Boolean(localStorage.getItem('adminToken'))
  const isSettingsEntry = location.state?.adminEntry === 'settings'
  const isLoginEntry = location.state?.adminEntry === 'login'

  useEffect(() => {
    if (!isSettingsEntry || loading || profile?.role !== 'administrator' || !accessToken) return

    let active = true
    createAdminSession()
      .then(() => {
        if (active) setAdminSessionReady(true)
      })
      .catch((error) => {
        if (active) setAdminSessionError(error.message || 'No se pudo validar la sesión de administrador.')
      })

    return () => {
      active = false
    }
  }, [accessToken, createAdminSession, isSettingsEntry, loading, profile?.role])

  if (isSettingsEntry) {
    if (loading) {
      return <p className="p-6 text-center text-sm text-stone-600 dark:text-stone-300" role="status">Verificando acceso de administrador...</p>
    }
    if (profile?.role !== 'administrator' || !accessToken) {
      return <Navigate to="/login" replace />
    }
    if (adminSessionError) {
      return (
        <main className="mx-auto max-w-lg p-6 text-center">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300" role="alert">{adminSessionError}</p>
          <Link to="/configuracion" className="mt-4 inline-block text-sm font-bold text-sky-700 underline dark:text-sky-300">Volver a configuración</Link>
        </main>
      )
    }
    if (!adminSessionReady) {
      return <p className="p-6 text-center text-sm text-stone-600 dark:text-stone-300" role="status">Verificando acceso de administrador...</p>
    }
    return children
  }

  if (isLoginEntry && hasAdminSession) return children
  return <Navigate to="/login" replace />
}
