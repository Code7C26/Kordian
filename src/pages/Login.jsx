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

  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-[32px] bg-white dark:bg-stone-900 border border-stone-200/70 dark:border-stone-700/70 shadow-[0_30px_80px_rgba(15,23,42,0.12)] p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-600 to-emerald-500 px-4 py-2 text-white font-black text-sm shadow-lg shadow-sky-500/20">
              <span className="text-lg">ARPrice</span>
              <span className="uppercase text-[10px] tracking-[0.3em] bg-white/15 px-2 py-1 rounded-full text-white">ADMIN</span>
            </div>
            <h1 className="mt-6 text-3xl font-extrabold text-stone-900 dark:text-white">Accede al panel</h1>
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">Inicia sesión para administrar categorías, marcas y precios.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">Usuario</label>
              <input
                type="text"
                placeholder="Usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-sky-400 dark:focus:ring-sky-900/30"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">Contraseña</label>
              <input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-sky-400 dark:focus:ring-sky-900/30"
              />
            </div>

            {error && (
              <p className="text-sm font-semibold text-rose-600">{error}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-500"
            >
              Ingresar
            </button>

          </form>

          <div className="mt-6 rounded-3xl bg-sky-50 p-4 text-sm text-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
            <p className="font-medium">Usuario por defecto:</p>
            <p className="mt-1 font-semibold">admin / 1234</p>
          </div>
        </div>
      </div>
    </div>
  )
}
