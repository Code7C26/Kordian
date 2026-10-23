import { createContext, useContext, useState } from 'react'
import { CITIES_LIST } from '../data/mockProducts.js'
import { useCustomerAuth } from './CustomerAuthContext.jsx'

const SelectedCityContext = createContext(null)
const GUEST_SELECTED_CITY_KEY = 'arprice_selected_city'
const ACCOUNT_SELECTED_CITY_PREFIX = 'arprice_selected_city:'

function getSelectedCityKey(userId) {
  return userId
    ? `${ACCOUNT_SELECTED_CITY_PREFIX}${userId}`
    : GUEST_SELECTED_CITY_KEY
}

function readSelectedCity(key) {
  const storedCity = localStorage.getItem(key)
  return CITIES_LIST.find((city) => city.toLowerCase() === storedCity?.trim().toLowerCase()) || CITIES_LIST[0] || 'Alta Gracia'
}

export function SelectedCityProvider({ children }) {
  const { user } = useCustomerAuth()
  const selectedCityKey = getSelectedCityKey(user?.id)
  const [selection, setSelection] = useState(() => ({
    key: selectedCityKey,
    city: readSelectedCity(selectedCityKey),
  }))
  const selectedCity = selection.key === selectedCityKey
    ? selection.city
    : readSelectedCity(selectedCityKey)

  const setSelectedCity = (city) => {
    const availableCity = CITIES_LIST.find((availableCity) => availableCity.toLowerCase() === String(city || '').trim().toLowerCase())
    if (!availableCity) return
    localStorage.setItem(selectedCityKey, availableCity)
    setSelection({ key: selectedCityKey, city: availableCity })
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
