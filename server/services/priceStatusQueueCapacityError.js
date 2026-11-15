const SQLSTATE = 'P7501'
const ERROR_MARKER = 'PRICE_STATUS_QUEUE_CAPACITY_EXCEEDED'
const API_ERROR_CODE = 'price_status_queue_capacity_exceeded'
const ISOLATION_SQLSTATE = 'P7502'
const ISOLATION_ERROR_MARKER = 'PRICE_STATUS_QUEUE_REQUIRES_READ_COMMITTED'
const API_ISOLATION_ERROR_CODE = 'price_status_queue_requires_read_committed'

function isPriceStatusQueueError(error) {
  const values = [error?.code, error?.message, error?.details, error?.hint]
  return values.some((value) => (
    value === SQLSTATE
    || value === ISOLATION_SQLSTATE
    || (typeof value === 'string' && value.includes(ERROR_MARKER))
    || (typeof value === 'string' && value.includes(ISOLATION_ERROR_MARKER))
  ))
}

function isPriceStatusQueueCapacityError(error) {
  const values = [error?.code, error?.message, error?.details, error?.hint]
  return values.some((value) => (
    value === SQLSTATE
    || (typeof value === 'string' && value.includes(ERROR_MARKER))
  ))
}

function createPriceStatusQueueErrorPayload(error, { rolledBack } = {}) {
  if (error?.code === ISOLATION_SQLSTATE
    || [error?.message, error?.details, error?.hint].some((value) => (
      typeof value === 'string' && value.includes(ISOLATION_ERROR_MARKER)
    ))) {
    return {
      code: API_ISOLATION_ERROR_CODE,
      error: rolledBack === false
        ? 'No se pudo confirmar la reversión de la operación rechazada por la cola. No repitas la operación; revisa los cambios y contacta al responsable del servicio.'
        : rolledBack === null
          ? 'La transacción no usa READ COMMITTED y el resultado de la operación debe verificarse antes de reintentar.'
          : 'No se guardaron los cambios porque la cola requiere transacciones READ COMMITTED para reservar capacidad de forma segura.',
    }
  }

  if (!isPriceStatusQueueError(error)
    || !(error?.code === SQLSTATE
      || [error?.message, error?.details, error?.hint].some((value) => (
        typeof value === 'string' && value.includes(ERROR_MARKER)
      )))) return null

  return {
    code: API_ERROR_CODE,
    error: rolledBack === false
      ? 'La cola de actualización de precios alcanzó su límite y no se pudo completar la reversión de todos los cambios. No repitas la operación; revisa el catálogo y contacta al responsable del servicio.'
      : rolledBack === null
        ? 'La cola de actualización de precios alcanzó su límite. Esta operación pudo haber aplicado cambios anteriores; revisa el catálogo antes de reintentar.'
      : 'No se guardaron los cambios porque la cola de actualización de precios alcanzó su capacidad máxima. Inténtalo nuevamente más tarde.',
  }
}

function createPriceStatusQueueCapacityErrorPayload(error, options) {
  if (!isPriceStatusQueueCapacityError(error)) return null
  return createPriceStatusQueueErrorPayload(error, options)
}

module.exports = {
  API_ERROR_CODE,
  API_ISOLATION_ERROR_CODE,
  SQLSTATE,
  ISOLATION_SQLSTATE,
  createPriceStatusQueueErrorPayload,
  createPriceStatusQueueCapacityErrorPayload,
  isPriceStatusQueueError,
  isPriceStatusQueueCapacityError,
}
