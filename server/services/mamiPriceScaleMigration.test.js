const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261027_mami_price_scale.sql'),
  'utf8',
)

test('catalog summary applies the Mami-specific thousand-fold scale and rebuilds cached prices', () => {
  assert.match(migration, /= 'mami' AND p_price > 0 AND p_price < 100\s+THEN round\(p_price \* 1000, 2\)/i)
  assert.match(migration, /catalog_normalize_offer_price\(p\.source, o\.cash_price\)/)
  assert.match(migration, /PERFORM refresh_catalog_offer_price_summary\(offer_row\.id\)/)
})
