const fs = require('fs/promises')
const fsSync = require('fs')
const path = require('path')
const crypto = require('crypto')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
const csv = require('csv-parser')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')
const { validateCarrefourManifestRow } = require('../services/carrefourManifest')

const PAGE_SIZE = 20
const MAX_OFFSET = 2000
const DEFAULT_BATCH_SIZE = 2
const MAX_BATCH_SIZE = 2
const DEFAULT_MAX_ITEMS_PER_RUN = 25
const MAX_ITEMS_PER_RUN = 25
const DEFAULT_MAX_PAGES_PER_QUERY = Math.floor(MAX_OFFSET / PAGE_SIZE) + 1
const DEFAULT_CHECKPOINT_FILE = path.join(__dirname, '..', 'uploads', 'carrefour_import_checkpoint.json')
const DEFAULT_MANIFEST_CHECKPOINT_FILE = path.join(__dirname, '..', 'uploads', 'carrefour_manifest_import_checkpoint.json')
const DEFAULT_MANIFEST_REVIEW_FILE = path.join(__dirname, '..', 'uploads', 'carrefour_manifest_import_review.csv')
const apiPort = Number(process.env.PORT) || 3000
const apiUrl = String(process.env.CARREFOUR_IMPORT_API_URL || `http://127.0.0.1:${apiPort}`).replace(/\/$/, '')
const checkpointFile = path.resolve(process.env.CARREFOUR_IMPORT_CHECKPOINT_FILE || DEFAULT_CHECKPOINT_FILE)

function printHelp() {
  console.log('Descubre productos por términos de búsqueda y guarda un checkpoint reanudable.')
  console.log('Un manifiesto CSV puede prepararse/importarse solo para productos determinados con confianza alta o media.')
  console.log('Por defecto solo descubre. Para importar se requiere --execute --confirm-query-scope.')
  console.log('Discovery: node scripts/import_carrefour_batches.js --discover --queries-file <json> [--checkpoint <path>]')
  console.log('Import:    node scripts/import_carrefour_batches.js --execute --confirm-query-scope [--checkpoint <path>]')
  console.log('Manifiesto: node scripts/import_carrefour_batches.js --prepare-manifest --manifest <captura.csv>')
  console.log('           node scripts/import_carrefour_batches.js --execute --manifest <captura.csv> [--max-items <1-25>] [--review-output <revision.csv>]')
  console.log('Autenticación: CARREFOUR_IMPORT_USERNAME/CARREFOUR_IMPORT_PASSWORD; en localhost también ADMIN_SESSION_SECRET.')
  console.log(`Límite de ejecución: --max-items <1-${MAX_ITEMS_PER_RUN}> (por defecto ${DEFAULT_MAX_ITEMS_PER_RUN}); el checkpoint conserva los pendientes.`)
  console.log('Configuración opcional: CARREFOUR_IMPORT_API_URL, CARREFOUR_IMPORT_CHECKPOINT_FILE, CARREFOUR_IMPORT_BATCH_SIZE, CARREFOUR_IMPORT_MAX_PAGES, CARREFOUR_IMPORT_DELAY_MS.')
  console.log('La cobertura es de los términos suministrados; no demuestra que incluya todo el catálogo Carrefour.')
  console.log('El modo manifiesto revalida cada ID en Carrefour y usa datos/precios vigentes; no importa el precio histórico del CSV.')
}

function getArgumentValue(name, args = process.argv.slice(2)) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : ''
}

function getBoundedInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new TypeError(`${name} debe ser un entero entre ${minimum} y ${maximum}`)
  }
  return parsed
}

function createCheckpoint(postalCode, queries = []) {
  return {
    source: 'carrefour',
    version: 1,
    postalCode,
    phase: 'discovering',
    scope: 'explicit_search_terms_only',
    queries: [...new Set(queries.map((query) => String(query || '').trim()).filter((query) => query.length >= 2))],
    queryProgress: {},
    items: {},
    discarded: [],
    coverageIssues: [],
    createdAt: new Date().toISOString(),
  }
}

function readManifestCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = []
    fsSync.createReadStream(filePath)
      .pipe(csv({
        mapHeaders: ({ header }) => header
          .replace(/^\uFEFF/, '')
          .replace(/^"(.*)"$/, '$1')
          .trim(),
      }))
      .on('data', (row) => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows))
  })
}

