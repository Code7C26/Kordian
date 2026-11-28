const branchAddressCache = new Map()

export async function fetchSupermarketLocations(city, storeName, fetchImpl) {
  const normalizedCity = String(city || '').trim()
  const normalizedStoreName = String(storeName || '').trim()
  const cacheKey = `${normalizedCity.toLocaleLowerCase()}:${normalizedStoreName.toLocaleLowerCase()}`
  if (branchAddressCache.has(cacheKey)) {
    return [...branchAddressCache.get(cacheKey)]
  }

  const params = new URLSearchParams({ city: normalizedCity, store: normalizedStoreName })
  const response = await fetchImpl(`/supermarket-locations?${params.toString()}`)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'No se pudieron cargar las direcciones. Intenta nuevamente.')
  }

  const addresses = Array.isArray(payload?.addresses)
    ? payload.addresses.filter((address) => typeof address === 'string' && address.trim())
    : []
  branchAddressCache.set(cacheKey, addresses)
  return [...addresses]
}
