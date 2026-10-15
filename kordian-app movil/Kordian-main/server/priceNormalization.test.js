const test = require('node:test')
const assert = require('node:assert/strict')
const { parsePrice, normalizeNumericValue, normalizeDiscoStoredPrice } = require('./priceNormalization')

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
