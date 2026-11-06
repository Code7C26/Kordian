const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const supabaseAdmin = require('../supabaseAdmin')
const {
  attachCandidateReports,
  createReportRow,
  runPreflight,
  serializeCandidateReportCsv,
} = require('./preflight_carrefour_manifest')
const { buildIdentitySnapshot } = require('../services/productMatchDecisionStore')

const captureRow = {
  source_product_id: '680457',
  source_sku: '52798',
  gtin: '7791720025123',
  name: 'Aceite de girasol alto omega Carrefour Classic pet 1.5 lts',
  brand: 'Carrefour Classic',
  category: 'Almacén',
  net_content: '1.5 lts',
  net_content_unit: 'l',
  net_content_value: '1.5',
  price: '5348.6',
  availability: 'available',
  postal_code: '5186',
  postal_code_confirmed: 'true',
  product_url: 'https://www.carrefour.com.ar/aceite-680457/p',
  capture_url: 'https://www.carrefour.com.ar/almacen',
  capture_timestamp: '2026-11-05T11:21:45.362Z',
  capture_method: 'rendered_dom_pagination',
  validation_status: 'valid',
  validation_errors: '',
}

function quoteCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function mockReadOnlyQuery(table, operations) {
  const query = {
    select() {
      operations.push({ table, operation: 'select' })
      return this
    },
    eq(column, value) {
      operations.push({ table, operation: 'eq', column, value })
      return this
    },
    in(column, values) {
      operations.push({ table, operation: 'in', column, values })
      return this
    },
    range(from, to) {
      operations.push({ table, operation: 'range', from, to })
      return this
    },
    then(resolve, reject) {
      const data = table === 'categories' || table === 'subcategories' || table === 'brands'
        ? []
        : []
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    },
  }
  return query
}

test('preflight emits explicit candidate CSV rows and performs no database writes', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'carrefour-preflight-'))
  const inputPath = path.join(tempDirectory, 'capture.csv')
  const headers = Object.keys(captureRow)
  fs.writeFileSync(inputPath, [
    headers.map(quoteCsv).join(','),
    headers.map((header) => quoteCsv(captureRow[header])).join(','),
  ].join('\r\n'), 'utf8')

  const operations = []
  const originalFrom = supabaseAdmin.from
  supabaseAdmin.from = (table) => mockReadOnlyQuery(table, operations)
  try {
    const report = await runPreflight(inputPath, { skipDecisions: true })
    const candidateCsv = serializeCandidateReportCsv(report)

    assert.equal(report.writesPerformed, false)
    assert.equal(report.items[0].status, 'manual_review_price_no_reference')
    assert.equal(report.items[0].taxonomySuggestionStatus, 'determined')
    assert.equal(report.items[0].proposedCategory, 'Almacén y Alimentos')
    assert.equal(report.items[0].proposedSubcategory, 'Aceites, condimentos y aderezos')
    assert.equal(report.items[0].candidateReport.classification, 'SIN_REFERENCIA')
    assert.equal(report.items[0].candidateReport.candidateSearchResult, 'SIN_CANDIDATOS')
    assert.match(candidateCsv, /SIN_CANDIDATOS/)
    assert.match(candidateCsv, /candidate_source_product_id/)
    assert.match(candidateCsv, /candidate_sku/)
    assert.equal(operations.some((operation) => ['insert', 'upsert', 'update', 'delete'].includes(operation.operation)), false)
  } finally {
    supabaseAdmin.from = originalFrom
    fs.rmSync(tempDirectory, { recursive: true, force: true })
  }
})

test('preflight leaves ambiguous taxonomy suggestions unassigned for manual review', () => {
  const row = createReportRow({
    rowNumber: 2,
    valid: true,
    errors: [],
    product: {
      sourceProductId: '680458',
      sourceSku: '52799',
      ean: '',
      name: 'Detergente y esponja multiuso',
      brand: '',
      category: 'Limpieza',
      price: 2500,
    },
  }, [], { categories: [], subcategories: [] })

  assert.equal(row.taxonomySuggestionStatus, 'ambiguous')
  assert.equal(row.proposedCategory, null)
  assert.equal(row.proposedSubcategory, null)
})

test('does not reuse a no-comparable decision after a comparable catalog candidate appears', () => {
  const sourceProduct = {
    source: 'carrefour',
    sourceProductId: 'source-1',
    sourceSku: 'sku-1',
    name: 'Aceite de girasol Arcor 900 ml',
    brand: 'Arcor',
    ean: '',
    price: 2500,
  }
  const localProduct = {
    id: 100,
    source: 'disco',
    source_product_id: 'disco-100',
    source_sku: 'local-100',
    ean: null,
    name: 'Aceite de girasol Arcor 900 ml',
    brands: { name: 'Arcor' },
    offers: [{ supermarket: 'Disco', cash_price: 2400 }],
  }
  const decision = {
    id: 'decision-1',
    source: 'carrefour',
    source_product_id: sourceProduct.sourceProductId,
    local_product_id: null,
    decision_type: 'no_comparable',
    status: 'approved',
    source_snapshot: buildIdentitySnapshot(sourceProduct),
  }
  const rows = [{
    sourceProductId: sourceProduct.sourceProductId,
    status: 'manual_review_price_no_reference',
  }]

  attachCandidateReports(
    rows,
    [{ product: sourceProduct }],
    [localProduct],
    [decision],
  )

  assert.equal(rows[0].candidateReport.classification, 'MATCH_REVISAR')
  assert.equal(rows[0].candidateReport.reusedDecision, undefined)
  assert.equal(rows[0].candidateReport.hasComparableCandidates, true)
})
