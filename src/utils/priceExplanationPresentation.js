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
  if (product?.priceStatusPending || loadState === 'stale') {
    return 'El análisis está pendiente porque los datos del producto cambiaron. No mostramos un diagnóstico hasta validar la información actual.'
  }
  if (loadState === 'loading') return 'Cargando análisis de precios…'
  if (loadState === 'error') return 'No se pudo cargar el análisis de precios. Intenta nuevamente más tarde.'
  if (product?.analysis) return null
  return 'No hay un análisis disponible para este producto.'
}

export function resolveSelectedAnalysisProduct(selectedProduct, products) {
  if (!selectedProduct) return null
  const hydratedProduct = (products || []).find(
    (product) => String(product.id) === String(selectedProduct.id),
  )
  if (!hydratedProduct) return selectedProduct
  if (hydratedProduct.priceStatusPending) {
    return {
      ...selectedProduct,
      priceStatusPending: true,
      status: hydratedProduct.status,
      analysis: null,
      priceHistory: [],
    }
  }
  return {
    ...selectedProduct,
    priceStatusPending: false,
    analysis: hydratedProduct.analysis || null,
    status: hydratedProduct.status,
    priceHistory: hydratedProduct.analysis?.priceHistory || hydratedProduct.priceHistory || [],
  }
}
