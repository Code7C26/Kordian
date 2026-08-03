import React from 'react'
import ReactDOM from 'react-dom/client'

<<<<<<< HEAD
import { BrowserRouter, Routes, Route } from 'react-router-dom'

=======
import './index.css'

import { BrowserRouter, Routes, Route } from 'react-router-dom'

>>>>>>> origin/main
import App from './App'
import Admin from './pages/Admin'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
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
  </React.StrictMode>
)