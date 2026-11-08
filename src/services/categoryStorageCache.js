const CATEGORY_CACHE_PREFIX = 'arprice_categories_cache:'

function getStorageKey(url) {
  return `${CATEGORY_CACHE_PREFIX}${url}`
}

export function readStoredCategories(url) {
  try {
    const stored = localStorage.getItem(getStorageKey(url))
    if (!stored) return []

    const categories = JSON.parse(stored)
    return Array.isArray(categories) ? categories : []
  } catch {
    return []
  }
}

export function storeCategories(url, categories) {
  if (!Array.isArray(categories)) return

  try {
    localStorage.setItem(getStorageKey(url), JSON.stringify(categories))
  } catch (error) {
    console.warn('Category cache could not be saved', error)
  }
}
