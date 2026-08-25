export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`
}

export function adminFetch(path, options = {}) {
  const token = localStorage.getItem('adminToken')
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(apiUrl(path), { ...options, headers }).then((response) => {
    if (response.status === 401) {
      localStorage.removeItem('adminAuth')
      localStorage.removeItem('adminToken')
      localStorage.removeItem('currentAdmin')
    }
    return response
  })
}