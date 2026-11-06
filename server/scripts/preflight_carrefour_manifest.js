const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
const csv = require('csv-parser')
const supabaseAdmin = require('../supabaseAdmin')
const { suggestCatalogMapping } = require('../services/catalogTaxonomy')
const {
  findLocalMatch,
  findManifestDuplicates,
  getPackageSizeReviewWarning,
  getPriceReviewWarning,
  validateCarrefourManifestRow,
} = require('../services/carrefourManifest')
const { applyHistoricalPriceReview } = require('../services/carrefourHistoricalPriceReview')
const {
  DEFAULT_MATCH_THRESHOLDS,
  classifyCarrefourProduct,
} = require('../services/carrefourMatchCandidates')
const {
  buildIdentitySnapshot,
  isProductMatchDecisionCurrent,
  listProductMatchDecisions,
} = require('../services/productMatchDecisionStore')

const QUERY_CHUNK_SIZE = 100
const PRODUCT_SELECT = 'id, name, source, source_product_id, source_sku, ean, brand_id, brands(name), categories(name), subcategories(name), offers(id, supermarket, cash_price, list_price)'

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = []
    fs.createReadStream(filePath)
      .pipe(csv({ mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').replace(/^"(.*)"$/, '$1').trim() }))
      .on('data', (row) => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows))
  })
}

async function loadLocalProducts(items) {
  const productsById = new Map()
  const sourceIds = [...new Set(items.map((item) => item.product.sourceProductId))]
  const gtins = [...new Set(items.map((item) => item.product.ean))]

  for (let offset = 0; offset < Math.max(sourceIds.length, gtins.length); offset += QUERY_CHUNK_SIZE) {
    const sourceChunk = sourceIds.slice(offset, offset + QUERY_CHUNK_SIZE)
    const gtinChunk = gtins.slice(offset, offset + QUERY_CHUNK_SIZE)
    const requests = []
    if (sourceChunk.length) {
      requests.push(supabaseAdmin.from('products')
        .select(PRODUCT_SELECT)
        .eq('source', 'carrefour')
        .in('source_product_id', sourceChunk))
    }
    if (gtinChunk.length) {
      requests.push(supabaseAdmin.from('products')
        .select(PRODUCT_SELECT)
        .in('ean', gtinChunk))
    }
    const results = await Promise.all(requests)
    const failed = results.find((result) => result.error)
    if (failed) throw new Error(`No se pudo consultar el catálogo para el preflight: ${failed.error.message}`)
    for (const result of results) {
      for (const product of result.data || []) productsById.set(String(product.id), product)
    }
  }
  return [...productsById.values()]
}

function normalizeBrand(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

async function loadCandidateProducts(items, existingProducts = []) {
  const productsById = new Map((existingProducts || []).map((product) => [String(product.id), product]))
  const brandNames = new Set(items
    .map((item) => normalizeBrand(item.product.brand))
    .filter(Boolean))
  if (!brandNames.size) return [...productsById.values()]

  const { data: brands, error: brandsError } = await supabaseAdmin.from('brands').select('id, name')
  if (brandsError) throw new Error(`No se pudieron consultar las marcas para candidatos: ${brandsError.message}`)
  const brandIds = (brands || [])
    .filter((brand) => brandNames.has(normalizeBrand(brand.name)))
    .map((brand) => brand.id)

  for (let offset = 0; offset < brandIds.length; offset += QUERY_CHUNK_SIZE) {
    const brandChunk = brandIds.slice(offset, offset + QUERY_CHUNK_SIZE)
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabaseAdmin.from('products')
        .select(PRODUCT_SELECT)
        .in('brand_id', brandChunk)
        .range(from, from + 499)
      if (error) throw new Error(`No se pudieron consultar productos candidatos: ${error.message}`)
      for (const product of data || []) productsById.set(String(product.id), product)
      if (!data || data.length < 500) break
    }
  }
  return [...productsById.values()]
}

