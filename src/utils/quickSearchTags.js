export const QUICK_SEARCH_TAGS = [
  'Chocolate',
  'Licor',
  'Smart TV',
  'Cocina',
  'Desodorante',
  'Zapatillas',
  'Yerba mate',
  'Café',
  'Aceite',
  'Gaseosa',
  'Heladera',
  'Celular',
  'Auriculares',
  'Microondas',
  'Shampoo',
  'Detergente',
  'Arroz',
  'Fideos',
  'Leche',
  'Queso',
  'Perfume',
  'Pañales',
  'Remera',
  'Zapatillas deportivas',
]

const LAST_VISIT_TAGS_KEY = 'arprice_popular_search_tags'

export function getRandomQuickSearchTags(random = Math.random, count = 6, previousTags = []) {
  const shuffled = [...QUICK_SEARCH_TAGS]

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const currentTag = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = currentTag
  }

  const selectedTags = shuffled.slice(0, Math.min(count, shuffled.length))
  const selectedTagSet = new Set(selectedTags)
  const previousTagSet = new Set(Array.isArray(previousTags) ? previousTags : [])
  const isSameSelection = selectedTagSet.size === previousTagSet.size
    && selectedTags.every((tag) => previousTagSet.has(tag))

  if (isSameSelection && selectedTags.length && selectedTags.length < shuffled.length) {
    selectedTags[selectedTags.length - 1] = shuffled[selectedTags.length]
  }

  return selectedTags
}

export function getPopularSearchTagsForVisit(storage = globalThis.localStorage, random = Math.random) {
  let previousTags = []
  try {
    const storedTags = storage.getItem(LAST_VISIT_TAGS_KEY)
    if (storedTags) {
      const parsedTags = JSON.parse(storedTags)
      if (Array.isArray(parsedTags)) previousTags = parsedTags
    }
  } catch (error) {
    console.warn('Previous popular searches could not be loaded', error)
  }

  const tags = getRandomQuickSearchTags(random, 6, previousTags)
  try {
    storage.setItem(LAST_VISIT_TAGS_KEY, JSON.stringify(tags))
  } catch (error) {
    console.warn('Popular searches could not be saved', error)
  }
  return tags
}