function createManifestCheckpoint(rows, {
  postalCode,
  manifestHash,
  manifestPath,
}) {
  const checkpoint = createCheckpoint(postalCode)
  checkpoint.scope = 'explicit_manifest_only'
  checkpoint.phase = 'ready'
  checkpoint.manifest = {
    path: manifestPath,
    sha256: manifestHash,
    rowCount: rows.length,
  }
  checkpoint.coverage = {
    scope: 'explicit_manifest_only',
    completeForQueries: false,
    completeForManifest: true,
    completeForEntireCarrefourCatalog: false,
    checkedAt: new Date().toISOString(),
  }

  const sourceIdCounts = new Map()
  for (const row of rows) {
    const sourceProductId = String(row.source_product_id || '').trim()
    if (sourceProductId) sourceIdCounts.set(sourceProductId, (sourceIdCounts.get(sourceProductId) || 0) + 1)
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const validation = validateCarrefourManifestRow(row)
    const mapping = suggestCatalogMapping({
      name: row.name,
      brand: row.brand,
      source_category: row.category_path || row.category,
    })
    const sourceProductId = String(row.source_product_id || '').trim()
    const duplicateSourceId = sourceProductId && sourceIdCounts.get(sourceProductId) > 1
    const taxonomyReady = mapping.status === 'determined'
      && ['high', 'medium'].includes(mapping.confidence)
    const product = {
      ...validation.product,
      sourceCategory: row.category_path || row.category || '',
      name: String(row.name || '').trim(),
      brand: String(row.brand || '').trim(),
    }
    const reasons = [
      ...validation.errors,
      ...(duplicateSourceId ? ['ID de Carrefour duplicado en el manifiesto'] : []),
      ...(!taxonomyReady
        ? [`Clasificación para revisión: ${mapping.status}/${mapping.confidence} (${mapping.reason})`]
        : []),
      ...(validation.product.postalCode && validation.product.postalCode !== postalCode
        ? [`El manifiesto usa CP ${validation.product.postalCode}, distinto del CP de importación ${postalCode}`]
        : []),
    ]
    const eligible = validation.valid
      && taxonomyReady
      && !duplicateSourceId
      && validation.product.postalCode === postalCode
    const itemKey = sourceProductId && duplicateSourceId
      ? `${sourceProductId}#row-${rowNumber}`
      : sourceProductId || `invalid-row-${rowNumber}`

    checkpoint.items[itemKey] = {
      sourceProductId,
      rowNumber,
      product,
      status: eligible ? 'pending' : 'manual_review',
      reviewReason: reasons.join('; '),
      taxonomySuggestionStatus: mapping.status,
      taxonomySuggestionConfidence: mapping.confidence,
      proposedCategory: mapping.category,
      proposedSubcategory: mapping.subcategory,
      taxonomySuggestionReason: mapping.reason,
      taxonomySuggestionRule: mapping.rule,
      updatedAt: new Date().toISOString(),
    }
  })

  flagDuplicateGtins(checkpoint)
  return checkpoint
}

async function readManifestCheckpoint(file, postalCode, manifestPath) {
  const resolvedManifestPath = path.resolve(manifestPath)
  const manifestContents = await fs.readFile(resolvedManifestPath)
  const manifestHash = crypto.createHash('sha256').update(manifestContents).digest('hex')

  let checkpoint
  try {
    checkpoint = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (checkpoint) {
    if (checkpoint.source !== 'carrefour'
      || checkpoint.version !== 1
      || checkpoint.scope !== 'explicit_manifest_only') {
      throw new Error('El checkpoint no corresponde a una importación Carrefour por manifiesto compatible')
    }
    if (checkpoint.postalCode !== postalCode) {
      throw new Error(`El checkpoint usa el CP ${checkpoint.postalCode}; no se puede continuar con ${postalCode}`)
    }
    if (checkpoint.manifest?.sha256 !== manifestHash) {
      throw new Error('El manifiesto cambió desde que se creó el checkpoint; no se continuará la importación')
    }
    return checkpoint
  }

  const rows = await readManifestCsv(resolvedManifestPath)
  if (!rows.length) throw new Error('El manifiesto CSV no contiene productos')
  checkpoint = createManifestCheckpoint(rows, {
    postalCode,
    manifestHash,
    manifestPath: resolvedManifestPath,
  })
  await writeCheckpoint(file, checkpoint)
  return checkpoint
}

function summarizeCheckpoint(checkpoint, file = checkpointFile) {
  const counts = Object.values(checkpoint.items).reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1
    return summary
  }, {})
  const taxonomyConfidence = Object.values(checkpoint.items).reduce((summary, item) => {
    const confidence = item.taxonomySuggestionConfidence || 'unknown'
    summary[confidence] = (summary[confidence] || 0) + 1
    return summary
  }, {})
  return {
    checkpointFile: file,
    scope: checkpoint.scope,
    manifest: checkpoint.manifest,
    totalManifestRows: checkpoint.manifest?.rowCount || 0,
    statusCounts: counts,
    taxonomyConfidence,
    importableCount: getImportableItems(checkpoint).length,
    reviewCount: Object.values(checkpoint.items).filter((item) => item.status === 'manual_review').length,
    duplicateGtins: Object.values(checkpoint.items)
      .filter((item) => item.status === 'manual_review' && /GTIN .* varios IDs/.test(item.reviewReason || '')).length,
  }
}

