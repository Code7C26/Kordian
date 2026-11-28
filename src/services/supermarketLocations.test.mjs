import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchSupermarketLocations } from './supermarketLocations.js'

test('loads and caches supermarket branch addresses by city and store', async () => {
  const requests = []
  const fetchImpl = async (url) => {
    requests.push(url)
    return {
      ok: true,
      json: async () => ({ addresses: [' Av. Belgrano 140 ', '', null, 'Prudencio Bustos 122'] }),
    }
  }

  const firstResult = await fetchSupermarketLocations('Test City', 'Test Store', fetchImpl)
  const cachedResult = await fetchSupermarketLocations('Test City', 'Test Store', fetchImpl)

  assert.deepEqual(firstResult, [' Av. Belgrano 140 ', 'Prudencio Bustos 122'])
  assert.deepEqual(cachedResult, firstResult)
  assert.equal(requests.length, 1)
  assert.match(requests[0], /city=Test\+City/)
  assert.match(requests[0], /store=Test\+Store/)
})

test('surfaces branch address API errors', async () => {
  await assert.rejects(
    fetchSupermarketLocations('Error City', 'Error Store', async () => ({
        ok: false,
        json: async () => ({ error: 'Branch data unavailable' }),
      })),
    { message: 'Branch data unavailable' },
  )
})
