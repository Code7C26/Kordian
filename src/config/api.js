const DEFAULT_API_BASES = [
  import.meta.env.VITE_API_URL,
  'https://ar-price-api.onrender.com',
  'http://localhost:3000',
  'http://localhost:3100',
  'http://localhost:3140',
  'http://localhost:3200',
  'http://localhost:3210',
  'http://localhost:3300',
  'http://localhost:3500',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3100',
  'http://127.0.0.1:3140',
  'http://127.0.0.1:3200',
  'http://127.0.0.1:3210',
  'http://127.0.0.1:3300',
  'http://127.0.0.1:3500',
  'http://127.0.0.1:4000',
]
  .filter(Boolean)
  .map((value) => value.replace(/\/$/, ''))

const API_BASE_STORAGE_KEY = 'arprice_api_base_url'
const LEGACY_RENDER_API_BASE = 'https://arprice-backend.onrender.com'
const CURRENT_RENDER_API_BASE = 'https://ar-price-api.onrender.com'

const storedApiBase = localStorage.getItem(API_BASE_STORAGE_KEY)
const normalizedStoredApiBase = storedApiBase?.replace(/\/$/, '')

if (normalizedStoredApiBase === LEGACY_RENDER_API_BASE) {
  localStorage.setItem(API_BASE_STORAGE_KEY, CURRENT_RENDER_API_BASE)
}

export const API_BASE_URL =
  (normalizedStoredApiBase === LEGACY_RENDER_API_BASE
    ? CURRENT_RENDER_API_BASE
    : storedApiBase) ||
  DEFAULT_API_BASES[0] ||
  'http://localhost:3000'

let reviewGroupingBackendPromise = null

async function findReviewGroupingBackend() {
  if (!reviewGroupingBackendPromise) {
    reviewGroupingBackendPromise = Promise.all(
      DEFAULT_API_BASES.map(async (base) => {
        try {
          const response = await fetch(`${base}/health`)

          if (
            !response.ok ||
            !(response.headers.get('content-type') || '').includes(
              'application/json'
            )
          ) {
            return null
          }

          const payload = await response.json()

          return payload.capabilities?.reviewMatchGrouping
            ? base
            : null
        } catch {
          return null
        }
      })
    ).then((results) => {
      const selectedBase = results.find(Boolean) || null

      if (selectedBase) {
        localStorage.setItem(
          API_BASE_STORAGE_KEY,
          selectedBase
        )
      }

      return selectedBase
    })
  }

  const selectedBase = await reviewGroupingBackendPromise

  if (!selectedBase) {
    reviewGroupingBackendPromise = null
  }

  return selectedBase
}

export function apiUrl(path) {
  const base =
    localStorage.getItem(API_BASE_STORAGE_KEY) ||
    API_BASE_URL ||
    DEFAULT_API_BASES[0] ||
    'http://localhost:3000'

  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`

  return `${base.replace(/\/$/, '')}${normalizedPath}`
}

async function fetchWithApiFallback(
  path,
  options = {},
  bases = DEFAULT_API_BASES,
  rememberBackend = false
) {
  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`

  const preferredBase =
    (await findReviewGroupingBackend()) ||
    localStorage.getItem(API_BASE_STORAGE_KEY)

  const orderedBases = [
    ...new Set([preferredBase, ...bases].filter(Boolean)),
  ]

  let lastError = null
  let lastResponse = null

  for (const base of orderedBases) {
    try {
      const response = await fetch(
        `${base.replace(/\/$/, '')}${normalizedPath}`,
        {
          ...options,
        }
      )

      lastResponse = response

      const contentType =
        response.headers.get('content-type') || ''

      /*
       * Una respuesta 404 o HTML normalmente significa que
       * este backend no tiene la ruta que estamos buscando.
       * En ese caso probamos el siguiente backend.
       */
      if (
        response.status !== 404 &&
        !contentType.includes('text/html')
      ) {
        if (rememberBackend) {
          localStorage.setItem(
            API_BASE_STORAGE_KEY,
            base.replace(/\/$/, '')
          )
        }

        return response
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastResponse) {
    return lastResponse
  }

  if (lastError) {
    throw lastError
  }

  throw new Error('No se pudo conectar con la API')
}

export function apiFetch(path, options = {}) {
  return fetchWithApiFallback(path, options)
}

export function adminLogin(options = {}) {
  const localApiBases = DEFAULT_API_BASES.filter((base) =>
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)
  )
  const candidateBases = import.meta.env.DEV
    ? [...new Set([import.meta.env.VITE_API_URL, ...localApiBases, CURRENT_RENDER_API_BASE].filter(Boolean))]
    : [...new Set([import.meta.env.VITE_API_URL, CURRENT_RENDER_API_BASE].filter(Boolean))]
  let lastResponse = null
  let lastError = null

  return (async () => {
    for (const base of candidateBases) {
      try {
        const response = await fetch(`${base}/login`, options)
        const contentType = response.headers.get('content-type') || ''
        lastResponse = response

        if (response.status !== 404 && !contentType.includes('text/html')) {
          return response
        }
      } catch (error) {
        lastError = error
      }
    }

    if (lastResponse) return lastResponse
    throw lastError || new Error('No se pudo conectar con ningún servidor de autenticación.')
  })()
}

export async function adminFetch(path, options = {}) {
  const token = localStorage.getItem('adminToken')

  const headers = new Headers(
    options.headers || {}
  )

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`
    )
  }

  try {
    const response = await fetchWithApiFallback(
      path,
      {
        ...options,
        headers,
      },
      DEFAULT_API_BASES,
      true
    )

    if (response.status === 401) {
      localStorage.removeItem('adminAuth')
      localStorage.removeItem('adminToken')
      localStorage.removeItem('currentAdmin')
    }

    return response
  } catch (error) {
    console.error('API request failed', error)
    throw error
  }
}

export async function readApiResponse(
  response,
  fallbackMessage = 'La API no devolvió una respuesta válida'
) {
  const contentType =
    response.headers.get('content-type') || ''

  const body = await response.text()

  let payload = null

  if (contentType.includes('application/json')) {
    try {
      payload = JSON.parse(body)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const backendUnavailable =
      body.trimStart().startsWith('<!DOCTYPE') ||
      body.trimStart().startsWith('<html')

    const message =
      payload?.error ||
      (backendUnavailable
        ? 'El backend activo no tiene esta ruta. Reiniciá el servidor desde la carpeta server.'
        : fallbackMessage)

    throw new Error(
      `${message} (HTTP ${response.status})`
    )
  }

  if (!payload) {
    throw new Error(fallbackMessage)
  }

  return payload
}
