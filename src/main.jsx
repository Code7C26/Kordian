import React from 'react'
import ReactDOM from 'react-dom/client'

import './index.css'

import { BrowserRouter, Routes, Route } from 'react-router-dom'


import App from './App'
import Admin from './pages/Admin'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import { SelectedCityProvider } from './contexts/SelectedCityContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SelectedCityProvider>
      <BrowserRouter>
        <Routes>

        {/* HOME */}
        <Route path="/" element={<App />} />

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