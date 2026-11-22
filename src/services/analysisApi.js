export async function fetchProductAnalysis(url, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { signal })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Price analysis request failed with status ${response.status}`)
  }
  const result = await response.json()
  if (result === null) return null
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError('Price analysis response must be an object or null')
  }
  return result
}

export async function fetchProductAnalyses(url, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { signal })
  if (!response.ok) {
    throw new Error(`Price analysis batch request failed with status ${response.status}`)
  }
  const results = await response.json()
  if (!Array.isArray(results) || results.some((result) => (
    !result
    || typeof result !== 'object'
    || Array.isArray(result)
    || result.product?.id === null
    || result.product?.id === undefined
  ))) {
    throw new TypeError('Price analysis batch response must be an array of product analyses')
  }
  return results
}