async function loadDecisionProducts(decisions) {
  const localIds = [...new Set((decisions || [])
    .map((decision) => decision.local_product_id)
    .filter((id) => id !== null && id !== undefined)
    .map(String))]
  const products = []
  for (let offset = 0; offset < localIds.length; offset += QUERY_CHUNK_SIZE) {
    const { data, error } = await supabaseAdmin.from('products')
      .select(PRODUCT_SELECT)
      .in('id', localIds.slice(offset, offset + QUERY_CHUNK_SIZE))
    if (error) throw new Error(`No se pudieron consultar las referencias de decisiones guardadas: ${error.message}`)
    products.push(...(data || []))
  }
  return products
}

async function loadTaxonomy() {
  const [categoriesResult, subcategoriesResult] = await Promise.all([
    supabaseAdmin.from('categories').select('id, name'),
    supabaseAdmin.from('subcategories').select('id, name, category_id'),
  ])
  if (categoriesResult.error || subcategoriesResult.error) {
    throw new Error(`No se pudo consultar la taxonomía: ${(categoriesResult.error || subcategoriesResult.error).message}`)
  }
  return {
    categories: categoriesResult.data || [],
    subcategories: subcategoriesResult.data || [],
  }
}

function attachCandidateReports(reportRows, sourceItems, candidateProducts, decisions, options = {}) {
  const sourceProductsById = new Map(sourceItems.map((item) => [
    String(item.product.sourceProductId),
    item.product,
  ]))
  const localProductsById = new Map(candidateProducts.map((product) => [String(product.id), product]))
  const decisionsBySourceId = new Map()
  for (const decision of decisions || []) {
    const key = String(decision.source_product_id || '')
    const entries = decisionsBySourceId.get(key) || []
    entries.push(decision)
    decisionsBySourceId.set(key, entries)
  }

  for (const row of reportRows.filter((item) => item.status === 'manual_review_price_no_reference')) {
    const sourceProduct = sourceProductsById.get(String(row.sourceProductId))
    if (!sourceProduct) continue
    const relevantProducts = candidateProducts.filter((candidate) => (
      candidate.source !== 'carrefour'
      && (normalizeBrand(candidate.brands?.name || candidate.brand) === normalizeBrand(sourceProduct.brand)
        || String(candidate.ean || '') === String(sourceProduct.ean || ''))
    ))
    const matchReport = classifyCarrefourProduct(sourceProduct, relevantProducts, options.thresholds)
    const priorDecisions = decisionsBySourceId.get(String(row.sourceProductId)) || []
    const reviewedDecisions = priorDecisions.map((decision) => {
      const localProduct = decision.local_product_id === null
        ? null
        : localProductsById.get(String(decision.local_product_id)) || null
      return {
        decision,
        localProduct,
        current: isProductMatchDecisionCurrent(decision, sourceProduct, localProduct),
      }
    })
    const reusableNoComparable = reviewedDecisions.find(({ decision, current }) => (
      decision.decision_type === 'no_comparable'
      && current.current
      && !matchReport.hasComparableCandidates
    ))
    const reusableMatch = reviewedDecisions.find(({ decision, current }) => (
      decision.decision_type === 'match'
      && current.current
    ))
    const priorCandidates = []
    for (const { decision, localProduct, current } of reviewedDecisions) {
      if (decision.local_product_id === null) continue
      const existingCandidate = matchReport.candidates.find((candidate) => (
        String(candidate.localProductId) === String(decision.local_product_id)
      ))
      if (existingCandidate) {
        existingCandidate.priorDecision = {
          type: decision.decision_type,
          status: decision.status,
          reused: current.current,
          staleReasons: current.current ? [] : current.reasons,
        }
      } else if (localProduct && !current.current) {
        priorCandidates.push({
          localProductId: localProduct.id,
          source: localProduct.source,
          sourceProductId: localProduct.source_product_id || null,
          name: localProduct.name || '',
          brand: localProduct.brands?.name || '',
          gtin: localProduct.ean || '',
          presentation: '',
          supermarket: [],
          prices: [],
          score: 0,
          confidence: 'baja',
          status: 'MATCH_REVISAR',
          differences: [],
          uncertainAttributes: [],
          matchedAttributes: [],
          reasons: ['DECISION_PREVIA_OBSOLETA'],
          hasComparableOffer: false,
          priorDecision: {
            type: decision.decision_type,
            status: decision.status,
            reused: false,
            staleReasons: current.reasons,
          },
        })
      }
    }
    if (priorCandidates.length) {
      matchReport.candidates = [...matchReport.candidates, ...priorCandidates]
        .slice(0, options.thresholds?.candidateLimit || DEFAULT_MATCH_THRESHOLDS.candidateLimit)
      matchReport.candidateCount += priorCandidates.length
    }
    if (reusableNoComparable) {
      matchReport.classification = 'NO_COMPARABLE'
      matchReport.reasons = ['DECISION_NO_COMPARABLE_REUTILIZADA']
      matchReport.reusedDecision = reusableNoComparable.decision.id
    } else if (reusableMatch) {
      const approvedCandidate = matchReport.candidates.find((candidate) => (
        String(candidate.localProductId) === String(reusableMatch.decision.local_product_id)
      ))
      if (approvedCandidate?.hasComparableOffer) {
        matchReport.classification = approvedCandidate.status === 'MATCH_EXACTO'
          ? 'MATCH_EXACTO'
          : 'MATCH_ALTO'
        matchReport.reusedDecision = reusableMatch.decision.id
        matchReport.reasons = ['DECISION_MATCH_APROBADA_REUTILIZADA']
      }
    }
    row.candidateReport = {
      ...matchReport,
      thresholds: {
        highConfidence: options.thresholds?.highConfidence ?? DEFAULT_MATCH_THRESHOLDS.highConfidence,
        review: options.thresholds?.review ?? DEFAULT_MATCH_THRESHOLDS.review,
        minimumCandidate: options.thresholds?.minimumCandidate ?? DEFAULT_MATCH_THRESHOLDS.minimumCandidate,
      },
    }
  }
  return reportRows
}

