const REVERSIBLE_SOURCES = new Map([
  ['mami_price_repair', 'Mami'],
  ['disco_sync', 'Disco'],
  ['carrefour_sync', 'Carrefour'],
])

const JSON_NUMBER = Symbol('jsonNumber')

function parseJsonWithNumbers(source) {
  let index = 0
  const skipWhitespace = () => {
    while (/[ \t\n\r]/.test(source[index] || '')) index += 1
  }
  const parseString = () => {
    const start = index++
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2
      } else if (source[index++] === '"') {
        return JSON.parse(source.slice(start, index))
      }
    }
    throw new Error('Invalid JSON string')
  }
  const parseValue = () => {
    skipWhitespace()
    const current = source[index]
    if (current === '"') return parseString()
    if (current === '{') {
      index += 1
      const object = Object.create(null)
      skipWhitespace()
      if (source[index] === '}') {
        index += 1
        return object
      }
      while (index < source.length) {
        skipWhitespace()
        const key = parseString()
        skipWhitespace()
        if (source[index++] !== ':') throw new Error('Invalid JSON object')
        object[key] = parseValue()
        skipWhitespace()
        const delimiter = source[index++]
        if (delimiter === '}') return object
        if (delimiter !== ',') throw new Error('Invalid JSON object')
      }
      throw new Error('Invalid JSON object')
    }
    if (current === '[') {
      index += 1
      const array = []
      skipWhitespace()
      if (source[index] === ']') {
        index += 1
        return array
      }
      while (index < source.length) {
        array.push(parseValue())
        skipWhitespace()
        const delimiter = source[index++]
        if (delimiter === ']') return array
        if (delimiter !== ',') throw new Error('Invalid JSON array')
      }
      throw new Error('Invalid JSON array')
    }
    if (current === 't' && source.slice(index, index + 4) === 'true') {
      index += 4
      return true
    }
    if (current === 'f' && source.slice(index, index + 5) === 'false') {
      index += 5
      return false
    }
    if (current === 'n' && source.slice(index, index + 4) === 'null') {
      index += 4
      return null
    }
    const number = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!number) throw new Error('Invalid JSON value')
    index += number[0].length
    return { [JSON_NUMBER]: number[0] }
  }

  const value = parseValue()
  skipWhitespace()
  if (index !== source.length) throw new Error('Trailing JSON content')
  return value
}

function isJsonNumber(value) {
  return Boolean(value && typeof value === 'object' && typeof value[JSON_NUMBER] === 'string')
}

function isPositiveSafeId(value) {
  if (!isJsonNumber(value) || !/^[1-9]\d*$/.test(value[JSON_NUMBER])) return false
  const digits = value[JSON_NUMBER]
  const maximum = String(Number.MAX_SAFE_INTEGER)
  return digits.length < maximum.length
    || (digits.length === maximum.length && digits <= maximum)
}

function decimalKey(value) {
  const source = isJsonNumber(value) ? value[JSON_NUMBER] : value
  if (typeof source !== 'string') return null
  const match = source.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i)
  if (!match) return null

  let digits = `${match[2]}${match[3] || ''}`.replace(/^0+/, '')
  if (!digits) return '0'
  const parsedExponent = Number(match[4] || 0)
  if (!Number.isSafeInteger(parsedExponent)) return null
  let exponent = parsedExponent - (match[3] || '').length
  while (digits.endsWith('0')) {
    digits = digits.slice(0, -1)
    exponent += 1
  }
  return `${match[1] === '-' ? '-' : ''}${digits}e${exponent}`
}

function isPositivePrice(value) {
  const key = decimalKey(value)
  return isJsonNumber(value) && key !== null && !key.startsWith('-') && key !== '0'
}

function sqlBtrim(value) {
  return typeof value === 'string' ? value.replace(/^ +| +$/g, '') : ''
}

function hasJsonbKey(value, key) {
  return Boolean(value && typeof value === 'object'
    && (Array.isArray(value) ? value.includes(key) : Object.hasOwn(value, key)))
}

