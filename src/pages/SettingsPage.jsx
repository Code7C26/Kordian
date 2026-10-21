import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BriefcaseBusiness, MapPin, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react'
import { useSelectedCity } from '../contexts/SelectedCityContext.jsx'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { CITIES_LIST } from '../data/mockProducts.js'

export default function SettingsPage() {
  const { selectedCity, setSelectedCity } = useSelectedCity()
  const { loading: authLoading, profile, user } = useCustomerAuth()
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('arprice_theme') === 'dark')
  const [city, setCity] = useState(selectedCity)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('arprice_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const saveCity = (event) => {
    event.preventDefault()
    const normalizedCity = city.trim()
    if (!normalizedCity) return
    setSelectedCity(normalizedCity)
    setCity(normalizedCity)
    setSaved(true)
  }

  return (
    <main className="min-h-screen bg-stone-100 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-stone-300 pb-4 dark:border-stone-800">
          <Link to="/" className="text-lg font-black text-sky-800 dark:text-sky-300">AR-Price</Link>
        </header>

        <section className="py-8">
          <Link to="/buscar" className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a productos
          </Link>
          <h1 className="mt-6 text-2xl font-black">Configuración</h1>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Personaliza tus preferencias de Ar-Price.</p>

          <div className="mt-7 divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            <section className="flex items-center justify-between gap-4 py-5">
              <div className="flex items-center gap-3">
                {darkMode
                  ? <Moon className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  : <Sun className="h-5 w-5 text-amber-500" aria-hidden="true" />}
                <div>
                  <h2 className="text-sm font-bold">Apariencia</h2>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{darkMode ? 'Modo oscuro' : 'Modo claro'}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={darkMode}
                onClick={() => setDarkMode((current) => !current)}
                className={`relative h-6 w-11 rounded-full transition-colors ${darkMode ? 'bg-sky-600' : 'bg-stone-300 dark:bg-stone-700'}`}
              >
                <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
                <span className="sr-only">Activar modo oscuro</span>
              </button>
            </section>

            <section className="py-5">
              <div className="mb-3 flex items-center gap-3">
                <MapPin className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-bold">Ubicación</h2>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Ubicación guardada: {selectedCity}</p>
                </div>
              </div>
              <form onSubmit={saveCity} className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label="Ciudad"
                  list="settings-cities"
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value)
                    setSaved(false)
                  }}
                  maxLength={80}
                  required
                  placeholder="Escribe tu ciudad"
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-stone-700 dark:bg-stone-900 dark:focus:ring-sky-900"
                />
                <datalist id="settings-cities">
                  {CITIES_LIST.map((availableCity) => <option key={availableCity} value={availableCity} />)}
                </datalist>
                <button type="submit" className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800">
                  Guardar ubicación
                </button>
              </form>
              {saved && <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400" role="status">Ubicación guardada.</p>}
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">El catálogo todavía no filtra productos por ubicación.</p>
            </section>

            {!authLoading && user && (
              <section className="py-5">
                <Link
                  to="/mi-cuenta"
                  className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-white dark:hover:bg-stone-900"
                >
                  <UserRound className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-bold">Mi cuenta</span>
                    <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">Consulta los datos de tu cuenta.</span>
                  </span>
                </Link>
              </section>
            )}

            {!authLoading && profile?.role === 'business' && (
              <section className="py-5">
                <Link
                  to="/panel-gestion"
                  className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-white dark:hover:bg-stone-900"
                >
                  <BriefcaseBusiness className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-bold">Panel de gestión para comercio</span>
                    <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">Administra el catálogo de tu comercio.</span>
                  </span>
                </Link>
              </section>
            )}

            {!authLoading && profile?.role === 'administrator' && (
              <section className="py-5">
                <Link
                  to="/admin"
                  className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-white dark:hover:bg-stone-900"
                >
                  <ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-bold">Panel de administrador</span>
                    <span className="mt-1 block text-xs text-stone-500 dark:text-stone-400">Accede a las herramientas de administración.</span>
                  </span>
                </Link>
              </section>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
