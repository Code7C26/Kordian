function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const USER_PROVIDED_LOCATIONS = {
  'alta gracia': {
    becerra: [
      'Av. Belgrano 466',
      'Sarmiento 489',
      'Lucas V. Córdoba 982',
      'Av. Libertador 1740',
      'Agustín Aguirre 364',
      'Liniers Sur',
      'Av. Libertador & Ituzaingó',
      'Concejal José Alonso 770',
    ],
    carrefour: ['Av. Belgrano 140', 'Prudencio Bustos 122'],
    disco: [
      'Av. Raúl Alfonsín 650',
      'Ruta Provincial 5 esq. Reconquista',
    ],
    mami: ['Gabino Ezeiza 1081, RP5, Km 29'],
  },
}

function getUserProvidedSupermarketLocations(city, storeName) {
  const cityLocations = USER_PROVIDED_LOCATIONS[normalizeText(city)]
  if (!cityLocations) return []

  const normalizedStoreName = normalizeText(storeName)
  const matchingBrand = Object.keys(cityLocations)
    .find((brand) => normalizedStoreName.includes(brand))

  return matchingBrand ? [...cityLocations[matchingBrand]] : []
}

module.exports = { getUserProvidedSupermarketLocations }