function createReportRow(item, products, taxonomy) {
  const { product } = item
  const match = findLocalMatch(item, products)
  const mapping = suggestCatalogMapping({
    name: product.name,
    brand: product.brand,
    description: product.description,
    presentation: product.presentation || product.netContent || product.net_content,
    unit: product.unit || product.netContentUnit || product.net_content_unit,
    source_category: product.category,
  })
  const category = taxonomy.categories.find((entry) => entry.name === mapping?.category)
  const subcategory = taxonomy.subcategories.find((entry) => (
    entry.name === mapping?.subcategory
    && String(entry.category_id) === String(category?.id)
  ))
  const existingCarrefourOffer = match.product?.offers?.find((offer) => offer.supermarket === 'Carrefour')
  const hasComparableOffer = (match.product?.offers || []).some((offer) => (
    offer.supermarket !== 'Carrefour'
    && Number.isFinite(Number(offer.cash_price))
    && Number(offer.cash_price) > 0
  ))
  const priceWarning = getPriceReviewWarning(product.price, match.product?.offers || [])
  const packageSizeWarning = match.product
    ? getPackageSizeReviewWarning(product.name, match.product.name)
    : null
  let status = 'ready_new_product'
  const reasons = [...item.errors]

  if (!item.valid) status = 'blocked_invalid_row'
  else if (match.ambiguous) {
    status = 'manual_review_identity'
    reasons.push(match.reason)
  } else if (packageSizeWarning) {
    status = 'manual_review_presentation'
    reasons.push(packageSizeWarning)
  } else if (priceWarning) {
    status = 'manual_review_price'
    reasons.push(priceWarning)
  } else if (!hasComparableOffer) {
    status = 'manual_review_price_no_reference'
    reasons.push('No hay otra oferta local para comparar; verificar el precio en Carrefour')
  } else if (!match.product && (!category || !subcategory)) {
    status = 'manual_review_taxonomy'
    reasons.push('No se pudo mapear categoría/subcategoría automáticamente')
  } else if (existingCarrefourOffer) {
    const currentPrice = Number(existingCarrefourOffer.cash_price)
    status = Number(currentPrice.toFixed(2)) === Number(product.price.toFixed(2))
      ? 'unchanged'
      : 'ready_update_offer'
  } else if (match.product) {
    status = 'ready_add_offer'
  }

  return {
    rowNumber: item.rowNumber,
    sourceProductId: product.sourceProductId,
    sourceSku: product.sourceSku,
    ean: product.ean,
    identitySource: product.identitySource,
    identityMatchMethod: product.identityMatchMethod,
    name: product.name,
    brand: product.brand,
    category: product.category,
    postalCode: product.postalCode,
    capturedAt: product.capturedAt,
    validation: item.valid ? 'valid' : 'invalid',
    status,
    reasons,
    existingProduct: match.product
      ? {
        id: match.product.id,
        name: match.product.name,
        source: match.product.source,
        sourceProductId: match.product.source_product_id,
        ean: match.product.ean,
        matchedBy: match.matchedBy,
        category: match.product.categories?.name || null,
        subcategory: match.product.subcategories?.name || null,
      }
      : null,
    existingOffers: (match.product?.offers || []).map((offer) => ({
      supermarket: offer.supermarket,
      cashPrice: Number(offer.cash_price),
      listPrice: Number(offer.list_price) || null,
    })),
    proposedCategory: mapping?.category || null,
    proposedSubcategory: mapping?.subcategory || null,
    taxonomySuggestionStatus: mapping.status,
    taxonomySuggestionConfidence: mapping.confidence,
    taxonomySuggestionReason: mapping.reason,
    taxonomySuggestionRule: mapping.rule,
    proposedTaxonomyExists: Boolean(category && subcategory),
    capturedPrice: product.price,
    netContent: product.netContent,
    netContentUnit: product.netContentUnit,
    netContentValue: product.netContentValue,
    capturedUnitPrice: product.unitPrice,
    rawUnitPrice: product.rawUnitPrice,
    existingCarrefourPrice: existingCarrefourOffer ? Number(existingCarrefourOffer.cash_price) : null,
    priceReviewWarning: priceWarning,
    packageSizeReviewWarning: packageSizeWarning,
  }
}

