const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const {
  csvCell,
  ensureDistinctOutputPaths,
  parseArgs,
  runEnrichment,
  serializeCsv,
} = require('./enrich_carrefour_manifest_history')

test('parses required and optional CLI arguments', () => {
  assert.deepEqual(
    parseArgs(['--capture', 'current.csv', '--history', 'history.csv', '--output', 'derived.csv']),
    { capture: 'current.csv', history: 'history.csv', output: 'derived.csv' },
  )
  assert.throws(() => parseArgs(['--capture']), /Falta la ruta/)
  assert.throws(() => parseArgs(['--unknown', 'value']), /Opción desconocida/)
})

test('quotes CSV fields and protects spreadsheet formula values', () => {
  assert.equal(csvCell('Producto, "especial"'), '"Producto, ""especial"""')
  assert.equal(csvCell('=1+1'), '"\'=1+1"')
  assert.match(serializeCsv([{ name: 'Producto', gtin: '7798033333907' }]), /^\uFEFF/)
})

test('refuses to overwrite input files or existing outputs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carrefour-history-cli-'))
  try {
    const capture = path.join(dir, 'capture.csv')
    const history = path.join(dir, 'history.csv')
    const output = path.join(dir, 'output.csv')
    const report = path.join(dir, 'report.json')
    fs.writeFileSync(output, '')
    assert.throws(() => ensureDistinctOutputPaths(capture, history, capture, report), /no pueden sobrescribir/)
    assert.throws(() => ensureDistinctOutputPaths(capture, history, output, report), /ya existe/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('creates a derived manifest and audit report without modifying source files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carrefour-history-cli-'))
  try {
    const capture = path.join(dir, 'capture.csv')
    const history = path.join(dir, 'history.csv')
    const output = path.join(dir, 'derived.csv')
    const report = path.join(dir, 'report.json')
    fs.writeFileSync(capture, [
      '"source_product_id","source_sku","gtin","name","validation_status","validation_errors"',
      '122140,9547,,\"Lomito de atún 170 grs\",needs_review,\"No se pudo leer un GTIN\"',
    ].join('\r\n'))
    fs.writeFileSync(history, [
      '"enrichment_status","enriched_source_product_id","enriched_source_sku","enriched_gtin","enriched_name","capture_timestamp"',
      'validated,122140,9547,7798033333907,\"Lomito de atún 170 grs\",2026-10-29T17:02:31.540Z',
    ].join('\r\n'))
    const originalCapture = fs.readFileSync(capture, 'utf8')
    const originalHistory = fs.readFileSync(history, 'utf8')

    const result = await runEnrichment({ capture, history, output, report })
    const derivedRows = await new Promise((resolve, reject) => {
      const csv = require('csv-parser')
      const rows = []
      fs.createReadStream(output).pipe(csv()).on('data', (row) => rows.push(row))
        .on('error', reject).on('end', () => resolve(rows))
    })
    const savedReport = JSON.parse(fs.readFileSync(report, 'utf8'))

    assert.deepEqual(result.counts, { matched: 1 })
    assert.equal(derivedRows[0].gtin, '7798033333907')
    assert.equal(derivedRows[0].identity_source, 'historical_validated')
    assert.equal(savedReport.writesPerformed, false)
    assert.equal(savedReport.importPerformed, false)
    assert.equal(fs.readFileSync(capture, 'utf8'), originalCapture)
    assert.equal(fs.readFileSync(history, 'utf8'), originalHistory)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
