const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
const { fetchMamiCategoryReport, isValidProduct } = require('../services/mamiImporter')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')

const apiPort = Number(process.env.PORT) || 3000
const apiUrl = String(process.env.MAMI_IMPORT_API_URL || `http://127.0.0.1:${apiPort}`).replace(/\/$/, '')
const batchSize = Math.min(100, Math.max(1, Number(process.env.MAMI_IMPORT_BATCH_SIZE || 50)))
const maxCategoryRoutes = Math.max(1, Number(process.env.MAMI_MAX_CATEGORY_ROUTES || 1000))
const maxProductRoutes = Math.max(1, Number(process.env.MAMI_MAX_PRODUCT_ROUTES || 5000))
const checkpointFile = path.resolve(process.env.MAMI_IMPORT_CHECKPOINT_FILE || path.join(__dirname, '..', 'uploads', 'mami_import_checkpoint.json'))

function printHelp() {
  console.log('Rastrea Mami por categoria y luego importa el snapshot completo en lotes reanudables.')
  console.log('Autenticacion: MAMI_IMPORT_USERNAME/MAMI_IMPORT_PASSWORD o ADMIN_SESSION_SECRET local.')
  console.log('Opcionales: MAMI_IMPORT_API_URL, MAMI_IMPORT_BATCH_SIZE, MAMI_MAX_CATEGORY_ROUTES, MAMI_MAX_PRODUCT_ROUTES, MAMI_IMPORT_CHECKPOINT_FILE.')
}

