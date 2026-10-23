import { createContext, useContext, useState } from 'react'
import { CITIES_LIST } from '../data/mockProducts.js'

const SelectedCityContext = createContext(null)
const SELECTED_CITY_KEY = 'arprice_selected_city'

function readSelectedCity() {
  const storedCity = localStorage.getItem(SELECTED_CITY_KEY)
  return CITIES_LIST.find((city) => city.toLowerCase() === storedCity?.trim().toLowerCase()) || CITIES_LIST[0] || 'Alta Gracia'
}

export function SelectedCityProvider({ children }) {
  const [selectedCity, setSelectedCityState] = useState(readSelectedCity)

  const setSelectedCity = (city) => {
    const availableCity = CITIES_LIST.find((availableCity) => availableCity.toLowerCase() === String(city || '').trim().toLowerCase())
    if (!availableCity) return
    localStorage.setItem(SELECTED_CITY_KEY, availableCity)
    setSelectedCityState(availableCity)
  }

  return (
    <SelectedCityContext.Provider value={{ selectedCity, setSelectedCity }}>
      {children}
    </SelectedCityContext.Provider>
  )
}

export function useSelectedCity() {
  const context = useContext(SelectedCityContext)
  if (!context) {
    throw new Error('useSelectedCity must be used within SelectedCityProvider')
  }
  return context
}
