import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({
  children,
}) {
  const isAuthenticated =
    localStorage.getItem(
      'adminAuth'
    ) === 'true' && Boolean(localStorage.getItem('adminToken'))

  if (!isAuthenticated) {
    return <Navigate to="/login" />
  }

  return children
}