async function runPreflight(inputPath, options = {}) {
  const rows = await readCsv(inputPath)
  const items = rows.map((row, index) => ({
    rowNumber: index + 2,
    ...validateCarrefourManifestRow(row),
  }))
  const validItems = items.filter((item) => item.valid)
  const duplicates = findManifestDuplicates(validItems)
  const products = await loadLocalProducts(validItems)
  const taxonomy = await loadTaxonomy()
  const reportRows = items.map((item) => createReportRow(item, products, taxonomy))

  for (const duplicate of duplicates) {
    for (const rowNumber of duplicate.rowNumbers) {
      const reportRow = reportRows.find((row) => row.rowNumber === rowNumber)
      if (!reportRow) continue
      reportRow.status = 'manual_review_duplicate'
      reportRow.reasons.push(duplicate.reason)
    }
  }

  let finalReportRows = reportRows
  let historicalPricePolicy = null
  if (options.historicalPricePath) {
    const historicalRows = await readCsv(options.historicalPricePath)
    finalReportRows = applyHistoricalPriceReview(reportRows, rows, historicalRows)
    historicalPricePolicy = {
      sourceFile: path.resolve(options.historicalPricePath),
      maxReferenceAgeHours: 72,
      maxAbsolutePriceChangePercent: 20,
      matchingRequirements: ['validated historical identity evidence', 'exact GTIN', 'compatible package size'],
    }
  }

  let candidateSummary = null
  const noReferenceRows = finalReportRows.filter((row) => row.status === 'manual_review_price_no_reference')
  if (options.includeCandidates !== false && noReferenceRows.length) {
    const rowNumbers = new Set(noReferenceRows.map((row) => row.rowNumber))
    const candidateSourceItems = validItems.filter((item) => rowNumbers.has(item.rowNumber))
    const candidates = await loadCandidateProducts(candidateSourceItems, products)
    const decisions = options.skipDecisions
      ? []
      : await listProductMatchDecisions({
        source: 'carrefour',
        sourceProductIds: candidateSourceItems.map((item) => item.product.sourceProductId),
      })
    const decisionProducts = await loadDecisionProducts(decisions)
    const candidatePool = new Map([
      ...candidates.map((product) => [String(product.id), product]),
      ...decisionProducts.map((product) => [String(product.id), product]),
    ])
    attachCandidateReports(
      finalReportRows,
      candidateSourceItems,
      [...candidatePool.values()],
      decisions,
      { thresholds: options.thresholds },
    )
    const reports = noReferenceRows
      .map((row) => row.candidateReport)
      .filter(Boolean)
    const allCandidates = reports.flatMap((report) => report.candidates)
    candidateSummary = {
      analyzedProducts: reports.length,
      productsWithCandidates: reports.filter((report) => report.candidateCount > 0).length,
      productsWithoutCandidates: reports.filter((report) => report.candidateSearchResult === 'SIN_CANDIDATOS').length,
      productsWithAmbiguousCandidates: reports.filter((report) => report.ambiguous).length,
      classifications: reports.reduce((countsByClass, report) => {
        countsByClass[report.classification] = (countsByClass[report.classification] || 0) + 1
        return countsByClass
      }, {}),
      candidateClassifications: allCandidates.reduce((countsByClass, candidate) => {
        countsByClass[candidate.status] = (countsByClass[candidate.status] || 0) + 1
        return countsByClass
      }, {}),
      decisionsLoaded: decisions.length,
      decisionReadsSkipped: Boolean(options.skipDecisions),
      thresholds: {
        highConfidence: options.thresholds?.highConfidence ?? DEFAULT_MATCH_THRESHOLDS.highConfidence,
        review: options.thresholds?.review ?? DEFAULT_MATCH_THRESHOLDS.review,
        minimumCandidate: options.thresholds?.minimumCandidate ?? DEFAULT_MATCH_THRESHOLDS.minimumCandidate,
      },
      writeSafety: {
        databaseWrites: false,
        importersCalled: false,
        reason: 'Candidate generation and decision reuse only read the catalog and decision table.',
      },
    }
  }

  const counts = finalReportRows.reduce((result, row) => {
    result[row.status] = (result[row.status] || 0) + 1
    return result
  }, {})
  return {
    source: 'carrefour_manual_capture',
    mode: 'read_only_preflight',
    writesPerformed: false,
    inputFile: path.resolve(inputPath),
    rowCount: rows.length,
    counts,
    duplicateCount: duplicates.length,
    historicalPricePolicy,
    candidateSummary,
    items: finalReportRows,
  }
}

