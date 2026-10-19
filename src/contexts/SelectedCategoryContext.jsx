import { createContext, useContext, useState } from 'react'

const SelectedCategoryContext = createContext(null)

export function SelectedCategoryProvider({ children }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)

  return (
    <SelectedCategoryContext.Provider value={{ selectedCategoryId, setSelectedCategoryId }}>
      {children}
    </SelectedCategoryContext.Provider>
  )
}

export function useSelectedCategory() {
  const context = useContext(SelectedCategoryContext)
  if (!context) {
    throw new Error('useSelectedCategory must be used within SelectedCategoryProvider')
  }
  return context
}