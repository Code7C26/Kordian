#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')
const csv = require('csv-parser')
const { enrichRowsWithHistoricalIdentity } = require('../services/carrefourHistoricalEnrichment')

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = []
    fs.createReadStream(filePath)
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

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function serializeCsv(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  return `\uFEFF${[
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\r\n')}\r\n`
}

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (!['--capture', '--history', '--output', '--report'].includes(arg)) {
      throw new Error(`Opción desconocida: ${arg}`)
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Falta la ruta después de ${arg}`)
    options[arg.slice(2)] = value
    index += 1
  }
  return options
}

function defaultOutputPaths(capturePath) {
  const extension = path.extname(capturePath) || '.csv'
  const basename = path.basename(capturePath, path.extname(capturePath))
  return {
    output: path.join(path.dirname(capturePath), `${basename}-identidad-historica${extension}`),
    report: path.join(path.dirname(capturePath), `${basename}-identidad-historica-report.json`),
  }
}

function ensureDistinctOutputPaths(capturePath, historyPath, outputPath, reportPath) {
  const inputPaths = new Set([capturePath, historyPath].map((filePath) => path.resolve(filePath)))
  const resolvedOutput = path.resolve(outputPath)
  const resolvedReport = path.resolve(reportPath)
  if (inputPaths.has(resolvedOutput) || inputPaths.has(resolvedReport)) {
    throw new Error('Las rutas de salida no pueden sobrescribir los archivos de entrada')
  }
  if (resolvedOutput === resolvedReport) throw new Error('El CSV y el reporte requieren rutas distintas')
  for (const filePath of [resolvedOutput, resolvedReport]) {
    if (fs.existsSync(filePath)) throw new Error(`El archivo de salida ya existe; no se sobrescribió: ${filePath}`)
  }
}

async function runEnrichment({ capture: capturePath, history: historyPath, output, report }) {
  if (!capturePath || !historyPath) {
    throw new Error('Indicá --capture <captura.csv> y --history <historico-enriquecido.csv>')
  }
  const paths = {
    capture: path.resolve(capturePath),
    history: path.resolve(historyPath),
    ...defaultOutputPaths(path.resolve(capturePath)),
  }
  if (output) paths.output = path.resolve(output)
  if (report) paths.report = path.resolve(report)
  if (!fs.existsSync(paths.capture)) throw new Error(`No se encontró la captura actual: ${paths.capture}`)
  if (!fs.existsSync(paths.history)) throw new Error(`No se encontró el histórico: ${paths.history}`)
  ensureDistinctOutputPaths(paths.capture, paths.history, paths.output, paths.report)

  const [currentRows, historicalRows] = await Promise.all([
    readCsv(paths.capture),
    readCsv(paths.history),
  ])
  if (!currentRows.length) throw new Error('La captura actual no contiene filas')
  if (!historicalRows.length) throw new Error('El histórico no contiene filas')
  const currentHeaders = new Set(Object.keys(currentRows[0]))
  const historicalHeaders = new Set(Object.keys(historicalRows[0]))
  for (const header of ['source_product_id', 'source_sku', 'gtin', 'name']) {
    if (!currentHeaders.has(header)) throw new Error(`La captura actual no contiene la columna ${header}`)
  }
  for (const header of [
    'enrichment_status',
    'enriched_source_product_id',
    'enriched_source_sku',
    'enriched_gtin',
    'enriched_name',
  ]) {
    if (!historicalHeaders.has(header)) throw new Error(`El histórico no contiene la columna ${header}`)
  }
  const result = enrichRowsWithHistoricalIdentity(currentRows, historicalRows)
  const reportData = {
    source: 'carrefour_historical_identity_enrichment',
    mode: 'read_only_manifest_derivation',
    writesPerformed: false,
    importPerformed: false,
    captureFile: paths.capture,
    historicalFile: paths.history,
    outputFile: paths.output,
    rowCount: currentRows.length,
    counts: result.counts,
    decisions: result.decisions,
  }
  reportData.reportFile = paths.report

  fs.writeFileSync(paths.output, serializeCsv(result.rows), { encoding: 'utf8', flag: 'wx' })
  try {
    fs.writeFileSync(paths.report, `${JSON.stringify(reportData, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    fs.unlinkSync(paths.output)
    throw error
  }

  return reportData
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log([
      'Uso: node scripts/enrich_carrefour_manifest_history.js --capture <captura-actual.csv> --history <historico-enriquecido.csv>',
      'Opcionales: --output <derivado.csv> --report <reporte.json>',
      'Solo genera archivos locales. No consulta ni modifica Supabase y no importa productos.',
      'Un GTIN histórico se copia únicamente con ID, nombre, SKU y presentación exactos, y checksum válido.',
    ].join('\n'))
    return
  }

  const report = await runEnrichment(parseArgs(args))
  console.log(`CSV derivado: ${report.outputFile}`)
  console.log(`Reporte: ${report.reportFile || 'guardado junto al CSV'}`)
  console.log('Conteos:', JSON.stringify(report.counts))
  console.log('No se modificó Supabase ni se importaron productos.')
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error al derivar el manifiesto: ${error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  csvCell,
  ensureDistinctOutputPaths,
  parseArgs,
  readCsv,
  runEnrichment,
  serializeCsv,
}
