import { createContext, useContext, useState } from 'react'

const SelectedCityContext = createContext(null)
const SELECTED_CITY_KEY = 'arprice_selected_city'

function readSelectedCity() {
  return localStorage.getItem(SELECTED_CITY_KEY) || 'Alta Gracia'
}

export function SelectedCityProvider({ children }) {
  const [selectedCity, setSelectedCityState] = useState(readSelectedCity)

  const setSelectedCity = (city) => {
    const normalizedCity = String(city || '').trim()
    if (!normalizedCity) return
    localStorage.setItem(SELECTED_CITY_KEY, normalizedCity)
    setSelectedCityState(normalizedCity)
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
