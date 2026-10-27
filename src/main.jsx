
import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'

import './index.css'

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'

import ProtectedRoute from './components/ProtectedRoute'
import { SelectedCityProvider } from './contexts/SelectedCityContext.jsx'
import { CustomerAuthProvider } from './contexts/CustomerAuthContext.jsx'
import { LanguageProvider } from './contexts/LanguageContext.jsx'

const App = lazy(() => import('./App.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const FavoritesPage = lazy(() => import('./pages/FavoritesPage.jsx'))
const CustomerAuthPage = lazy(() => import('./pages/CustomerAuthPage.jsx'))
const CustomerAccountPage = lazy(() => import('./pages/CustomerAccountPage.jsx'))
const FaqPage = lazy(() => import('./pages/FaqPage.jsx'))
const SharedListsPage = lazy(() => import('./pages/SharedListsPage.jsx'))
const PriceInflationPage = lazy(() => import('./pages/PriceInflationPage.jsx'))
const CouponsPage = lazy(() => import('./pages/CouponsPage.jsx'))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'))
const PasswordRecoveryPage = lazy(() => import('./pages/PasswordRecoveryPage.jsx'))

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
            <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-stone-50 text-sm font-semibold text-stone-500 dark:bg-stone-950 dark:text-stone-300" role="status">Cargando…</main>}>
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
            </Suspense>
          </BrowserRouter>
        </SelectedCityProvider>
      </CustomerAuthProvider>
    </LanguageProvider>
  </React.StrictMode>
)
