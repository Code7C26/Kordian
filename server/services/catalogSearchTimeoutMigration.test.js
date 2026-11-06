const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const migrationDirectory = path.join(__dirname, '..', 'migrations')
const tokenSearchMigration = readFileSync(
  path.join(migrationDirectory, '20261027_catalog_token_search.sql'),
  'utf8',
)
const timeoutFixMigration = readFileSync(
  path.join(migrationDirectory, '20261104_catalog_search_timeout_fix.sql'),
  'utf8',
)

test('catalog timeout migration replaces materialized offer lookups with indexed base-table lookups', () => {
  const marker = 'old_offer_search text := $old$'
  const start = timeoutFixMigration.indexOf(marker)
  assert.notEqual(start, -1)
  const bodyStart = start + marker.length
  const bodyEnd = timeoutFixMigration.indexOf('$old$', bodyStart)
  assert.notEqual(bodyEnd, -1)
  const oldLookup = timeoutFixMigration.slice(bodyStart, bodyEnd)

  assert.ok(tokenSearchMigration.includes(oldLookup))
  assert.match(timeoutFixMigration, /new_offer_search text := \$new\$[ \t]*FROM public\.offers search_offer/)
  assert.match(timeoutFixMigration, /position\(new_offer_search IN function_definition\)/)
  assert.match(timeoutFixMigration, /search_offer\.product_id = p\.id/)
})
