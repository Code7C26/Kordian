const assert = require('node:assert/strict')
const { test } = require('node:test')
const { getUserProvidedSupermarketLocations } = require('./userProvidedSupermarketLocations')

test('returns only the locations supplied for each supermarket and city', () => {
  assert.deepEqual(
    getUserProvidedSupermarketLocations('Alta Gracia', 'Becerra'),
    [
      'Av. Belgrano 466',
      'Sarmiento 489',
      'Lucas V. Córdoba 982',
      'Av. Libertador 1740',
      'Agustín Aguirre 364',
      'Liniers Sur',
      'Av. Libertador & Ituzaingó',
      'Concejal José Alonso 770',
    ],
  )
  assert.deepEqual(
    getUserProvidedSupermarketLocations('Alta Gracia', 'Carrefour'),
    ['Av. Belgrano 140', 'Prudencio Bustos 122'],
  )
  assert.deepEqual(
    getUserProvidedSupermarketLocations('Alta Gracia', 'Carrefour Express'),
    ['Av. Belgrano 140', 'Prudencio Bustos 122'],
  )
  assert.deepEqual(
    getUserProvidedSupermarketLocations('Alta Gracia', 'Disco'),
    ['Av. Raúl Alfonsín 650', 'Ruta Provincial 5 esq. Reconquista'],
  )
  assert.deepEqual(
    getUserProvidedSupermarketLocations('Alta Gracia', 'Mami'),
    ['Gabino Ezeiza 1081, RP5, Km 29'],
  )
  assert.deepEqual(
    getUserProvidedSupermarketLocations('Alta Gracia', 'Super Mami'),
    ['Gabino Ezeiza 1081, RP5, Km 29'],
  )
  assert.deepEqual(getUserProvidedSupermarketLocations('Córdoba', 'Becerra'), [])
})
