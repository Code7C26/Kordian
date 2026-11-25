const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseMonetaryAmount,
  parsePrice,
  normalizeNumericValue,
  normalizeDiscoStoredPrice,
  classifyPriceVariation,
  isDiscoScaleCorrection,
} = require('./priceNormalization')

test('parses Argentine monetary formats and rejects ambiguous separators', () => {
  assert.equal(parsePrice('$ 1.299,99'), 1299.99)
  assert.equal(parsePrice('1.234,56'), 1234.56)
  assert.equal(parsePrice('1.234'), 1234)
  assert.equal(parsePrice('1234,50'), 1234.5)
  assert.equal(parsePrice('3500'), 3500)
  assert.equal(parsePrice('1299.99'), 1299.99)
  assert.equal(parsePrice('$ 90.000'), 90000)
  assert.equal(parsePrice('90000'), 90000)
  assert.equal(parsePrice('1,299'), null)
  assert.equal(parseMonetaryAmount('1,299', { locale: 'en-US' }).normalizedValue, 1299)
  assert.equal(parseMonetaryAmount('1.299', { locale: 'numeric' }).status, 'invalid')
  assert.equal(parseMonetaryAmount('1e3').status, 'invalid')
  assert.equal(parsePrice(1.299), null)
})

test('normalizeNumericValue accepts locale-formatted strings', () => {
  assert.equal(normalizeNumericValue('1.234,56'), 1234.56)
  assert.equal(normalizeNumericValue('1500'), 1500)
  assert.equal(normalizeNumericValue('2.500'), 2500)
})

test('normalizes stored prices without applying scale multipliers based only on magnitude', () => {
  assert.equal(normalizeDiscoStoredPrice(1.29, 'disco'), 1.29)
  assert.equal(normalizeDiscoStoredPrice(4.69, 'disco'), 4.69)
  assert.equal(normalizeDiscoStoredPrice(5.37, 'disco'), 5.37)
  assert.equal(normalizeDiscoStoredPrice(150, 'disco'), 150)
  assert.equal(normalizeDiscoStoredPrice(1.29, 'manual'), 1.29)
})

test('recognizes Disco scale corrections despite moderate price drift', () => {
  assert.equal(isDiscoScaleCorrection(861300, 8613), true)
  assert.equal(isDiscoScaleCorrection(285000, 2700), true)
  assert.equal(isDiscoScaleCorrection(85000, 950), true)
  assert.equal(isDiscoScaleCorrection(2700, 285000), false)
  assert.equal(isDiscoScaleCorrection(222000, 2000), false)
  assert.equal(isDiscoScaleCorrection(1000, 0), false)
})

test('flags exact scale jumps while allowing large but non-scale commercial changes', () => {
  assert.deepEqual(classifyPriceVariation(100, 1000), {
    status: 'requires_review',
    ratio: 10,
    reason: 'scale_change_x10',
  })
  assert.equal(classifyPriceVariation(8613, 861300).reason, 'scale_change_x100')
  assert.equal(classifyPriceVariation(100, 180).status, 'valid')
  assert.equal(classifyPriceVariation(null, 180).status, 'insufficient_history')
})

test('does not apply Mami scale multipliers to stored values without source evidence', () => {
  assert.equal(normalizeDiscoStoredPrice(3.49, 'mami'), 3.49)
  assert.equal(normalizeDiscoStoredPrice(1.19, 'mami'), 1.19)
  assert.equal(normalizeDiscoStoredPrice(3490, 'mami'), 3490)
})
