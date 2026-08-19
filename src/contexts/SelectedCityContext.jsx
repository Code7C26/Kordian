import { createContext, useContext, useState } from 'react'

const SelectedCityContext = createContext(null)

export function SelectedCityProvider({ children }) {
  const [selectedCity, setSelectedCity] = useState('Alta Gracia')

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
