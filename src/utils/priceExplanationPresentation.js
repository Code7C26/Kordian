export function formatOptionalNumber(value, decimals = 1) {
  if (value === null || value === undefined || value === '') return 'No disponible'
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(decimals) : 'No disponible'
}

export function formatOptionalPercentage(value) {
  const formatted = formatOptionalNumber(value)
  return formatted === 'No disponible' ? formatted : `${formatted}%`
}

export function getAnalysisLoadMessage(product, loadState) {
  if (product?.analysis) return null
  if (loadState === 'loading') return 'Cargando análisis de precios…'
  if (loadState === 'error') return 'No se pudo cargar el análisis de precios. Intenta nuevamente más tarde.'
  return 'No hay un análisis disponible para este producto.'
}

export function resolveSelectedAnalysisProduct(selectedProduct, products) {
  if (!selectedProduct) return null
  const hydratedProduct = (products || []).find(
    (product) => String(product.id) === String(selectedProduct.id),
  )
  if (!hydratedProduct?.analysis) return selectedProduct
  return {
    ...selectedProduct,
    analysis: hydratedProduct.analysis,
    status: hydratedProduct.status,
    priceHistory: hydratedProduct.priceHistory,
  }
}
