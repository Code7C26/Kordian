const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const { createPriceStatusQueueCapacityErrorPayload } = require('./priceStatusQueueCapacityError')

function isForeignKeyConflict(error) {
  return error?.code === '23503'
}

function resolveCatalogClassification({
  source,
  sourceProductId,
  proposedCategory,
  proposedSubcategory,
  categories = [],
  subcategories = [],
  allowWithoutSubcategory = false,
}) {
  const context = `${source} product ${sourceProductId || '(unknown)'}`
  const category = categories.find((candidate) => candidate.name === proposedCategory)
  if (!category) {
    return { valid: false, reason: `${context}: category "${proposedCategory || ''}" is missing from the catalog` }
  }
  if (!proposedSubcategory && allowWithoutSubcategory) {
    return { valid: true, category, subcategory: null }
  }

  const sameName = subcategories.filter((candidate) => candidate.name === proposedSubcategory)
  const subcategory = sameName.find((candidate) => String(candidate.category_id) === String(category.id))
  if (subcategory) return { valid: true, category, subcategory }

  const reason = sameName.length
    ? `subcategory "${proposedSubcategory}" belongs to a different category`
    : `subcategory "${proposedSubcategory || ''}" is missing from the catalog`
  return { valid: false, reason: `${context}: ${reason}` }
}

async function validateProductClassification(database, categoryId, subcategoryId) {
  let normalizedCategoryId = categoryId || null
  const normalizedSubcategoryId = subcategoryId || null

  if (normalizedCategoryId && !UUID_PATTERN.test(String(normalizedCategoryId))) {
    return { valid: false, status: 400, error: 'Invalid category_id' }
  }
  if (normalizedSubcategoryId && !UUID_PATTERN.test(String(normalizedSubcategoryId))) {
    return { valid: false, status: 400, error: 'Invalid subcategory_id' }
  }

  let subcategory = null
  if (normalizedSubcategoryId) {
    const { data, error } = await database
      .from('subcategories')
      .select('id, category_id')
      .eq('id', normalizedSubcategoryId)
      .maybeSingle()
    if (error) return { valid: false, status: 500, error: 'Could not validate subcategory' }
    if (!data) return { valid: false, status: 400, error: 'Subcategory not found' }
    subcategory = data
    if (!normalizedCategoryId) normalizedCategoryId = subcategory.category_id
    if (String(subcategory.category_id) !== String(normalizedCategoryId)) {
      return { valid: false, status: 409, error: 'Subcategory does not belong to the selected category' }
    }
  }

  if (normalizedCategoryId && !subcategory) {
    const { data, error } = await database
      .from('categories')
      .select('id')
      .eq('id', normalizedCategoryId)
      .maybeSingle()
    if (error) return { valid: false, status: 500, error: 'Could not validate category' }
    if (!data) return { valid: false, status: 400, error: 'Category not found' }
  }

  return {
    valid: true,
    categoryId: normalizedCategoryId,
    subcategoryId: normalizedSubcategoryId,
  }
}