function getStaticRevertibilityReason(filters, changes) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters) || !Array.isArray(changes) || !changes.length) {
    return 'Registro incompleto'
  }

  const hasSource = Object.prototype.hasOwnProperty.call(filters, 'source')
  let source
  let historical = false
  if (hasSource) {
    source = filters.source
    if (typeof source !== 'string' || !REVERSIBLE_SOURCES.has(source)) {
      return 'Fuente no reversible o desconocida'
    }
    if (source === 'disco_sync') {
      if (Array.isArray(filters.removedOffers) && filters.removedOffers.length) {
        return 'La sincronización eliminó ofertas'
      }
      if (Array.isArray(filters.unavailable)
        && filters.unavailable.some((item) => hasJsonbKey(item, 'removedOfferId'))) {
        return 'La sincronización eliminó ofertas'
      }
    }
    if (source === 'carrefour_sync'
      && changes.some((change) => change?.identityChanged === true || change?.listPriceChanged === true)) {
      return 'El registro de Carrefour no permite restaurar todos los cambios'
    }
  } else {
    historical = true
    const filterKeys = Object.keys(filters).sort()
    if (filterKeys.join(',') !== 'brandId,categoryId,supermarket') {
      return 'Los filtros históricos no tienen el formato esperado'
    }
    const validReference = (value) => (
      value === null
      || (typeof value === 'string' && sqlBtrim(value) !== '')
      || isPositiveSafeId(value)
    )
    if (!validReference(filters.categoryId)
      || !validReference(filters.brandId)
      || !(filters.supermarket === null
        || (typeof filters.supermarket === 'string' && sqlBtrim(filters.supermarket) !== ''))) {
      return 'Los filtros históricos contienen valores inválidos'
    }
    if (filters.categoryId === null && filters.brandId === null && filters.supermarket === null) {
      return 'El registro no contiene filtros aplicables'
    }
  }

  const seenOffers = new Set()
  for (const change of changes) {
    if (!change || typeof change !== 'object' || Array.isArray(change)
      || !isPositiveSafeId(change.offerId)
      || !isPositiveSafeId(change.productId)
      || !isPositivePrice(change.previousCashPrice)
      || !isPositivePrice(change.updatedCashPrice)) {
      return 'Los cambios no contienen IDs y precios válidos'
    }
    if (seenOffers.has(change.offerId[JSON_NUMBER])) return 'El registro contiene ofertas duplicadas'
    seenOffers.add(change.offerId[JSON_NUMBER])
    if (historical && Object.keys(change).sort().join(',')
      !== 'offerId,previousCashPrice,productId,updatedCashPrice') {
      return 'Los cambios históricos no tienen el formato esperado'
    }
  }

  return null
}

function sameReference(filterValue, referenceId, referenceName) {
  if (filterValue === null) return true
  const value = isJsonNumber(filterValue) ? filterValue[JSON_NUMBER] : String(filterValue)
  return String(referenceId ?? '') === value || referenceName === value
}

function normalizeSupermarket(value) {
  return typeof value === 'string' ? sqlBtrim(value).toLowerCase() : ''
}

async function loadRowsByIds(database, table, columns, ids) {
  const rows = []
  for (let index = 0; index < ids.length; index += 200) {
    const { data, error } = await database
      .from(table)
      .select(columns)
      .in('id', ids.slice(index, index + 200))
    if (error) return { data: null, error }
    rows.push(...(data || []))
  }
  return { data: rows, error: null }
}

