import React from 'react'
import ReactDOM from 'react-dom/client'

import './index.css'

import { BrowserRouter, Routes, Route } from 'react-router-dom'


import App from './App'
import Admin from './pages/Admin'
import Login from './pages/Login'
import FavoritesPage from './pages/FavoritesPage'
import ProtectedRoute from './components/ProtectedRoute'
import { SelectedCityProvider } from './contexts/SelectedCityContext.jsx'
import { CustomerAuthProvider } from './contexts/CustomerAuthContext.jsx'
import CustomerAuthPage from './pages/CustomerAuthPage.jsx'
import CustomerAccountPage from './pages/CustomerAccountPage.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SelectedCityProvider>
      <BrowserRouter>
        <Routes>

        {/* HOME */}
        <Route path="/" element={<App />} />
        <Route path="/seleccionar-categorias" element={<App />} />
        <Route path="/buscar" element={<App />} />
        <Route path="/favoritos" element={<FavoritesPage />} />

        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* ADMIN PROTEGIDO */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />

      </Routes>
      </BrowserRouter>
    </SelectedCityProvider>
  </React.StrictMode>
)