function createCategoryIntegrityHandlers({ database, logger = console }) {
  async function update(req, res) {
    const { name, category_id: categoryId } = req.body || {}
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid subcategory_id' })
    }
    if (typeof name !== 'string' || !name.trim() || typeof categoryId !== 'string' || !UUID_PATTERN.test(categoryId)) {
      return res.status(400).json({ error: 'Subcategory name and category are required' })
    }
    if (!database) {
      return res.status(503).json({ error: 'Subcategory administration requires SUPABASE_SERVICE_ROLE_KEY' })
    }

    try {
      const { data, error } = await database.rpc('update_catalog_subcategory', {
        p_subcategory_id: req.params.id,
        p_name: name.trim(),
        p_category_id: categoryId,
      })
      if (error) {
        logger.error('Error updating subcategory', error)
        const capacityError = createPriceStatusQueueCapacityErrorPayload(error)
        if (capacityError) return res.status(503).json(capacityError)
        if (isForeignKeyConflict(error)) {
          return res.status(409).json({
            error: 'La clasificación cambió durante la operación o tiene productos asociados. Actualizá e intentá nuevamente.',
          })
        }
        if (error.code === '23514') {
          return res.status(409).json({
            error: 'No se pudo actualizar la subcategoría por un conflicto de integridad. Revisá los datos e intentá nuevamente.',
          })
        }
        if (error.code === 'PGRST202') {
          return res.status(503).json({
            code: 'integrity_rpc_unavailable',
            error: 'La base de datos no tiene habilitada la operación segura de actualización de subcategorías.',
          })
        }
        return res.status(500).json({ error: 'Error updating subcategory' })
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        logger.error('Unexpected update_catalog_subcategory response', data)
        return res.status(500).json({ error: 'Error updating subcategory' })
      }
      if (data.status === 'updated' && data.subcategory) {
        return res.json(data.subcategory)
      }
      if (data.status === 'products_associated') {
        return res.status(409).json({
          error: 'No se puede cambiar la categoría: primero deben reasignarse los productos asociados.',
          product_count: Number(data.product_count) || 0,
        })
      }
      if (data.status === 'category_not_found') {
        return res.status(400).json({ error: 'Category not found' })
      }
      if (data.status === 'invalid_name') {
        return res.status(400).json({ error: 'Subcategory name and category are required' })
      }
      if (data.status === 'not_found') {
        return res.status(404).json({ error: 'Subcategory not found' })
      }

      logger.error('Unexpected update_catalog_subcategory status', data.status)
      return res.status(500).json({ error: 'Error updating subcategory' })
    } catch (error) {
      logger.error('Error updating subcategory', error)
      const capacityError = createPriceStatusQueueCapacityErrorPayload(error)
      if (capacityError) return res.status(503).json(capacityError)
      return res.status(500).json({ error: 'Error updating subcategory' })
    }
  }

  async function remove(req, res) {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid subcategory_id' })
    }
    if (!database) {
      return res.status(503).json({ error: 'Subcategory administration requires SUPABASE_SERVICE_ROLE_KEY' })
    }

    try {
      const { data, error } = await database.rpc('delete_catalog_subcategory', {
        p_subcategory_id: req.params.id,
      })
      if (error) {
        logger.error('Error deleting subcategory', error)
        const capacityError = createPriceStatusQueueCapacityErrorPayload(error)
        if (capacityError) return res.status(503).json(capacityError)
        if (isForeignKeyConflict(error)) {
          return res.status(409).json({
            error: 'No se puede eliminar la subcategoría porque tiene productos asociados o cambió durante la operación.',
          })
        }
        if (error.code === '23514') {
          return res.status(409).json({
            error: 'No se pudo eliminar la subcategoría por un conflicto de integridad. Revisá los datos e intentá nuevamente.',
          })
        }
        if (error.code === 'PGRST202') {
          return res.status(503).json({
            code: 'integrity_rpc_unavailable',
            error: 'La base de datos no tiene habilitada la operación segura de eliminación de subcategorías.',
          })
        }
        return res.status(500).json({ error: 'Error deleting subcategory' })
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        logger.error('Unexpected delete_catalog_subcategory response', data)
        return res.status(500).json({ error: 'Error deleting subcategory' })
      }
      if (data.status === 'deleted') {
        return res.json({ success: true })
      }
      if (data.status === 'products_associated') {
        return res.status(409).json({
          error: 'No se puede eliminar la subcategoría porque tiene productos asociados.',
          product_count: Number(data.product_count) || 0,
        })
      }
      if (data.status === 'comparable_groups_associated') {
        return res.status(409).json({
          error: 'No se puede eliminar la subcategoría porque tiene grupos comparables asociados.',
          comparable_group_count: Number(data.comparable_group_count) || 0,
        })
      }
      if (data.status === 'not_found') {
        return res.status(404).json({ error: 'Subcategory not found' })
      }

      logger.error('Unexpected delete_catalog_subcategory status', data.status)
      return res.status(500).json({ error: 'Error deleting subcategory' })
    } catch (error) {
      logger.error('Error deleting subcategory', error)
      const capacityError = createPriceStatusQueueCapacityErrorPayload(error)
      if (capacityError) return res.status(503).json(capacityError)
      return res.status(500).json({ error: 'Error deleting subcategory' })
    }
  }

  return { update, remove }
}

module.exports = {
  createCategoryIntegrityHandlers,
  isCatalogUuid: (value) => typeof value === 'string' && UUID_PATTERN.test(value),
  resolveCatalogClassification,
  validateProductClassification,
}
