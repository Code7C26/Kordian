
import React from 'react'
import ReactDOM from 'react-dom/client'

import './index.css'

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'

import App from './App'
import Admin from './pages/Admin'
import Login from './pages/Login'
import FavoritesPage from './pages/FavoritesPage'
import ProtectedRoute from './components/ProtectedRoute'
import { SelectedCityProvider } from './contexts/SelectedCityContext.jsx'
import { CustomerAuthProvider } from './contexts/CustomerAuthContext.jsx'
import CustomerAuthPage from './pages/CustomerAuthPage.jsx'
import CustomerAccountPage from './pages/CustomerAccountPage.jsx'
import FaqPage from './pages/FaqPage.jsx'
import SharedListsPage from './pages/SharedListsPage.jsx'
import PriceInflationPage from './pages/PriceInflationPage.jsx'
import CouponsPage from './pages/CouponsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import PasswordRecoveryPage from './pages/PasswordRecoveryPage.jsx'
import { LanguageProvider } from './contexts/LanguageContext.jsx'

function HomeRoute() {
  const location = useLocation()
  const hashParams = new URLSearchParams(location.hash.slice(1))
  if (hashParams.get('type') === 'recovery' && hashParams.has('access_token')) {
    return <Navigate to={`/restablecer-contrasena${location.hash}`} replace />
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <CustomerAuthProvider>
        <SelectedCityProvider>
          <BrowserRouter>
            <Routes>
            {/* HOME */}
            <Route path="/" element={<HomeRoute />} />
            <Route path="/buscar" element={<App />} />
            <Route path="/favoritos" element={<FavoritesPage />} />
            <Route path="/ingresar" element={<CustomerAuthPage mode="login" />} />
            <Route path="/registro" element={<CustomerAuthPage mode="register" />} />
            <Route path="/restablecer-contrasena" element={<PasswordRecoveryPage />} />
            <Route path="/mi-cuenta" element={<CustomerAccountPage section="profile" />} />
            <Route path="/perfil" element={<CustomerAccountPage section="profile" />} />
            <Route path="/mis-alertas" element={<CustomerAccountPage section="alerts" />} />
            <Route path="/panel-gestion" element={<CustomerAccountPage section="business" />} />
            <Route path="/listas-compartidas" element={<SharedListsPage />} />
            <Route path="/calculadora" element={<PriceInflationPage />} />
            <Route path="/cupones" element={<CouponsPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/configuracion" element={<SettingsPage />} />

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
      </CustomerAuthProvider>
    </LanguageProvider>
  </React.StrictMode>
)
