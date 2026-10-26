const DEFAULT_FRONTEND_URL = 'https://ar-price.netlify.app'

function getFrontendUrl(configuredUrl = process.env.FRONTEND_URL) {
  const frontendUrl = String(configuredUrl || '').trim() || DEFAULT_FRONTEND_URL
  const parsedUrl = new URL(frontendUrl)
  const isLocalhost = parsedUrl.hostname === 'localhost'
    || parsedUrl.hostname === '127.0.0.1'
    || parsedUrl.hostname === '::1'

  if (process.env.NODE_ENV === 'production' && isLocalhost) {
    return DEFAULT_FRONTEND_URL
  }

  return parsedUrl.toString()
}

module.exports = { getFrontendUrl }