function csvCell(value) {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function serializeManualReviewCsv(checkpoint) {
  const headers = [
    'source_product_id',
    'row_number',
    'name',
    'taxonomy_status',
    'confidence',
    'suggested_category',
    'suggested_subcategory',
    'reason',
  ]
  const rows = Object.values(checkpoint.items)
    .filter((item) => item.status === 'manual_review')
    .sort((left, right) => Number(left.rowNumber || 0) - Number(right.rowNumber || 0))
    .map((item) => [
      item.sourceProductId,
      item.rowNumber,
      item.product?.name,
      item.taxonomySuggestionStatus,
      item.taxonomySuggestionConfidence,
      item.proposedCategory,
      item.proposedSubcategory,
      item.reviewReason,
    ])
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

async function writeManualReviewCsv(checkpoint, file) {
  const resolvedPath = path.resolve(file)
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true })
  await fs.writeFile(resolvedPath, serializeManualReviewCsv(checkpoint), 'utf8')
  return resolvedPath
}

async function readCheckpoint(file, postalCode, queries = []) {
  let checkpoint
  try {
    checkpoint = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return createCheckpoint(postalCode, queries)
  }
  if (checkpoint.source !== 'carrefour' || checkpoint.version !== 1) {
    throw new Error('El checkpoint no corresponde a una importación Carrefour compatible')
  }
  if (checkpoint.postalCode !== postalCode) {
    throw new Error(`El checkpoint usa el CP ${checkpoint.postalCode}; no se puede continuar con ${postalCode}`)
  }
  checkpoint.queries ||= []
  checkpoint.queryProgress ||= {}
  checkpoint.items ||= {}
  checkpoint.discarded ||= []
  checkpoint.coverageIssues ||= []
  for (const query of queries) {
    const normalized = String(query || '').trim()
    if (normalized.length >= 2 && !checkpoint.queries.includes(normalized)) checkpoint.queries.push(normalized)
  }
  return checkpoint
}

async function writeCheckpoint(file, checkpoint) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporaryFile = `${file}.tmp`
  await fs.writeFile(temporaryFile, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
  await fs.rename(temporaryFile, file)
}

async function requestJson(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)
  try {
    const response = await fetch(url, { ...options, signal: options.signal || controller.signal })
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(`La API devolvió un tipo de respuesta inesperado (${response.status})`)
    }
    let body
    try {
      body = await response.json()
    } catch (error) {
      throw new Error(`La API devolvió JSON inválido (${response.status}): ${error.message}`, { cause: error })
    }
    if (!response.ok) {
      const error = new Error(`${response.status}: ${body.error || 'Solicitud fallida'}${body.detail ? ` (${body.detail})` : ''}`)
      error.status = response.status
      error.response = body
      throw error
    }
    return body
  } finally {
    clearTimeout(timeout)
  }
}

