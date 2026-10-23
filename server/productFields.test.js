const assert = require('node:assert/strict')
const test = require('node:test')
const { normalizeOptionalReference } = require('./productFields')

test('preserves populated reference IDs', () => {
  assert.equal(normalizeOptionalReference('  category-id  '), 'category-id')
})

test('converts empty references to null', () => {
  assert.equal(normalizeOptionalReference(''), null)
  assert.equal(normalizeOptionalReference('   '), null)
  assert.equal(normalizeOptionalReference(null), null)
  assert.equal(normalizeOptionalReference(undefined), null)
})
