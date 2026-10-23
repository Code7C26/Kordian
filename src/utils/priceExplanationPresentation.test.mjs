import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatOptionalNumber,
  formatOptionalPercentage,
  getAnalysisLoadMessage,
  resolveSelectedAnalysisProduct,
} from './priceExplanationPresentation.js'

test('formats unknown values without presenting them as zero', () => {
  assert.equal(formatOptionalNumber(null), 'No disponible')
  assert.equal(formatOptionalNumber(undefined), 'No disponible')
  assert.equal(formatOptionalPercentage(null), 'No disponible')
})

test('preserves known zero values', () => {
  assert.equal(formatOptionalNumber(0), '0.0')
  assert.equal(formatOptionalPercentage(0), '0.0%')
})

test('distinguishes loading, failed, and absent analysis', () => {
  assert.match(getAnalysisLoadMessage(null, 'loading'), /Cargando/)
  assert.match(getAnalysisLoadMessage(null, 'error'), /No se pudo cargar/)
  assert.match(getAnalysisLoadMessage(null, 'loaded'), /No hay un análisis disponible/)
  assert.equal(getAnalysisLoadMessage({ analysis: {} }, 'loaded'), null)
})

test('hydrates a selected detail product when the analysis request finishes', () => {
  const selected = { id: 10, name: 'Product', status: 'OFERTA' }
  const analysis = { classification: 'OFERTA', score: 0 }
  const resolved = resolveSelectedAnalysisProduct(selected, [{
    ...selected,
    status: 'OFERTA',
    analysis,
    priceHistory: [],
  }])

  assert.equal(resolved.analysis, analysis)
  assert.deepEqual(resolved.priceHistory, [])
  assert.equal(resolveSelectedAnalysisProduct(selected, []).analysis, undefined)
})
