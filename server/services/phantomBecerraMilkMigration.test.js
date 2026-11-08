const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const migration = readFileSync(
  path.join(__dirname, '..', 'migrations', '20261108_remove_phantom_becerra_milk_offer.sql'),
  'utf8',
)

test('removes only the phantom Becerra offer for the identified milk product', () => {
  assert.match(migration, /DELETE FROM public\.offers AS offer\s+USING public\.products AS product/i)
  assert.match(migration, /product\.ean = '7790742348203'/)
  assert.match(migration, /product\.source = 'disco'/)
  assert.match(migration, /product\.source_product_id = '331926'/)
  assert.match(migration, /lower\(btrim\(offer\.supermarket\)\) = 'becerra'/)
  assert.doesNotMatch(migration, /DELETE FROM public\.products/i)
})