const CANDIDATE_CSV_HEADERS = [
  'carrefour_source_product_id',
  'carrefour_sku',
  'carrefour_gtin',
  'carrefour_name',
  'carrefour_brand',
  'carrefour_presentation',
  'carrefour_price',
  'carrefour_category',
  'local_product_id',
  'candidate_source_product_id',
  'candidate_sku',
  'candidate_supermarket',
  'candidate_name',
  'candidate_brand',
  'candidate_gtin',
  'candidate_presentation',
  'candidate_price',
  'score',
  'confidence',
  'differences',
  'reasons',
  'suggested_status',
  'candidate_status',
  'decision_status',
  'decision_type',
]

function csvCell(value) {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function serializeCandidateReportCsv(report) {
  const rows = [CANDIDATE_CSV_HEADERS]
  for (const item of report.items || []) {
    const candidateReport = item.candidateReport
    if (!candidateReport) continue
    const candidates = candidateReport.candidates.length
      ? candidateReport.candidates
      : [null]
    for (const candidate of candidates) {
      rows.push([
        item.sourceProductId,
        item.sourceSku,
        item.ean,
        item.name,
        item.brand || '',
        item.netContent || '',
        item.capturedPrice,
        item.category || '',
        candidate?.localProductId ?? '',
        candidate?.sourceProductId || '',
        candidate?.sourceSku || '',
        candidate?.supermarket?.join('|') || (candidate ? 'SIN_OFERTA_COMPARABLE' : ''),
        candidate?.name || '',
        candidate?.brand || '',
        candidate?.gtin || '',
        candidate?.presentation || '',
        candidate?.prices?.map((price) => `${price.supermarket}:${price.price}`).join('|') || '',
        candidate?.score ?? '',
        candidate?.confidence || '',
        candidate?.differences || [],
        candidate?.reasons || candidateReport.reasons,
        candidateReport.classification,
        candidate?.status || candidateReport.candidateSearchResult || '',
        candidate?.priorDecision?.status || '',
        candidate?.priorDecision?.type || '',
      ])
    }
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Uso: node scripts/preflight_carrefour_manifest.js <captura.csv>')
    console.log('Opcionales: --output <reporte.json> --history <historico-validado.csv> --candidates-output <candidatos.csv>')
    console.log('Umbrales: --match-high <0-100> --match-review <0-100> --match-minimum <0-100>')
    console.log('En pruebas puede omitirse la lectura de decisiones con --skip-decisions (no las guarda ni las reutiliza).')
    console.log('Solo valida el CSV y consulta asociaciones/precios en Supabase; no escribe datos.')
    console.log('Con --history, contrasta precios con GTIN histórico exacto y presentación compatible (máx. 72 h, variación ±20%).')
    return
  }
  const optionValue = (name) => {
    const index = args.indexOf(name)
    if (index < 0) return ''
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Falta la ruta después de ${name}`)
    return args[index + 1]
  }
  const inputPaths = args.filter((arg, index) => !arg.startsWith('--')
    && ![
      '--output',
      '--history',
      '--candidates-output',
      '--match-high',
      '--match-review',
      '--match-minimum',
    ].includes(args[index - 1]))
  if (inputPaths.length > 1) throw new Error('Indicá un único CSV de captura')
  const inputPath = inputPaths[0]
  if (!inputPath) throw new Error('Indicá la ruta del CSV de captura')
  const outputPath = optionValue('--output')
  const historicalPricePath = optionValue('--history')
  const candidatesOutputPath = optionValue('--candidates-output')
  const parseThreshold = (name, fallback) => {
    const value = optionValue(name)
    if (!value) return fallback
    const threshold = Number(value)
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new Error(`${name} debe estar entre 0 y 100`)
    }
    return threshold
  }
  const thresholds = {
    highConfidence: parseThreshold('--match-high', DEFAULT_MATCH_THRESHOLDS.highConfidence),
    review: parseThreshold('--match-review', DEFAULT_MATCH_THRESHOLDS.review),
    minimumCandidate: parseThreshold('--match-minimum', DEFAULT_MATCH_THRESHOLDS.minimumCandidate),
  }
  const report = await runPreflight(inputPath, {
    historicalPricePath,
    thresholds,
    skipDecisions: args.includes('--skip-decisions'),
  })
  if (outputPath) {
    const resolvedOutputPath = path.resolve(outputPath)
    await fs.promises.writeFile(resolvedOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(`Reporte de solo lectura guardado en ${resolvedOutputPath}`)
  } else {
    console.log(JSON.stringify(report, null, 2))
  }
  if (candidatesOutputPath) {
    const resolvedCandidatesPath = path.resolve(candidatesOutputPath)
    await fs.promises.writeFile(resolvedCandidatesPath, serializeCandidateReportCsv(report), 'utf8')
    console.log(`Reporte CSV de candidatos guardado en ${resolvedCandidatesPath}`)
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Preflight Carrefour falló: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  createReportRow,
  attachCandidateReports,
  loadLocalProducts,
  loadCandidateProducts,
  main,
  readCsv,
  runPreflight,
  attachCandidateReports,
  serializeCandidateReportCsv,
}