async function readCheckpoint() {
  try {
    return JSON.parse(await fs.readFile(checkpointFile, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { source: 'mami', version: 2, phase: 'crawling', categories: {}, items: {}, coverageIssues: [], createdAt: new Date().toISOString() }
  }
}

async function writeCheckpoint(checkpoint) {
  await fs.mkdir(path.dirname(checkpointFile), { recursive: true })
  const temporaryFile = `${checkpointFile}.tmp`
  await fs.writeFile(temporaryFile, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
  await fs.rename(temporaryFile, checkpointFile)
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(`${response.status}: ${body.error || 'Solicitud fallida'}${body.detail ? ` (${body.detail})` : ''}`)
    error.status = response.status
    error.response = body
    throw error
  }
  return body
}

async function requestImportBatch(url, options = {}, { maxAttempts = 5, retryDelayMs = 1000 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestJson(url, options)
    } catch (error) {
      const safeCatalogReadFailure = error.status === 500
        && error.response?.error === 'No se pudo consultar el catálogo local'
      if (!safeCatalogReadFailure || attempt === maxAttempts) throw error
      const delayMs = retryDelayMs * (2 ** (attempt - 1))
      console.warn(`Lectura del catálogo fallida antes de escribir; reintento ${attempt + 1}/${maxAttempts} en ${delayMs}ms`)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw new Error('No se pudo confirmar el lote de importación')
}

async function login() {
  const username = process.env.MAMI_IMPORT_USERNAME
  const password = process.env.MAMI_IMPORT_PASSWORD
  if (!username || !password) throw new Error('Faltan MAMI_IMPORT_USERNAME y MAMI_IMPORT_PASSWORD')
  const result = await requestJson(`${apiUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!result.token) throw new Error('El login no devolvio un token')
  return { Authorization: `Bearer ${result.token}` }
}

function createLocalAdminHeaders() {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('Falta ADMIN_SESSION_SECRET para firmar un token administrativo local')
  const username = 'local-mami-import'
  const payload = Buffer.from(JSON.stringify({ username, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return { Authorization: `Bearer ${payload}.${signature}` }
}

async function getAdminHeaders() {
  if (process.env.MAMI_IMPORT_USERNAME && process.env.MAMI_IMPORT_PASSWORD) return login()
  return createLocalAdminHeaders()
}

function getStatus(checkpoint, sourceProductId) {
  return checkpoint.items[sourceProductId]?.status || 'pending'
}

function setStatus(checkpoint, entries, status) {
  for (const entry of entries) {
    const sourceProductId = String(entry.sourceProductId || '').trim()
    if (!sourceProductId) continue
    checkpoint.items[sourceProductId] = {
      ...(checkpoint.items[sourceProductId] || {}),
      sourceProductId,
      status,
      updatedAt: new Date().toISOString(),
    }
  }
}

function createCheckpoint() {
  return {
    source: 'mami',
    version: 2,
    phase: 'crawling',
    categories: {},
    items: {},
    coverageIssues: [],
    createdAt: new Date().toISOString(),
  }
}

function addCoverageIssue(checkpoint, issue) {
  if (!checkpoint.coverageIssues.includes(issue)) checkpoint.coverageIssues.push(issue)
}

function rememberProduct(checkpoint, rawProduct) {
  const sourceProductId = String(rawProduct.sourceProductId || '').trim()
  if (!sourceProductId || !isValidProduct(rawProduct)) return
  const mapping = suggestCatalogMapping({
    name: rawProduct.name,
    brand: rawProduct.brand,
    source_category: rawProduct.sourceCategory,
    source_subcategory: rawProduct.proposedSubcategory,
  })
  const product = {
    ...rawProduct,
    proposedCategory: rawProduct.proposedCategory || mapping?.category || null,
    proposedSubcategory: rawProduct.proposedSubcategory || mapping?.subcategory || null,
  }
  const previous = checkpoint.items[sourceProductId] || {}
  checkpoint.items[sourceProductId] = {
    ...previous,
    sourceProductId,
    name: product.name,
    product,
    status: previous.status || 'pending',
    updatedAt: new Date().toISOString(),
  }
}

function saveCategoryResult(checkpoint, route, result) {
  if (!route) {
    checkpoint.categoryManifest = result.categoryRoutes || []
  }
  for (const product of result.products || []) rememberProduct(checkpoint, product)
  const categoryName = route || '@home'
  if (result.sourceRead?.categoryRouteLimitReached) {
    addCoverageIssue(checkpoint, `La categoria ${categoryName} alcanzo el limite de rutas de categoria`)
  }
  if (result.sourceRead?.productRouteLimitReached) {
    addCoverageIssue(checkpoint, `La categoria ${categoryName} alcanzo el limite de rutas de producto`)
  }
  checkpoint.categories[categoryName] = {
    ...(checkpoint.categories[categoryName] || {}),
    status: 'complete',
    categoryRouteCount: result.sourceRead?.categoryRouteCount || 0,
    productRouteCount: result.sourceRead?.productRouteCount || 0,
    categoryRouteLimit: result.sourceRead?.categoryRouteLimit || maxCategoryRoutes,
    productRouteLimit: result.sourceRead?.productRouteLimit || maxProductRoutes,
    categoryRouteLimitReached: Boolean(result.sourceRead?.categoryRouteLimitReached),
    productRouteLimitReached: Boolean(result.sourceRead?.productRouteLimitReached),
    productCount: (result.products || []).length,
    discardedCount: (result.discarded || []).length,
    completedAt: new Date().toISOString(),
  }
}

async function crawlCatalog(checkpoint) {
  checkpoint.deferredCategoryRoutes = []
  checkpoint.coverageIssues = checkpoint.coverageIssues.filter((issue) => !issue.startsWith('Se alcanzo el limite de '))

  const home = await fetchMamiCategoryReport('')
  if (!home.sourceRead?.htmlFetched || !home.categoryRoutes.length) {
    throw new Error('Mami no entrego un catalogo inicial con categorias; no se importara ningun producto')
  }
  saveCategoryResult(checkpoint, '', home)
  await writeCheckpoint(checkpoint)
  console.log(JSON.stringify({ category: '@home', discoveredCategories: checkpoint.categoryManifest.length }))

  const manifest = checkpoint.categoryManifest.slice(0, maxCategoryRoutes)
  for (const route of manifest) {
    if (!checkpoint.categories[route]) checkpoint.categories[route] = { status: 'pending', queuedAt: new Date().toISOString() }
    if (checkpoint.categories[route].status === 'failed') checkpoint.categories[route].status = 'pending'
    const category = checkpoint.categories[route]
    const truncatedByRaisedLimit = (category.categoryRouteLimitReached && maxCategoryRoutes > (category.categoryRouteLimit || maxCategoryRoutes))
      || (category.productRouteLimitReached && maxProductRoutes > (category.productRouteLimit || maxProductRoutes))
    if (category.status === 'complete' && truncatedByRaisedLimit) category.status = 'pending'
  }
  if (home.sourceRead?.categoryRouteLimitReached || checkpoint.categoryManifest.length > maxCategoryRoutes) {
    addCoverageIssue(checkpoint, `El home supera el limite de ${maxCategoryRoutes} categorias; snapshot incompleto`)
  }

  while (true) {
    const route = manifest.find((item) => checkpoint.categories[item]?.status === 'pending')
    if (!route) break
    try {
      const result = await fetchMamiCategoryReport(route)
      if (!result.sourceRead?.htmlFetched) throw new Error('La categoria no devolvio HTML; queda pendiente de reintento')
      saveCategoryResult(checkpoint, route, result)
      console.log(JSON.stringify({ category: route, products: result.products.length, discoveredCategories: result.categoryRoutes.length }))
    } catch (error) {
      checkpoint.categories[route] = {
        ...(checkpoint.categories[route] || {}),
        status: 'failed',
        error: error.message,
        failedAt: new Date().toISOString(),
      }
    }
    await writeCheckpoint(checkpoint)
  }

  const failedCategories = manifest.filter((route) => checkpoint.categories[route]?.status === 'failed')
  if (failedCategories.length) throw new Error(`${failedCategories.length} categorias fallaron; vuelve a ejecutar para reintentar desde el checkpoint`)
  if (checkpoint.coverageIssues.length) throw new Error(`Cobertura incompleta: ${checkpoint.coverageIssues.join('; ')}. No se importara el snapshot`)
  checkpoint.phase = 'importing'
  checkpoint.crawledAt = new Date().toISOString()
  checkpoint.total = Object.keys(checkpoint.items).length
  await writeCheckpoint(checkpoint)
}

async function main() {
  if (process.argv.includes('--help')) {
    printHelp()
    return
  }
  if (!(process.env.MAMI_IMPORT_USERNAME && process.env.MAMI_IMPORT_PASSWORD) && !process.env.ADMIN_SESSION_SECRET) {
    throw new Error('Falta login de importacion y ADMIN_SESSION_SECRET; no se iniciara el rastreo ni la importacion')
  }

  const previousCheckpoint = await readCheckpoint()
  const checkpoint = previousCheckpoint.version === 2 && ['crawling', 'importing'].includes(previousCheckpoint.phase)
    ? previousCheckpoint
    : createCheckpoint()
  checkpoint.categories ||= {}
  checkpoint.items ||= {}
  checkpoint.coverageIssues ||= []
  if (checkpoint.phase === 'crawling') await crawlCatalog(checkpoint)

  const headers = await getAdminHeaders()
  const products = Object.values(checkpoint.items).map((item) => item.product).filter(Boolean)
  checkpoint.batchSize = batchSize
  checkpoint.snapshot = {
    categoryCount: (checkpoint.categoryManifest || []).length,
    productCount: products.length,
  }
  await writeCheckpoint(checkpoint)

  const pending = products.filter((product) => getStatus(checkpoint, product.sourceProductId) === 'pending')
  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize)
    const result = await requestImportBatch(`${apiUrl}/admin/import/mami`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ products: batch, query: 'mami-batch-import' }),
    })
    setStatus(checkpoint, result.imported || [], 'imported')
    setStatus(checkpoint, result.updated || [], 'updated')
    setStatus(checkpoint, result.unchanged || [], 'unchanged')
    setStatus(checkpoint, result.skipped || [], 'skipped')
    await writeCheckpoint(checkpoint)
    console.log(JSON.stringify({ batch: Math.floor(start / batchSize) + 1, processed: Math.min(start + batch.length, pending.length), totalPending: pending.length }))
  }

  const counts = Object.values(checkpoint.items).reduce((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1
    return result
  }, {})
  checkpoint.completedAt = new Date().toISOString()
  checkpoint.counts = counts
  checkpoint.phase = 'completed'
  await writeCheckpoint(checkpoint)
  console.log(JSON.stringify({ checkpointFile, total: products.length, counts }, null, 2))
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Mami batch import failed: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = { requestJson, requestImportBatch }