const test = require('node:test')
const assert = require('node:assert/strict')
const { parsePrice, normalizeNumericValue, normalizeDiscoStoredPrice, isDiscoScaleCorrection } = require('./priceNormalization')

test('parsePrice handles decimal comma and thousand separators', () => {
  assert.equal(parsePrice('1.234,56'), 1234.56)
  assert.equal(parsePrice('1.234'), 1234)
  assert.equal(parsePrice('1234,50'), 1234.5)
  assert.equal(parsePrice('3500'), 3500)
})

test('normalizeNumericValue accepts locale-formatted strings', () => {
  assert.equal(normalizeNumericValue('1.234,56'), 1234.56)
  assert.equal(normalizeNumericValue('1500'), 1500)
  assert.equal(normalizeNumericValue('2.500'), 2500)
})

test('normalizeDiscoStoredPrice repairs low-scale historical offers', () => {
  assert.equal(normalizeDiscoStoredPrice(1.29, 'disco'), 129)
  assert.equal(normalizeDiscoStoredPrice(4.69, 'disco'), 469)
  assert.equal(normalizeDiscoStoredPrice(5.37, 'disco'), 537)
  assert.equal(normalizeDiscoStoredPrice(150, 'disco'), 150)
  assert.equal(normalizeDiscoStoredPrice(1.29, 'manual'), 1.29)
})

test('recognizes Disco scale corrections despite moderate price drift', () => {
  assert.equal(isDiscoScaleCorrection(861300, 8613), true)
  assert.equal(isDiscoScaleCorrection(285000, 2700), true)
  assert.equal(isDiscoScaleCorrection(2700, 285000), false)
  assert.equal(isDiscoScaleCorrection(222000, 2000), false)
  assert.equal(isDiscoScaleCorrection(1000, 0), false)
})

test('normalizes Mami prices below one hundred from thousands of pesos', () => {
  assert.equal(normalizeDiscoStoredPrice(3.49, 'mami'), 3490)
  assert.equal(normalizeDiscoStoredPrice(1.19, 'mami'), 1190)
  assert.equal(normalizeDiscoStoredPrice(3490, 'mami'), 3490)
})
