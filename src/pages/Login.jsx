import { useState } from 'react'

import { useNavigate } from 'react-router-dom'

export default function Login() {
  const navigate = useNavigate()

  const [username, setUsername] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [error, setError] =
    useState('')

  const handleLogin = (e) => {
    e.preventDefault()
<<<<<<< HEAD

    // =========================
    // ADMINS GUARDADOS
    // =========================

    const admins =
      JSON.parse(
        localStorage.getItem(
          'admins'
        )
      ) || [
        {
          username: 'admin',
          password: '1234',
        },
      ]

    // =========================
    // VALIDAR LOGIN
    // =========================

    const validAdmin =
      admins.find(
        (admin) =>
          admin.username ===
            username &&
          admin.password ===
            password
      )

    if (validAdmin) {
      localStorage.setItem(
        'adminAuth',
        'true'
      )

      localStorage.setItem(
        'currentAdmin',
        username
      )

      navigate('/admin')
    } else {
      setError(
        'Usuario o contraseña incorrectos'
      )
    }
=======
    ;(async () => {
      try {
        const res = await fetch('http://localhost:3000/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })

        if (res.ok) {
          localStorage.setItem('adminAuth', 'true')
          localStorage.setItem('currentAdmin', username)
          navigate('/admin')
        } else if (res.status === 401) {
          setError('Usuario o contraseña incorrectos')
        } else {
          setError('Error al autenticar')
        }
      } catch (err) {
        console.error(err)
        setError('Error de red')
      }
    })()
>>>>>>> origin/main
  }

  return (
    <div
      style={{
        minHeight: '100vh',

        display: 'flex',

        justifyContent:
          'center',

        alignItems: 'center',

        backgroundColor:
          '#F3F4F6',
      }}
    >
      <form
        onSubmit={handleLogin}
        style={{
          backgroundColor:
            'white',

          padding: '40px',

          borderRadius: '20px',

          width: '400px',

          boxShadow:
            '0 4px 20px rgba(0,0,0,0.08)',
        }}
      >
        <h1
          style={{
            marginBottom: '30px',

            color: '#2563EB',

            fontSize: '36px',

            fontWeight: '800',
          }}
        >
          Admin Login
        </h1>

        {/* USERNAME */}

        <input
          type="text"
          placeholder="Usuario"
          value={username}
          onChange={(e) =>
            setUsername(
              e.target.value
            )
          }
          style={inputStyle}
        />

        {/* PASSWORD */}

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) =>
            setPassword(
              e.target.value
            )
          }
          style={{
            ...inputStyle,

            marginTop: '20px',
          }}
        />

        {/* ERROR */}

        {error && (
          <p
            style={{
              color: '#DC2626',

              marginTop: '15px',

              fontWeight: '600',
            }}
          >
            {error}
          </p>
        )}

        {/* BUTTON */}

        <button
          type="submit"
          style={{
            width: '100%',

            marginTop: '25px',

            padding: '14px',

            border: 'none',

            borderRadius: '12px',

            backgroundColor:
              '#2563EB',

            color: 'white',

            fontWeight: '700',

            fontSize: '16px',

            cursor: 'pointer',
          }}
        >
          Ingresar
        </button>

        {/* INFO */}

        <div
          style={{
            marginTop: '25px',

            padding: '15px',

            backgroundColor:
              '#EFF6FF',

            borderRadius: '12px',
          }}
        >
          <p
            style={{
              color: '#1D4ED8',

              fontSize: '14px',
            }}
          >
            Usuario por defecto:
          </p>

          <strong>
            admin / 1234
          </strong>
        </div>
      </form>
    </div>
  )
}

const inputStyle = {
  width: '100%',

  padding: '14px',

  borderRadius: '12px',

  border: '1px solid #D1D5DB',

  fontSize: '15px',

  outline: 'none',

  boxSizing: 'border-box',
}