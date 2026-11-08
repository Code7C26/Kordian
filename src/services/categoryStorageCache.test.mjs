import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { readStoredCategories, storeCategories } from './categoryStorageCache.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }
}

const originalLocalStorage = globalThis.localStorage

afterEach(() => {
  globalThis.localStorage = originalLocalStorage
})

test('stores categories separately for each API and returns them immediately', () => {
  globalThis.localStorage = createStorage()
  const categories = [{ id: 1, name: 'Almacén' }]

  storeCategories('https://api.example.test/categories', categories)

  assert.deepEqual(readStoredCategories('https://api.example.test/categories'), categories)
  assert.deepEqual(readStoredCategories('http://localhost:3000/categories'), [])
})

test('ignores malformed or non-array category cache entries', () => {
  const values = new Map([
    ['arprice_categories_cache:malformed', '{'],
    ['arprice_categories_cache:not-array', '{"id":1}'],
  ])
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  }

  assert.deepEqual(readStoredCategories('malformed'), [])
  assert.deepEqual(readStoredCategories('not-array'), [])
})