async function login() {
  const username = process.env.CARREFOUR_IMPORT_USERNAME
  const password = process.env.CARREFOUR_IMPORT_PASSWORD
  if (!username || !password) throw new Error('Faltan CARREFOUR_IMPORT_USERNAME y CARREFOUR_IMPORT_PASSWORD')
  const result = await requestJson(`${apiUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!result.token) throw new Error('El login no devolvió un token administrativo')
  return { Authorization: `Bearer ${result.token}` }
}

function createLocalAdminHeaders() {
  const isLocalApi = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(apiUrl)
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!isLocalApi || !secret) {
    throw new Error('Configura CARREFOUR_IMPORT_USERNAME/PASSWORD; ADMIN_SESSION_SECRET solo se permite para localhost')
  }
  const username = 'local-carrefour-import'
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: Date.now() + 60 * 60 * 1000,
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return { Authorization: `Bearer ${payload}.${signature}` }
}

async function getAdminHeaders() {
  if (process.env.CARREFOUR_IMPORT_USERNAME && process.env.CARREFOUR_IMPORT_PASSWORD) return login()
  return createLocalAdminHeaders()
}

function getQueryProgress(checkpoint, query) {
  return checkpoint.queryProgress[query] || {
    status: 'pending',
    nextOffset: 0,
    pages: 0,
  }
}

function getInitialItemStatus(product) {
  return product.importBlockedReason || (product.priceReviewWarnings || []).length
    ? 'manual_review'
    : 'pending'
}

function recordPreviewPage(checkpoint, query, from, page) {
  for (const product of page.products || []) {
    const sourceProductId = String(product.sourceProductId || '').trim()
    if (!sourceProductId) continue
    const previous = checkpoint.items[sourceProductId]
    if (previous && (
      String(previous.product?.ean || '') !== String(product.ean || '')
      || Number(previous.product?.price) !== Number(product.price)
    )) {
      checkpoint.items[sourceProductId] = {
        ...previous,
        status: ['imported', 'updated', 'unchanged', 'reconciled'].includes(previous.status)
          ? previous.status
          : 'manual_review',
        reviewReason: 'El mismo ID de Carrefour apareció con distinto GTIN o precio durante la exploración',
        queries: [...new Set([...(previous.queries || []), query])],
      }
      continue
    }
    checkpoint.items[sourceProductId] = {
      ...(previous || {}),
      sourceProductId,
      product,
      status: previous?.status || getInitialItemStatus(product),
      reviewReason: previous?.reviewReason || (
        product.importBlockedReason
        || (product.priceReviewWarnings || []).join('; ')
        || ''
      ),
      queries: [...new Set([...(previous?.queries || []), query])],
      updatedAt: new Date().toISOString(),
    }
  }

  for (const discarded of page.discarded || []) {
    const key = `${query}:${from}:${discarded.sourceProductId || discarded.name || 'unknown'}:${discarded.reason}`
    if (!checkpoint.discarded.some((entry) => entry.key === key)) {
      checkpoint.discarded.push({ ...discarded, key, query, offset: from })
    }
  }
  const progress = getQueryProgress(checkpoint, query)
  const nextOffset = from + Number(page.resultLimit || PAGE_SIZE)
  checkpoint.queryProgress[query] = {
    ...progress,
    pages: progress.pages + 1,
    nextOffset,
    status: page.hasMore ? 'pending' : 'complete',
    lastPageProductCount: (page.products || []).length,
    lastPageDiscardedCount: (page.discarded || []).length,
    completedAt: page.hasMore ? null : new Date().toISOString(),
  }
}

function flagDuplicateGtins(checkpoint) {
  const items = Object.values(checkpoint.items)
  const byEan = new Map()
  for (const item of items) {
    const ean = String(item.product?.ean || '')
    if (!ean) continue
    const ids = byEan.get(ean) || []
    ids.push(item)
    byEan.set(ean, ids)
  }
  for (const [ean, matches] of byEan) {
    if (matches.length < 2) continue
    for (const item of matches) {
      item.status = ['imported', 'updated', 'unchanged', 'reconciled'].includes(item.status)
        ? item.status
        : 'manual_review'
      item.reviewReason = `GTIN ${ean} aparece en varios IDs de Carrefour: ${matches.map((match) => match.sourceProductId).join(', ')}`
    }
  }
}

function getImportableItems(checkpoint) {
  return Object.values(checkpoint.items)
    .filter((item) => ['pending', 'retryable'].includes(item.status))
    .filter((item) => !item.product?.importBlockedReason && !(item.product?.priceReviewWarnings || []).length)
    .sort((left, right) => left.sourceProductId.localeCompare(right.sourceProductId, 'en', { numeric: true }))
}

function getImportableItemsForRun(checkpoint, maxItemsPerRun = DEFAULT_MAX_ITEMS_PER_RUN) {
  const limit = getBoundedInteger(
    maxItemsPerRun,
    DEFAULT_MAX_ITEMS_PER_RUN,
    1,
    MAX_ITEMS_PER_RUN,
    'max-items',
  )
  return getImportableItems(checkpoint).slice(0, limit)
}

function createBatchId(postalCode, items) {
  const identity = items
    .map((item) => `${item.sourceProductId}:${item.product.ean}:${Number(item.product.price)}`)
    .sort()
    .join('|')
  return `cf-${crypto.createHash('sha256').update(`${postalCode}|${identity}`).digest('hex').slice(0, 24)}`
}

function setBatchResult(checkpoint, result, { skippedStatus = 'skipped' } = {}) {
  for (const [key, status] of [
    ['imported', 'imported'],
    ['updated', 'updated'],
    ['unchanged', 'unchanged'],
    ['skipped', skippedStatus],
  ]) {
    for (const entry of result[key] || []) {
      const sourceProductId = String(entry.sourceProductId || '').trim()
      if (!sourceProductId || !checkpoint.items[sourceProductId]) continue
      checkpoint.items[sourceProductId].status = status
      checkpoint.items[sourceProductId].productId = entry.productId || null
      checkpoint.items[sourceProductId].updatedAt = new Date().toISOString()
    }
  }
}

function recordBatchFailure(checkpoint, batch, error) {
  const missingSourceProductId = String(error.response?.missingSourceProductId || '')
  const knownNotWritten = error.response?.noWrites === true || error.response?.rolledBack === true
  for (const item of batch) {
    const sourceProductId = String(item.sourceProductId)
    if (missingSourceProductId && sourceProductId === missingSourceProductId) {
      item.status = 'manual_review'
      item.reviewReason = error.response?.error || error.message
    } else if (error.response?.priceWarnings || (error.status && error.status < 500)) {
      item.status = 'manual_review'
      item.reviewReason = error.response?.error || error.message
    } else if (knownNotWritten) {
      item.status = 'retryable'
    } else {
      item.status = 'outcome_unknown'
    }
    item.error = error.message
    item.updatedAt = new Date().toISOString()
  }
  return Boolean(
    (missingSourceProductId && knownNotWritten)
    || (error.status === 409 && knownNotWritten),
  )
}

async function requestPreviewPage(query, postalCode, from, headers) {
  const params = new URLSearchParams({
    query,
    postalCode,
    from: String(from),
    limit: String(PAGE_SIZE),
  })
  return requestJson(`${apiUrl}/admin/import/carrefour/preview?${params}`, { headers })
}

async function discover(checkpoint, file, headers, { maxPages, delayMs }) {
  checkpoint.phase = 'discovering'
  for (const query of checkpoint.queries) {
    let progress = getQueryProgress(checkpoint, query)
    if (progress.status === 'incomplete' && progress.pages < maxPages) {
      checkpoint.coverageIssues = checkpoint.coverageIssues.filter((issue) => !issue.startsWith(`La búsqueda "${query}" alcanzó`))
      progress = { ...progress, status: 'pending' }
      checkpoint.queryProgress[query] = progress
    }
    while (progress.status !== 'complete') {
      if (progress.pages >= maxPages) {
        const issue = `La búsqueda "${query}" alcanzó el límite de ${maxPages} páginas; cobertura incompleta`
        if (!checkpoint.coverageIssues.includes(issue)) checkpoint.coverageIssues.push(issue)
        progress.status = 'incomplete'
        checkpoint.queryProgress[query] = progress
        break
      }
      const from = progress.nextOffset
      if (from > MAX_OFFSET) {
        const issue = `La búsqueda "${query}" alcanzó el desplazamiento máximo ${MAX_OFFSET}; cobertura incompleta`
        if (!checkpoint.coverageIssues.includes(issue)) checkpoint.coverageIssues.push(issue)
        progress.status = 'incomplete'
        checkpoint.queryProgress[query] = progress
        break
      }
      const page = await requestPreviewPage(query, checkpoint.postalCode, from, headers)
      recordPreviewPage(checkpoint, query, from, page)
      flagDuplicateGtins(checkpoint)
      progress = getQueryProgress(checkpoint, query)
      await writeCheckpoint(file, checkpoint)
      console.log(JSON.stringify({
        query,
        page: progress.pages,
        offset: from,
        products: (page.products || []).length,
        discarded: (page.discarded || []).length,
        hasMore: Boolean(page.hasMore),
      }))
      if (page.hasMore) await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  const incompleteQueries = Object.entries(checkpoint.queryProgress)
    .filter(([, progress]) => progress.status !== 'complete')
    .map(([query]) => query)
  checkpoint.phase = incompleteQueries.length || checkpoint.coverageIssues.length ? 'incomplete' : 'ready'
  checkpoint.coverage = {
    scope: 'explicit_search_terms_only',
    completeForQueries: checkpoint.phase === 'ready',
    completeForEntireCarrefourCatalog: false,
    checkedAt: new Date().toISOString(),
  }
  await writeCheckpoint(file, checkpoint)
}

async function reconcileUnknownItems(checkpoint, file, headers, batchSize) {
  const unknownItems = Object.values(checkpoint.items)
    .filter((item) => ['importing', 'outcome_unknown'].includes(item.status))
  for (let start = 0; start < unknownItems.length; start += batchSize) {
    const batch = unknownItems.slice(start, start + batchSize)
    const result = await requestJson(`${apiUrl}/admin/import/carrefour/status`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        products: batch.map((item) => ({
          sourceProductId: item.sourceProductId,
          ean: item.product.ean,
          expectedPrice: item.product.price,
        })),
      }),
    })
    for (const entry of result.products || []) {
      const item = checkpoint.items[String(entry.sourceProductId)]
      if (!item) continue
      if (entry.status === 'complete') {
        item.status = 'reconciled'
        item.productId = entry.productId
      } else if (['not_found', 'product_without_offer'].includes(entry.status)) {
        item.status = 'pending'
      } else {
        item.status = 'needs_review'
        item.reviewReason = `No se puede reintentar sin revisión: ${entry.status}`
      }
      item.updatedAt = new Date().toISOString()
    }
    await writeCheckpoint(file, checkpoint)
  }
  const needsReview = Object.values(checkpoint.items).filter((item) => item.status === 'needs_review')
  if (needsReview.length) {
    throw new Error(`${needsReview.length} producto(s) requieren reconciliación manual; no se enviarán nuevos lotes`)
  }
}

async function executeImport(checkpoint, file, headers, {
  batchSize,
  delayMs,
  maxItemsPerRun = DEFAULT_MAX_ITEMS_PER_RUN,
}) {
  const isManifest = checkpoint.scope === 'explicit_manifest_only'
  const coverageComplete = isManifest
    ? checkpoint.coverage?.completeForManifest === true
    : checkpoint.coverage?.completeForQueries === true
  if (!['ready', 'importing', 'partial'].includes(checkpoint.phase) || !coverageComplete) {
    throw new Error('El checkpoint no tiene cobertura completa para todos los términos de búsqueda; no se importará')
  }
  if (!isManifest && checkpoint.coverage?.completeForEntireCarrefourCatalog !== false) {
    throw new Error('El alcance del checkpoint no está identificado como búsqueda por términos explícitos')
  }
  await reconcileUnknownItems(checkpoint, file, headers, batchSize)
  const allPending = getImportableItems(checkpoint)
  const pending = getImportableItemsForRun(checkpoint, maxItemsPerRun)
  checkpoint.phase = 'importing'
  checkpoint.executionStartedAt ||= new Date().toISOString()
  checkpoint.batchSize = batchSize
  await writeCheckpoint(file, checkpoint)

  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize)
    const batchId = createBatchId(checkpoint.postalCode, batch)
    for (const item of batch) {
      item.status = 'importing'
      item.batchId = batchId
      item.updatedAt = new Date().toISOString()
    }
    await writeCheckpoint(file, checkpoint)
    try {
      const result = await requestJson(`${apiUrl}/admin/import/carrefour/execute`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          postalCode: checkpoint.postalCode,
          productIds: batch.map((item) => item.sourceProductId),
          batchId,
          bulkRun: true,
        }),
      })
      setBatchResult(checkpoint, result, {
        skippedStatus: isManifest ? 'manual_review' : 'skipped',
      })
      if (isManifest) {
        for (const entry of result.skipped || []) {
          const item = checkpoint.items[String(entry.sourceProductId)]
          if (item) item.reviewReason = entry.reason || 'El servidor omitió el producto; requiere revisión manual'
        }
      }
      await writeCheckpoint(file, checkpoint)
    } catch (error) {
      const recoverableBatchFailure = recordBatchFailure(checkpoint, batch, error)
      await writeCheckpoint(file, checkpoint)
      if (recoverableBatchFailure) {
        console.log(JSON.stringify({
          batchId,
          status: 'partial',
          missingSourceProductId: error.response.missingSourceProductId || null,
          reason: error.response.error,
          noWrites: true,
        }))
        continue
      }
      throw new Error(
        `El lote ${batchId} no pudo confirmarse. Estado guardado para reconciliación: ${error.message}`,
        { cause: error },
      )
    }
    console.log(JSON.stringify({
      batchId,
      processed: Math.min(start + batch.length, pending.length),
      totalPending: pending.length,
      imported: batch.filter((item) => item.status === 'imported').length,
      updated: batch.filter((item) => item.status === 'updated').length,
      unchanged: batch.filter((item) => item.status === 'unchanged').length,
      skipped: batch.filter((item) => item.status === 'skipped').length,
    }))
    if (start + batchSize < pending.length) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  const counts = Object.values(checkpoint.items).reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1
    return summary
  }, {})
  checkpoint.counts = counts
  checkpoint.phase = Object.values(checkpoint.items).some((item) => (
    ['pending', 'retryable', 'importing', 'outcome_unknown'].includes(item.status)
  ))
    ? 'partial'
    : 'completed'
  checkpoint.completedAt = new Date().toISOString()
  await writeCheckpoint(file, checkpoint)
  const remainingImportable = getImportableItems(checkpoint).length
  console.log(JSON.stringify({
    checkpointFile: file,
    scope: checkpoint.coverage.scope,
    completeForEntireCarrefourCatalog: checkpoint.coverage.completeForEntireCarrefourCatalog,
    totalDiscovered: Object.keys(checkpoint.items).length,
    selectedForRun: pending.length,
    remainingImportable,
    counts,
  }, null, 2))
  if (allPending.length > pending.length) {
    console.log(`Quedan ${remainingImportable} productos importables en el checkpoint; ejecuta nuevamente para continuar.`)
  }
}

async function loadQueries(file) {
  if (!file) throw new Error('Discovery requiere --queries-file con un arreglo JSON de términos de búsqueda')
  const parsed = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'))
  if (!Array.isArray(parsed)) throw new TypeError('El archivo de términos debe contener un arreglo JSON')
  const queries = [...new Set(parsed.map((query) => String(query || '').trim()).filter((query) => query.length >= 2))]
  if (!queries.length) throw new Error('El archivo de términos no contiene búsquedas válidas de al menos dos caracteres')
  return queries
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) return printHelp()
  const isDiscover = args.includes('--discover')
  const isExecute = args.includes('--execute')
  const isPrepareManifest = args.includes('--prepare-manifest')
  const manifestPath = getArgumentValue('--manifest', args)
  const reviewOutputArgument = getArgumentValue('--review-output', args)
  if (Number(isDiscover) + Number(isExecute) + Number(isPrepareManifest) !== 1) {
    throw new Error('Elegí exactamente una operación: --discover o --execute')
  }
  if ((isPrepareManifest || args.includes('--manifest'))
    && (!manifestPath || manifestPath.startsWith('--'))) {
    throw new Error('El modo manifiesto requiere --manifest <captura.csv>')
  }
  if (args.includes('--review-output')
    && (!reviewOutputArgument || reviewOutputArgument.startsWith('--'))) {
    throw new Error('--review-output requiere una ruta CSV')
  }
  if (isDiscover && manifestPath) {
    throw new Error('--discover no se puede combinar con --manifest')
  }
  if (isExecute && !args.includes('--confirm-query-scope')) {
    if (!manifestPath) {
      throw new Error('Importación bloqueada: confirma explícitamente que aceptas el alcance limitado a los términos del checkpoint con --confirm-query-scope')
    }
  }
  const postalCode = String(process.env.CARREFOUR_IMPORT_POSTAL_CODE || '5186').trim().toUpperCase()
  if (!/^[A-Z0-9]{4,8}$/.test(postalCode)) throw new TypeError('CARREFOUR_IMPORT_POSTAL_CODE debe ser un CP argentino válido')
  const defaultFile = manifestPath ? DEFAULT_MANIFEST_CHECKPOINT_FILE : checkpointFile
  const file = path.resolve(getArgumentValue('--checkpoint', args) || defaultFile)
  const reviewOutputPath = manifestPath
    ? path.resolve(reviewOutputArgument || DEFAULT_MANIFEST_REVIEW_FILE)
    : ''
  const maxPages = getBoundedInteger(
    process.env.CARREFOUR_IMPORT_MAX_PAGES,
    DEFAULT_MAX_PAGES_PER_QUERY,
    1,
    DEFAULT_MAX_PAGES_PER_QUERY,
    'CARREFOUR_IMPORT_MAX_PAGES',
  )
  const batchSize = getBoundedInteger(
    process.env.CARREFOUR_IMPORT_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
    'CARREFOUR_IMPORT_BATCH_SIZE',
  )
  const maxItemsPerRun = getBoundedInteger(
    getArgumentValue('--max-items', args),
    DEFAULT_MAX_ITEMS_PER_RUN,
    1,
    MAX_ITEMS_PER_RUN,
    '--max-items',
  )
  const delayMs = getBoundedInteger(process.env.CARREFOUR_IMPORT_DELAY_MS, 1500, 500, 60000, 'CARREFOUR_IMPORT_DELAY_MS')
  const queries = isDiscover ? await loadQueries(getArgumentValue('--queries-file', args)) : []
  const checkpoint = manifestPath
    ? await readManifestCheckpoint(file, postalCode, manifestPath)
    : await readCheckpoint(file, postalCode, queries)

  if (isPrepareManifest) {
    const reviewReport = await writeManualReviewCsv(checkpoint, reviewOutputPath)
    console.log(JSON.stringify({
      ...summarizeCheckpoint(checkpoint, file),
      reviewReport,
    }, null, 2))
    return
  }

  if (checkpoint.phase === 'completed') {
    const reviewReport = manifestPath ? await writeManualReviewCsv(checkpoint, reviewOutputPath) : null
    console.log(JSON.stringify({
      ...summarizeCheckpoint(checkpoint, file),
      ...(reviewReport ? { reviewReport } : {}),
    }, null, 2))
    return
  }
  const headers = await getAdminHeaders()

  if (isDiscover) {
    await discover(checkpoint, file, headers, { maxPages, delayMs })
    console.log(JSON.stringify({
      checkpointFile: file,
      phase: checkpoint.phase,
      scope: checkpoint.coverage.scope,
      completeForEntireCarrefourCatalog: checkpoint.coverage.completeForEntireCarrefourCatalog,
      queryCount: checkpoint.queries.length,
      productCount: Object.keys(checkpoint.items).length,
      importableCount: getImportableItems(checkpoint).length,
      manualReviewCount: Object.values(checkpoint.items).filter((item) => item.status === 'manual_review').length,
      discardedCount: checkpoint.discarded.length,
      coverageIssues: checkpoint.coverageIssues,
    }, null, 2))
    return
  }

  await executeImport(checkpoint, file, headers, { batchSize, delayMs, maxItemsPerRun })
  if (manifestPath) {
    const reviewReport = await writeManualReviewCsv(checkpoint, reviewOutputPath)
    console.log(JSON.stringify({ reviewReport }, null, 2))
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Carrefour batch operation failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  createBatchId,
  createCheckpoint,
  discover,
  executeImport,
  flagDuplicateGtins,
  getBoundedInteger,
  getImportableItems,
  getImportableItemsForRun,
  getInitialItemStatus,
  getQueryProgress,
  main,
  readCheckpoint,
  createManifestCheckpoint,
  readManifestCheckpoint,
  readManifestCsv,
  recordPreviewPage,
  recordBatchFailure,
  serializeManualReviewCsv,
  setBatchResult,
  summarizeCheckpoint,
  writeManualReviewCsv,
  setBatchResult,
  writeCheckpoint,
}