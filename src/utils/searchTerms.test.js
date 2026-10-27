import assert from 'node:assert/strict'
import test from 'node:test'
import { getSearchRelevance, getSearchTerms, matchesSearchTerms } from './searchTerms.js'

test('matches every search term regardless of its order', () => {
  assert.equal(matchesSearchTerms('Gaseosa Cola Sabor Original 1.25 Lts Coca Cola', 'Coca 1'), true)
  assert.equal(matchesSearchTerms('Coca Cola Gaseosa 1.25 Lts', '1 coca'), true)
  assert.equal(matchesSearchTerms('Gaseosa Cola Sabor Original 1.25 Lts Coca Cola', 'Coca 9'), false)
})

test('matches terms across searchable fields and ignores accents and letter case', () => {
  assert.equal(matchesSearchTerms(['Bebida sabor limon', 'Coca Cola'], 'COCÁ LIMÓN'), true)
  assert.deepEqual(getSearchTerms('  Coca   1  '), ['coca', '1'])
})

test('ranks names containing all terms above partial matches', () => {
  assert.equal(getSearchRelevance('Gaseosa Original 1.25 Lts Coca Cola', 'Coca 1'), 2)
  assert.equal(getSearchRelevance('Gaseosa Original Coca Cola', 'Coca 1'), 3)
})
