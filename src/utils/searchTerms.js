export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function getSearchTerms(query) {
  return normalizeSearchText(query).trim().split(/\s+/).filter(Boolean)
}

export function matchesSearchTerms(values, query) {
  const terms = getSearchTerms(query)
  if (!terms.length) return true

  const searchableText = (Array.isArray(values) ? values : [values])
    .map(normalizeSearchText)
    .join(' ')

  return terms.every((term) => searchableText.includes(term))
}

export function getSearchRelevance(values, query) {
  const normalizedQuery = normalizeSearchText(query).trim()
  const terms = getSearchTerms(query)
  const searchableText = (Array.isArray(values) ? values : [values])
    .map(normalizeSearchText)
    .join(' ')
  const primaryText = normalizeSearchText(Array.isArray(values) ? values[0] : values)

  if (!normalizedQuery || !terms.length) return 0
  if (searchableText === normalizedQuery) return 0
  if (searchableText.startsWith(normalizedQuery)) return 1
  if (terms.every((term) => primaryText.includes(term))) return 2
  return 3
}
