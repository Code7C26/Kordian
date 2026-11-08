import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPopularSearchTagsForVisit,
  getRandomQuickSearchTags,
  QUICK_SEARCH_TAGS,
} from './quickSearchTags.js'

test('returns the requested number of unique popular search tags', () => {
  const tags = getRandomQuickSearchTags(() => 0.5, 6)

  assert.equal(tags.length, 6)
  assert.equal(new Set(tags).size, tags.length)
  assert.ok(tags.every((tag) => QUICK_SEARCH_TAGS.includes(tag)))
})

test('returns all tags when the requested count exceeds the pool', () => {
  const tags = getRandomQuickSearchTags(() => 0, QUICK_SEARCH_TAGS.length + 1)

  assert.equal(tags.length, QUICK_SEARCH_TAGS.length)
  assert.deepEqual(new Set(tags), new Set(QUICK_SEARCH_TAGS))
})

test('changes the selected popular searches when the same selection would repeat', () => {
  const previousTags = getRandomQuickSearchTags(() => 0.5, 6)
  const nextTags = getRandomQuickSearchTags(() => 0.5, 6, previousTags)

  assert.notDeepEqual(new Set(nextTags), new Set(previousTags))
})

test('stores the latest popular searches for the next page visit', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }

  const firstVisit = getPopularSearchTagsForVisit(storage, () => 0.5)
  const secondVisit = getPopularSearchTagsForVisit(storage, () => 0.5)

  assert.notDeepEqual(new Set(secondVisit), new Set(firstVisit))
  assert.deepEqual(JSON.parse(values.get('arprice_popular_search_tags')), secondVisit)
})
