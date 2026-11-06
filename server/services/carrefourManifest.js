const { isValidGtin, normalizePostalCode } = require('./carrefourImporter')
const { validateHistoricalIdentityEvidence } = require('./carrefourHistoricalEnrichment')

const REQUIRED_MANIFEST_FIELDS = [
  'source_product_id',
  'source_sku',
  'gtin',
  'name',
  'category',
  'price',
  'availability',
  'postal_code',
  'postal_code_confirmed',
  'product_url',
  'capture_timestamp',
  'capture_method',
  'validation_status',
]

function isTrue(value) {
  return ['true', '1', 'yes', 'si', 'sí'].includes(String(value || '').trim().toLowerCase())
}

function validateCarrefourManifestRow(row = {}) {
  const errors = []
  const isCatalogEnriched = row.enrichment_status === 'validated'
  const hasHistoricalIdentity = validateHistoricalIdentityEvidence(row)
  const manifestRow = isCatalogEnriched
    ? {
      ...row,
      source_product_id: row.enriched_source_product_id,
      source_sku: row.enriched_source_sku,
      gtin: row.enriched_gtin,
      name: row.enriched_name,
      brand: row.enriched_brand,
      category: row.enriched_category,
      price: row.enriched_price,
      list_price: row.enriched_list_price,
      availability: row.enriched_availability,
      product_url: row.enriched_product_url,
      validation_status: 'valid',
      validation_errors: '',
    }
    : row

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!String(manifestRow[field] ?? '').trim()) errors.push(`Falta ${field}`)
  }

  const sourceProductId = String(manifestRow.source_product_id || '').trim()
  const sourceSku = String(manifestRow.source_sku || '').trim()
  const gtin = String(manifestRow.gtin || '').replace(/[\s-]/g, '')
  const validationErrors = String(manifestRow.validation_errors || '')
    .split(';')
    .map((error) => error.trim())
    .filter(Boolean)
  const hasOnlyMissingGtinError = validationErrors.length === 1
    && validationErrors[0] === 'No se pudo leer un GTIN'
  const name = String(manifestRow.name || '').trim()
  const category = String(manifestRow.category || '').trim()
  const price = Number(manifestRow.price)
  const netContentValue = Number(manifestRow.net_content_value)
  const unitPrice = Number(manifestRow.unit_price)
  const postalCode = normalizePostalCode(manifestRow.postal_code)
  const captureTimestamp = Date.parse(manifestRow.capture_timestamp)
  let productUrl = null
  try {
    productUrl = new URL(String(manifestRow.product_url || ''))
  } catch {
    errors.push('URL de producto inválida')
  }

  if (!/^\d{1,20}$/.test(sourceProductId)) errors.push('ID de producto Carrefour inválido')
  if (!/^[\w.-]{1,100}$/.test(sourceSku)) errors.push('SKU de origen inválido')
  if (!isValidGtin(gtin)) errors.push('GTIN/EAN inválido')
  if (!name) errors.push('Nombre vacío')
  if (!category || category.toLowerCase() === 'sin categoría') errors.push('Categoría no identificada')
  if (!Number.isFinite(price) || price <= 0) errors.push('Precio debe ser mayor que cero')
  if (String(manifestRow.availability || '').trim().toLowerCase() !== 'available') {
    errors.push('Disponibilidad no confirmada')
  }
  if (!postalCode || postalCode !== String(manifestRow.postal_code || '').trim().toUpperCase()) {
    errors.push('Código postal inválido')
  }
  if (!isTrue(manifestRow.postal_code_confirmed)) errors.push('El operador no confirmó el código postal')
  if (!productUrl || !['www.carrefour.com.ar', 'carrefour.com.ar'].includes(productUrl.hostname)
    || !productUrl.pathname.endsWith('/p')) {
    errors.push('La URL no es una página de producto Carrefour verificable')
  }
  if (!Number.isFinite(captureTimestamp)) errors.push('Fecha de captura inválida')
  if (!['rendered_dom_manual', 'rendered_dom_pagination'].includes(manifestRow.capture_method)) {
    errors.push('Método de captura no reconocido')
  }
  if (!isCatalogEnriched && !hasHistoricalIdentity
    && manifestRow.validation_status !== 'valid') {
    errors.push('La extensión marcó el producto para revisión')
  }
  if (!isCatalogEnriched && !hasHistoricalIdentity
    && String(manifestRow.validation_errors || '').trim()) {
    errors.push('La extensión registró errores de validación')
  }
  if (hasHistoricalIdentity && !hasOnlyMissingGtinError
    && validationErrors.length > 0) {
    errors.push('La extensión registró errores adicionales a la falta de GTIN')
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    product: {
      sourceProductId,
      sourceSku,
      ean: gtin,
      identitySource: manifestRow.identity_source || '',
      identityMatchMethod: manifestRow.identity_match_method || '',
      name,
      brand: String(manifestRow.brand || '').trim(),
      category,
      netContent: String(manifestRow.net_content || '').trim(),
      netContentUnit: String(manifestRow.net_content_unit || '').trim(),
      netContentValue: Number.isFinite(netContentValue) && netContentValue > 0 ? netContentValue : null,
      price: Number.isFinite(price) ? price : null,
      listPrice: Number(manifestRow.list_price) > 0 ? Number(manifestRow.list_price) : null,
      unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null,
      rawUnitPrice: String(manifestRow.raw_unit_price || '').trim(),
      isOffer: isTrue(manifestRow.is_offer),
      postalCode,
      productUrl: productUrl?.toString() || String(manifestRow.product_url || ''),
      captureUrl: String(row.capture_url || ''),
      capturedAt: Number.isFinite(captureTimestamp) ? new Date(captureTimestamp).toISOString() : '',
    },
  }
}

