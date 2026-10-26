const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '20261026_catalog_global_sort.sql'),
  'utf8',
)

test('catalog sort migration applies selected sort before relevance in every pagination order', () => {
  for (const [variable, sortClauses, relevanceClause] of [
    [
      'new_ranked_order',
      [
        "CASE WHEN prm.sort_mode = 'price-asc' THEN ranked.minimum_price END ASC NULLS LAST",
        "CASE WHEN prm.sort_mode = 'price-desc' THEN ranked.minimum_price END DESC NULLS LAST",
        "CASE WHEN prm.sort_mode = 'discount-desc' THEN ranked.discount_percentage END DESC NULLS LAST",
        "CASE WHEN prm.sort_mode = 'name-asc' THEN lower(ranked.name) END ASC NULLS LAST",
      ],
      'ranked.search_relevance',
    ],
    [
      'new_page_order',
      [
        "CASE WHEN prm.sort_mode = 'price-asc' THEN minimum_price END ASC NULLS LAST",
        "CASE WHEN prm.sort_mode = 'price-desc' THEN minimum_price END DESC NULLS LAST",
        "CASE WHEN prm.sort_mode = 'discount-desc' THEN discount_percentage END DESC NULLS LAST",
        "CASE WHEN prm.sort_mode = 'name-asc' THEN lower(name) END ASC NULLS LAST",
      ],
      'search_relevance',
    ],
    [
      'new_payload_order',
      [
        "CASE WHEN (SELECT sort_mode FROM params) = 'price-asc' THEN page_payload.minimum_price END ASC NULLS LAST",
        "CASE WHEN (SELECT sort_mode FROM params) = 'price-desc' THEN page_payload.minimum_price END DESC NULLS LAST",
        "CASE WHEN (SELECT sort_mode FROM params) = 'discount-desc' THEN page_payload.discount_percentage END DESC NULLS LAST",
        "CASE WHEN (SELECT sort_mode FROM params) = 'name-asc' THEN lower(page_payload.name) END ASC NULLS LAST",
      ],
      'page_payload.search_relevance',
    ],
  ]) {
    const definitionStart = migration.indexOf(`${variable} text := $new$`)
    assert.notEqual(definitionStart, -1, `missing ${variable}`)
    const bodyStart = definitionStart + `${variable} text := $new$`.length
    const bodyEnd = migration.indexOf('$new$;', bodyStart)
    assert.notEqual(bodyEnd, -1, `unterminated ${variable}`)
    const body = migration.slice(bodyStart, bodyEnd)
    const relevancePosition = body.indexOf(relevanceClause)
    assert.notEqual(relevancePosition, -1, `missing relevance tie-breaker in ${variable}`)
    for (const sortClause of sortClauses) {
      const sortPosition = body.indexOf(sortClause)
      assert.notEqual(sortPosition, -1, `missing ${sortClause} in ${variable}`)
      assert.ok(sortPosition < relevancePosition, `${variable} must prioritize selected sort over relevance`)
    }
  }

  assert.match(migration, /Expected catalog sort clauses were not found/)
  assert.match(migration, /function_definition := replace\(function_definition, old_ranked_order, new_ranked_order\)/)
  assert.match(migration, /function_definition := replace\(function_definition, old_page_order, new_page_order\)/)
  assert.match(migration, /function_definition := replace\(function_definition, old_payload_order, new_payload_order\)/)
})
