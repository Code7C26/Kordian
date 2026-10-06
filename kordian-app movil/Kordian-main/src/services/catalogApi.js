import { API_BASE_URL } from '../config/api.js'

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || `Request failed: ${response.status}`)
  }
  return payload
}

export function fetchCatalog() {
  return Promise.all([
    request('/categories'),
    request('/products'),
  ])
}

export function fetchProducts() {
  return request('/products')
}

export { API_BASE_URL }