async function annotatePriceUpdateReversibility(database, logs) {
  const entries = (Array.isArray(logs) ? logs : []).map((log) => {
    const { filters_text: filtersText, changes_text: changesText, ...publicLog } = log
    try {
      if (typeof filtersText !== 'string' || typeof changesText !== 'string') {
        return {
          ...publicLog,
          reversibility: { eligible: false, reason: 'No se pudo verificar la estructura exacta del registro' },
        }
      }
      const filters = parseJsonWithNumbers(filtersText)
      const changes = parseJsonWithNumbers(changesText)
      return {
        ...publicLog,
        _rawFilters: filters,
        _rawChanges: changes,
        reversibility: { eligible: false, reason: getStaticRevertibilityReason(filters, changes) },
      }
    } catch {
      return {
        ...publicLog,
        reversibility: { eligible: false, reason: 'No se pudo verificar la estructura exacta del registro' },
      }
    }
  })
  const toPublicEntry = (entry) => {
    const publicEntry = { ...entry }
    delete publicEntry._rawFilters
    delete publicEntry._rawChanges
    return publicEntry
  }
  const candidates = entries.filter((entry) => !entry.reversibility.reason)
  if (!candidates.length) return entries.map(toPublicEntry)
  if (!database || typeof database.from !== 'function' || typeof database.rpc !== 'function') {
    return entries.map((entry) => entry.reversibility.reason
      ? toPublicEntry(entry)
      : toPublicEntry({ ...entry, reversibility: { eligible: false, reason: 'Falta SUPABASE_SERVICE_ROLE_KEY para verificar la reversibilidad' } }))
  }

  const offerIds = [...new Set(candidates.flatMap((entry) => entry._rawChanges.map((change) => Number(change.offerId[JSON_NUMBER]))))]
  const productIds = [...new Set(candidates.flatMap((entry) => entry._rawChanges.map((change) => Number(change.productId[JSON_NUMBER]))))]
  const [
    { data: offers, error: offersError },
    { data: products, error: productsError },
    { data: blockedSupermarkets, error: maintenanceError },
  ] = await Promise.all([
    loadRowsByIds(database, 'offers', 'id, product_id, supermarket, cash_price_text:cash_price::text', offerIds),
    loadRowsByIds(database, 'products', 'id, category_id, brand_id', productIds),
    database.rpc('catalog_maintenance_blocked_supermarkets'),
  ])
  if (offersError) throw offersError
  if (productsError) throw productsError
  if (maintenanceError) throw maintenanceError
  if (!Array.isArray(blockedSupermarkets)
    || blockedSupermarkets.some((name) => !['Mami', 'Disco', 'Carrefour'].includes(name))) {
    throw new Error('Maintenance RPC returned an invalid response')
  }

  const categoryIds = [...new Set((products || []).map((product) => product.category_id).filter((id) => id != null))]
  const brandIds = [...new Set((products || []).map((product) => product.brand_id).filter((id) => id != null))]
  const [categoriesResult, brandsResult] = await Promise.all([
    loadRowsByIds(database, 'categories', 'id, name', categoryIds),
    loadRowsByIds(database, 'brands', 'id, name', brandIds),
  ])
  if (categoriesResult.error) throw categoriesResult.error
  if (brandsResult.error) throw brandsResult.error

  const offersById = new Map((offers || []).map((offer) => [String(offer.id), offer]))
  const productsById = new Map((products || []).map((product) => [String(product.id), product]))
  const categoriesById = new Map((categoriesResult.data || []).map((category) => [String(category.id), category]))
  const brandsById = new Map((brandsResult.data || []).map((brand) => [String(brand.id), brand]))
  const blocked = new Set(blockedSupermarkets.map(normalizeSupermarket).filter(Boolean))

  return entries.map((entry) => {
    if (entry.reversibility.reason) return toPublicEntry(entry)
    const filters = entry._rawFilters
    const changes = entry._rawChanges
    const hasSource = Object.prototype.hasOwnProperty.call(filters, 'source')
    if (!hasSource && (blocked.has('mami') || blocked.has('disco'))) {
      return toPublicEntry({
        ...entry,
        reversibility: { eligible: false, reason: 'Mami o Disco está pausado por mantenimiento' },
      })
    }
    const expectedSupermarket = hasSource ? REVERSIBLE_SOURCES.get(filters.source) : null
    for (const change of changes) {
      const offerId = String(Number(change.offerId[JSON_NUMBER]))
      const productId = String(Number(change.productId[JSON_NUMBER]))
      const offer = offersById.get(offerId)
      const product = productsById.get(productId)
      if (!offer || !product || String(offer.product_id) !== productId) {
        return toPublicEntry({ ...entry, reversibility: { eligible: false, reason: 'La oferta o el producto ya no existe' } })
      }
      const supermarket = normalizeSupermarket(offer.supermarket)
      if (!supermarket) {
        return toPublicEntry({ ...entry, reversibility: { eligible: false, reason: 'La oferta no tiene un supermercado válido' } })
      }
      if (expectedSupermarket && supermarket !== normalizeSupermarket(expectedSupermarket)) {
        return toPublicEntry({ ...entry, reversibility: { eligible: false, reason: 'La oferta pertenece a otro supermercado' } })
      }
      if (blocked.has(supermarket)) {
        return toPublicEntry({ ...entry, reversibility: { eligible: false, reason: 'El supermercado está pausado por mantenimiento' } })
      }
      if (typeof offer.cash_price_text !== 'string'
        || decimalKey(offer.cash_price_text) === null
        || decimalKey(offer.cash_price_text) !== decimalKey(change.updatedCashPrice)) {
        return toPublicEntry({ ...entry, reversibility: { eligible: false, reason: 'El precio actual ya cambió' } })
      }
      if (!hasSource
        && (!sameReference(filters.categoryId, product.category_id, categoriesById.get(String(product.category_id))?.name)
          || !sameReference(filters.brandId, product.brand_id, brandsById.get(String(product.brand_id))?.name)
          || (filters.supermarket !== null
            && normalizeSupermarket(filters.supermarket) !== supermarket))) {
        return toPublicEntry({ ...entry, reversibility: { eligible: false, reason: 'La oferta ya no coincide con los filtros históricos' } })
      }
    }
    return toPublicEntry({ ...entry, reversibility: { eligible: true, reason: null } })
  })
}

module.exports = { annotatePriceUpdateReversibility }
