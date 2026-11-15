const crypto = require('node:crypto')

function createAdminAuth({ sessionSecret }) {
  function createAdminToken(username) {
    if (!sessionSecret) return null
    const payload = Buffer.from(JSON.stringify({
      username,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    })).toString('base64url')
    const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
    return `${payload}.${signature}`
  }

  function readAdminToken(token) {
    if (!sessionSecret || !token) return null
    const [payload, signature] = token.split('.')
    if (!payload || !signature) return null
    const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
    const providedBuffer = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    if (providedBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null
    try {
      const session = JSON.parse(Buffer.from(payload, 'base64url').toString())
      return session.expiresAt > Date.now() ? session : null
    } catch {
      return null
    }
  }

  function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const session = readAdminToken(token)
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    req.admin = session.username
    next()
  }

  return { createAdminToken, readAdminToken, requireAdmin }
}

module.exports = { createAdminAuth }
