const assert = require('node:assert/strict')
const test = require('node:test')
const { getExistingCarrefourOfferConflict } = require('./carrefourReviewedImport')

const item = {
  sourceProductId: '680457',
  sourceSku: '52798',
  sourceUrl: 'https://www.carrefour.com.ar/leche/p',
  price: 1800,
  listPrice: 2200,
}

function offer(overrides = {}) {
  return {
    supermarket: 'Carrefour',
    cash_price: 1800,
    list_price: 2200,
    source_product_id: '680457',
    source_sku: '52798',
    source_url: 'https://www.carrefour.com.ar/leche/p',
    ...overrides,
  }
}

test('allows an exactly unchanged Carrefour offer in a reviewed import', () => {
  assert.equal(getExistingCarrefourOfferConflict(item, { offers: [offer()] }), null)
})

test('does not overwrite an existing Carrefour price during a reviewed import', () => {
  assert.match(
    getExistingCarrefourOfferConflict(item, { offers: [offer({ cash_price: 1900 })] }),
    /no se actualizará automáticamente/,
  )
})

test('does not overwrite an existing Carrefour identity during a reviewed import', () => {
  assert.match(
    getExistingCarrefourOfferConflict(item, { offers: [offer({ source_product_id: 'other-id' })] }),
    /no se actualizará automáticamente/,
  )
})

test('sends products with duplicate Carrefour offers to manual review', () => {
  assert.match(
    getExistingCarrefourOfferConflict(item, { offers: [offer(), offer()] }),
    /varias ofertas Carrefour/,
  )
})

test('allows adding the first Carrefour offer to a local product', () => {
  assert.equal(getExistingCarrefourOfferConflict(item, { offers: [] }), null)
})
