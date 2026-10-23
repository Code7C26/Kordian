export async function fetchAnalysisProducts(url, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { signal })
  if (!response.ok) {
    throw new Error(`Price analysis request failed with status ${response.status}`)
  }
  const results = await response.json()
  if (!Array.isArray(results)) {
    throw new TypeError('Price analysis response must be an array')
  }
  return results
}
