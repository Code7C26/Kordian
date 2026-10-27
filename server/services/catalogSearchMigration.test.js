const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const migrationDirectory = path.join(__dirname, '..', 'migrations')
const catalogFunction = readFileSync(
  path.join(migrationDirectory, '20261012_catalog_pagination.sql'),
  'utf8',
)
const tokenSearchMigration = readFileSync(
  path.join(migrationDirectory, '20261027_catalog_token_search.sql'),
  'utf8',
)

function migrationReplacement(name) {
  const marker = `${name} text := $old$`
  const start = tokenSearchMigration.indexOf(marker)
  assert.notEqual(start, -1, `Missing ${name} migration replacement`)
  const bodyStart = start + marker.length
  const bodyEnd = tokenSearchMigration.indexOf('$old$', bodyStart)
  assert.notEqual(bodyEnd, -1, `Unterminated ${name} migration replacement`)
  return tokenSearchMigration.slice(bodyStart, bodyEnd)
}

test('catalog token-search migration still matches the deployed function clauses', () => {
  for (const clause of ['old_search_params', 'old_search_filter', 'old_search_rank']) {
    assert.ok(
      catalogFunction.includes(migrationReplacement(clause)),
      `The ${clause} replacement no longer matches the original catalog function`,
    )
  }
})

test('catalog token-search migration splits the query once and requires every term', () => {
  assert.match(tokenSearchMigration, /regexp_split_to_array\(nullif\(btrim\(coalesce\(p_search/)
  assert.match(tokenSearchMigration, /FROM unnest\(prm\.search_terms\)/)
  assert.match(tokenSearchMigration, /FROM unnest\(search_terms\)/)
  assert.match(tokenSearchMigration, /AND NOT \(/)
})
