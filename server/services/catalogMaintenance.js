const MAINTENANCE_ENV = 'CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS'

function normalizeSupermarket(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'mami') return 'Mami'
  if (normalized === 'disco') return 'Disco'
  return String(value || '').trim()
}

function getBlockedSupermarkets() {
  return [...new Set(
    String(process.env[MAINTENANCE_ENV] || '')
      .split(',')
      .map(normalizeSupermarket)
      .filter(Boolean),
  )]
}

function isCatalogWriteBlocked(supermarket) {
  const normalized = normalizeSupermarket(supermarket)
  return Boolean(normalized) && getBlockedSupermarkets()
    .some((blocked) => blocked.toLowerCase() === normalized.toLowerCase())
}

function getBlockedProductSupermarkets(product) {
  const candidates = [
    product?.source,
    ...(product?.offers || []).map((offer) => offer?.supermarket),
  ]
  return [...new Set(candidates.map(normalizeSupermarket).filter(isCatalogWriteBlocked))]
}

function isCatalogProductWriteBlocked(product) {
  return getBlockedProductSupermarkets(product).length > 0
}

function isManualCatalogClassification(product) {
  return ['manual', 'manual_override'].includes(
    String(product?.classification_source || product?.classificationSource || '').trim().toLowerCase(),
  )
}

function createCatalogMaintenanceError(supermarkets) {
  const blockedSupermarkets = [...new Set(
    (Array.isArray(supermarkets) ? supermarkets : [supermarkets])
      .map(normalizeSupermarket)
      .filter(isCatalogWriteBlocked),
  )]
  const error = new Error(
    `Las escrituras de ${blockedSupermarkets.join(' y ')} están pausadas temporalmente por mantenimiento de catálogo.`,
  )
  error.code = 'catalog_maintenance'
  error.status = 503
  error.blockedSupermarkets = blockedSupermarkets
  return error
}

function assertCatalogWriteAllowed(supermarket) {
  if (isCatalogWriteBlocked(supermarket)) {
    throw createCatalogMaintenanceError(supermarket)
  }
}

function sendMaintenanceResponse(res, supermarkets) {
  const error = createCatalogMaintenanceError(supermarkets)
  return res.status(error.status).json({
    code: error.code,
    error: error.message,
    blockedSupermarkets: error.blockedSupermarkets,
  })
}

function requireCatalogWritesFor(supermarkets) {
  return (req, res, next) => {
    const blocked = (Array.isArray(supermarkets) ? supermarkets : [supermarkets])
      .filter(isCatalogWriteBlocked)
    if (blocked.length) return sendMaintenanceResponse(res, blocked)
    return next()
  }
}

function requireCatalogWriteAllowedFromBody(field = 'supermarket') {
  return (req, res, next) => {
    const supermarket = req.body?.[field]
    if (isCatalogWriteBlocked(supermarket)) return sendMaintenanceResponse(res, supermarket)
    return next()
  }
}

function requireProductWriteAllowed(database) {
  return async (req, res, next) => {
    if (!getBlockedSupermarkets().length) return next()
    try {
      const { data: product, error } = await database
        .from('products')
        .select('source, offers(supermarket)')
        .eq('id', req.params.id)
        .maybeSingle()
      if (error) {
        console.error('Unable to verify catalog maintenance state for product', error)
        return res.status(503).json({
          code: 'catalog_maintenance_check_failed',
          error: 'No se pudo verificar si el producto está alcanzado por el mantenimiento.',
        })
      }
      const blocked = getBlockedProductSupermarkets(product)
      if (blocked.length) return sendMaintenanceResponse(res, blocked)
      return next()
    } catch (error) {
      console.error('Unable to verify catalog maintenance state for product', error)
      return res.status(503).json({
        code: 'catalog_maintenance_check_failed',
        error: 'No se pudo verificar si el producto está alcanzado por el mantenimiento.',
      })
    }
  }
}

function requireOfferWriteAllowed(database) {
  return async (req, res, next) => {
    if (!getBlockedSupermarkets().length) return next()
    try {
      const { data: offer, error } = await database
        .from('offers')
        .select('supermarket')
        .eq('id', req.params.id)
        .maybeSingle()
      if (error) {
        console.error('Unable to verify catalog maintenance state for offer', error)
        return res.status(503).json({
          code: 'catalog_maintenance_check_failed',
          error: 'No se pudo verificar si la oferta está alcanzada por el mantenimiento.',
        })
      }
      const blocked = [
        offer?.supermarket,
        req.method === 'PUT' ? req.body?.supermarket : null,
      ].filter(isCatalogWriteBlocked)
      if (blocked.length) return sendMaintenanceResponse(res, blocked)
      return next()
    } catch (error) {
      console.error('Unable to verify catalog maintenance state for offer', error)
      return res.status(503).json({
        code: 'catalog_maintenance_check_failed',
        error: 'No se pudo verificar si la oferta está alcanzada por el mantenimiento.',
      })
    }
  }
}

function requireBrandProductWriteAllowed(database) {
  return async (req, res, next) => {
    if (!getBlockedSupermarkets().length) return next()
    try {
      const { data: products, error } = await database
        .from('products')
        .select('source, offers(supermarket)')
        .eq('brand_id', req.params.id)
      if (error) {
        console.error('Unable to verify catalog maintenance state for brand products', error)
        return res.status(503).json({
          code: 'catalog_maintenance_check_failed',
          error: 'No se pudo verificar si la marca está asociada a productos alcanzados por el mantenimiento.',
        })
      }
      const blocked = [...new Set((products || []).flatMap(getBlockedProductSupermarkets))]
      if (blocked.length) return sendMaintenanceResponse(res, blocked)
      return next()
    } catch (error) {
      console.error('Unable to verify catalog maintenance state for brand products', error)
      return res.status(503).json({
        code: 'catalog_maintenance_check_failed',
        error: 'No se pudo verificar si la marca está asociada a productos alcanzados por el mantenimiento.',
      })
    }
  }
}

module.exports = {
  MAINTENANCE_ENV,
  assertCatalogWriteAllowed,
  createCatalogMaintenanceError,
  getBlockedProductSupermarkets,
  getBlockedSupermarkets,
  isCatalogProductWriteBlocked,
  isManualCatalogClassification,
  isCatalogWriteBlocked,
  requireCatalogWriteAllowedFromBody,
  requireCatalogWritesFor,
  requireBrandProductWriteAllowed,
  requireOfferWriteAllowed,
  requireProductWriteAllowed,
}
