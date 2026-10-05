import React from 'react'
import ReactDOM from 'react-dom/client'

import './index.css'

import { BrowserRouter, Routes, Route } from 'react-router-dom'


import App from './App'
import Admin from './pages/Admin'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { SelectedCityProvider } from './contexts/SelectedCityContext.jsx'
import { CustomerAuthProvider } from './contexts/CustomerAuthContext.jsx'
import CustomerAuthPage from './pages/CustomerAuthPage.jsx'
import CustomerAccountPage from './pages/CustomerAccountPage.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SelectedCityProvider>
      <CustomerAuthProvider>
        <BrowserRouter>
          <Routes>

            {/* HOME */}
            <Route path="/" element={<App />} />
            <Route path="/buscar" element={<App />} />

            {/* CUSTOMER AUTH */}
            <Route path="/ingresar" element={<CustomerAuthPage mode="login" />} />
            <Route path="/registro" element={<CustomerAuthPage mode="register" />} />
            <Route path="/perfil" element={<CustomerAccountPage section="profile" />} />
            <Route path="/mis-alertas" element={<CustomerAccountPage section="alerts" />} />
            <Route path="/panel-gestion" element={<CustomerAccountPage section="business" />} />

            {/* ADMIN */}
            <Route path="/login" element={<Login />} />
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
      </CustomerAuthProvider>
    </SelectedCityProvider>
  </React.StrictMode>
)
