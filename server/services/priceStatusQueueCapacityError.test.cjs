const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  API_ERROR_CODE,
  API_ISOLATION_ERROR_CODE,
  createPriceStatusQueueErrorPayload,
  createPriceStatusQueueCapacityErrorPayload,
  isPriceStatusQueueError,
  isPriceStatusQueueCapacityError,
} = require('./priceStatusQueueCapacityError')

test('identifies the database capacity SQLSTATE and stable message marker', () => {
  assert.equal(isPriceStatusQueueCapacityError({ code: 'P7501' }), true)
  assert.equal(isPriceStatusQueueCapacityError({
    message: 'PRICE_STATUS_QUEUE_CAPACITY_EXCEEDED',
  }), true)
  assert.equal(isPriceStatusQueueError({ code: 'P7502' }), true)
  assert.equal(isPriceStatusQueueCapacityError({ code: 'P7502' }), false)
  assert.equal(isPriceStatusQueueCapacityError({ code: '23503' }), false)
})

test('returns a user-readable capacity response and warns if compensation failed', () => {
  const response = createPriceStatusQueueCapacityErrorPayload({ code: 'P7501' })
  assert.equal(response.code, API_ERROR_CODE)
  assert.match(response.error, /No se guardaron los cambios/)

  const incompleteRollback = createPriceStatusQueueCapacityErrorPayload(
    { code: 'P7501' },
    { rolledBack: false },
  )
  assert.match(incompleteRollback.error, /No repitas la operación/)
})

test('reports incompatible transaction isolation as a distinct queue error', () => {
  const response = createPriceStatusQueueErrorPayload({ code: 'P7502' })
  assert.equal(response.code, API_ISOLATION_ERROR_CODE)
  assert.match(response.error, /READ COMMITTED/)
  assert.equal(createPriceStatusQueueCapacityErrorPayload({ code: 'P7502' }), null)
})
