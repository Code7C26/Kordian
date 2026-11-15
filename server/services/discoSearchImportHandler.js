const { requireServiceRoleDatabase } = require('./serviceRole')
const { createPriceStatusQueueErrorPayload } = require('./priceStatusQueueCapacityError')

function createDiscoSearchImportHandler({ database, importSearchResults, logger = console }) {
  return async (req, res) => {
    const search = String(req.body?.search || '').trim()
    if (search.length < 2 || search.length > 120) {
      return res.status(400).json({ error: 'La búsqueda debe tener entre 2 y 120 caracteres.' })
    }

    try {
      requireServiceRoleDatabase(database)
      const result = await importSearchResults(search, req.admin)
      return res.json({ query: search, ...result })
    } catch (error) {
      if (error?.code === 'SERVICE_ROLE_NOT_CONFIGURED') {
        return res.status(503).json({
          code: 'SERVICE_ROLE_NOT_CONFIGURED',
          error: 'La importación requiere acceso privado configurado en el servidor.',
        })
      }
      logger.error('Disco search import failed', error)
      const capacityError = createPriceStatusQueueErrorPayload(error, { rolledBack: null })
      if (capacityError) {
        return res.status(503).json({
          ...capacityError,
          partialWriteState: 'unknown',
        })
      }
      return res.status(500).json({ error: 'No se pudieron importar los resultados de Disco.' })
    }
  }
}

module.exports = { createDiscoSearchImportHandler }
