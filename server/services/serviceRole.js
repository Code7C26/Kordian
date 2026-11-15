const SERVICE_ROLE_ERROR_CODE = 'SERVICE_ROLE_NOT_CONFIGURED'
const SERVICE_ROLE_ERROR_MESSAGE = 'Las operaciones privilegiadas requieren configurar el acceso privado del servidor.'

function createServiceRoleConfigurationError() {
  const error = new Error(SERVICE_ROLE_ERROR_MESSAGE)
  error.code = SERVICE_ROLE_ERROR_CODE
  error.status = 503
  return error
}

function requireServiceRoleDatabase(database) {
  if (!database || typeof database.from !== 'function') {
    throw createServiceRoleConfigurationError()
  }
  return database
}

function getAdminAuthDatabase({ serviceRoleDatabase, publicDatabase, nodeEnv = process.env.NODE_ENV }) {
  if (serviceRoleDatabase) return requireServiceRoleDatabase(serviceRoleDatabase)
  if (nodeEnv === 'development' && publicDatabase) return requireServiceRoleDatabase(publicDatabase)
  throw createServiceRoleConfigurationError()
}

function createServiceRoleMiddleware(database) {
  return (_req, res, next) => {
    try {
      requireServiceRoleDatabase(database)
      return next()
    } catch (error) {
      return res.status(error.status).json({
        code: error.code,
        error: error.message,
      })
    }
  }
}

function getServiceRoleDatabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw createServiceRoleConfigurationError()
  }
  return require('../supabaseAdmin')
}

module.exports = {
  createServiceRoleConfigurationError,
  createServiceRoleMiddleware,
  getAdminAuthDatabase,
  getServiceRoleDatabase,
  requireServiceRoleDatabase,
}