function findManifestDuplicates(items) {
  const sourceIds = new Map()
  const skus = new Map()
  const gtins = new Map()
  for (const item of items) {
    for (const [map, key] of [
      [sourceIds, item.product.sourceProductId],
      [skus, item.product.sourceSku],
      [gtins, item.product.ean],
    ]) {
      const entries = map.get(key) || []
      entries.push(item)
      map.set(key, entries)
    }
  }
  const issues = []
  for (const [kind, map] of [['source_product_id', sourceIds], ['source_sku', skus], ['gtin', gtins]]) {
    for (const [value, entries] of map) {
      if (entries.length > 1) {
        issues.push({
          kind,
          value,
          rowNumbers: entries.map((entry) => entry.rowNumber),
          reason: `Duplicado en el manifiesto: ${kind} ${value}`,
        })
      }
    }
  }
  return issues
}

function findLocalMatch(item, products) {
  const sourceMatches = products.filter((product) => (
    product.source === 'carrefour'
    && String(product.source_product_id || '') === item.product.sourceProductId
  ))
  const eanMatches = products.filter((product) => String(product.ean || '') === item.product.ean)
  if (sourceMatches.length > 1 || eanMatches.length > 1) {
    return { ambiguous: true, reason: 'El ID o GTIN coincide con varios productos de la base' }
  }
  const bySourceId = sourceMatches[0] || null
  const byEan = eanMatches[0] || null
  if (bySourceId && String(bySourceId.ean || '') !== item.product.ean) {
    return { ambiguous: true, reason: 'El ID Carrefour ya existe asociado a otro GTIN' }
  }
  if (bySourceId && byEan && String(bySourceId.id) !== String(byEan.id)) {
    return { ambiguous: true, reason: 'El ID Carrefour y el GTIN apuntan a productos distintos' }
  }
  return {
    product: bySourceId || byEan,
    matchedBy: bySourceId ? 'source_product_id' : byEan ? 'ean' : null,
    ambiguous: false,
  }
}

function getPriceReviewWarning(importPrice, offers = []) {
  const prices = [Number(importPrice), ...offers.map((offer) => Number(offer.cash_price))]
    .filter((price) => Number.isFinite(price) && price > 0)
  if (prices.length < 2) return null
  const ratio = Math.max(...prices) / Math.min(...prices)
  return ratio >= 3
    ? `Diferencia entre ofertas de ${ratio.toFixed(2)}x; requiere revisión manual`
    : null
}

function getPackageSizeReviewWarning(carrefourName, localName) {
  const extractSize = (name) => {
    const matches = [...String(name || '').matchAll(
      /(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilos?|grs?|gramos?|ml|cc|lts?|litros?|g|l)(?![a-z])/giu,
    )]
    if (matches.length !== 1) return null

    const [, rawAmount, rawUnit] = matches[0]
    const amount = Number(rawAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) return null

    const unit = rawUnit.toLowerCase()
    if (['kg', 'kgs', 'kilo', 'kilos'].includes(unit)) {
      return { dimension: 'mass', amount: amount * 1000, label: matches[0][0].trim() }
    }
    if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(unit)) {
      return { dimension: 'mass', amount, label: matches[0][0].trim() }
    }
    if (['l', 'lt', 'lts', 'litro', 'litros'].includes(unit)) {
      return { dimension: 'volume', amount: amount * 1000, label: matches[0][0].trim() }
    }
    return { dimension: 'volume', amount, label: matches[0][0].trim() }
  }

  const carrefourSize = extractSize(carrefourName)
  const localSize = extractSize(localName)
  if (!carrefourSize || !localSize) return null

  const sameDimension = carrefourSize.dimension === localSize.dimension
  const sameAmount = Math.abs(carrefourSize.amount - localSize.amount) <= 0.01
  if (sameDimension && sameAmount) return null

  return `Presentación posiblemente distinta: Carrefour indica ${carrefourSize.label} y el catálogo local ${localSize.label}`
}

module.exports = {
  REQUIRED_MANIFEST_FIELDS,
  findLocalMatch,
  findManifestDuplicates,
  getPackageSizeReviewWarning,
  getPriceReviewWarning,
  validateCarrefourManifestRow,
}
