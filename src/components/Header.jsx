import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  CircleHelp,
  Menu,
  MapPin, 
  Sun, 
  Moon, 
  ShoppingBag, 
  Heart, 
  ListFilter,
  LogIn,
  LogOut,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { adminFetch, apiFetch } from '../config/api.js';
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx';
import brandLogo from '../../assents/Ar-Price/Logo_final.svg';
import brandLogoDark from '../../assents/Ar-Price/Logo_final_Negativo.svg';

export function Header({
  darkMode,
  setDarkMode,
  selectedCity,
  basketCount,
  onOpenBasket,
  onOpenFavorites,
  onResetView,
  categories = [],
  selectedCategory,
  onSelectCategory,
  isAdminPage = false,
}) {
  const location = useLocation()
  const { user, profile, signOut } = useCustomerAuth()
  const isAdminHeader = isAdminPage || location.pathname === '/admin'
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showCategoryMenu, setShowCategoryMenu] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const accountMenuRef = useRef(null)
  const [panelCategories, setPanelCategories] = useState([])
  const [panelBrands, setPanelBrands] = useState([])
  const [panelSupermarkets, setPanelSupermarkets] = useState([])
  const [panelCategoryId, setPanelCategoryId] = useState('')
  const [panelBrandId, setPanelBrandId] = useState('')
  const [panelSupermarket, setPanelSupermarket] = useState('')
  const [panelPercentage, setPanelPercentage] = useState(5)
  const [panelUpdatedAt, setPanelUpdatedAt] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    // load categories and brands for the floating panel
    ;(async () => {
      try {
        const cRes = await apiFetch('/categories')
        const cats = await cRes.json()
        setPanelCategories(cats.value || cats)
      } catch {
        // ignore
      }
      try {
        const bRes = await apiFetch('/brands')
        const bs = await bRes.json()
        setPanelBrands(bs.value || bs)
      } catch {
        // ignore
      }
      try {
        const sRes = await apiFetch('/supermarkets')
        const supermarkets = await sRes.json()
        setPanelSupermarkets(supermarkets)
      } catch {
        // ignore
      }
    })()
  }, [])

  useEffect(() => {
    if (!showAccountMenu) return undefined

    const closeOnOutsideClick = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setShowAccountMenu(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowAccountMenu(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showAccountMenu])
  return (
    <header className="sticky top-0 z-40 w-full border-b border-sky-400/30 dark:border-stone-800 bg-sky-600 dark:bg-stone-900/90 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 md:h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onResetView}
            className="flex items-center gap-2.5 group text-left focus:outline-none cursor-pointer"
            title="Ir al inicio de ARPrice"
          >
            <div className="relative flex items-center gap-3">
              <div className="relative rounded-xl p-1.5 bg-white dark:bg-black shadow-[0_6px_16px_rgba(14,116,144,0.18)] ring-1 ring-sky-300/40 dark:ring-sky-700/60 backdrop-blur-sm">
                <img
                  src={darkMode ? brandLogoDark : brandLogo}
                  alt="ARPrice"
                  className="h-8 md:h-10 w-auto object-contain drop-shadow-[0_6px_10px_rgba(37,99,235,0.25)] transition-transform duration-200 group-hover:scale-[1.03] filter drop-shadow-lg"
                  style={{
                    filter: 'drop-shadow(0 4px 8px rgba(14, 116, 144, 0.2)) drop-shadow(0 0 1px rgba(37, 99, 235, 0.1))'
                  }}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg sm:text-xl font-black tracking-tight" style={{ fontFamily: 'sans-serif' }}>
                    <span className="text-black dark:text-white">AR</span>
                    <span className="text-black dark:text-white">-</span>
                    <span className="text-white dark:text-sky-400">PRICE</span>
                  </span>
                </div>
                <p className="hidden md:block text-[11px] font-semibold italic text-white/80 dark:text-white leading-tight tracking-wide">
                  Ahorrar no es suerte, es información
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white dark:text-stone-200 bg-white/20 dark:bg-stone-900/40 rounded-xl border border-white/30 dark:border-stone-700/40">
          <MapPin className="w-4 h-4 text-white dark:text-sky-400 shrink-0" />
          <span className="max-w-[120px] sm:max-w-[180px] truncate">{selectedCity}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isAdminHeader && (
            <>
              <button
                onClick={() => setShowCategoryMenu((open) => !open)}
                className="relative flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold text-white hover:bg-white/25 dark:bg-stone-800/60 dark:text-stone-200 transition-colors cursor-pointer"
                title="Seleccionar categoría para comparar precios"
                aria-expanded={showCategoryMenu}
              >
                <ListFilter className="w-4 h-4" />
                <span className="hidden sm:inline">Categorías</span>
              </button>

              <button
                onClick={onOpenFavorites}
                className="relative p-2 rounded-lg text-white dark:text-stone-300 hover:text-rose-200 dark:hover:text-rose-400 hover:bg-white/20 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                title="Ver Favoritos"
              >
                <Heart className="w-5 h-5" />
              </button>

              <button
                onClick={onOpenBasket}
                className="relative flex items-center gap-2 px-4 py-2 bg-white text-sky-600 rounded-2xl text-sm font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer dark:bg-gradient-to-r dark:from-indigo-600 dark:via-sky-600 dark:to-emerald-500 dark:text-white"
                title="Canasta Ahorro"
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden md:inline">Canasta</span>
                {basketCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-sky-600 text-white text-xs font-black rounded-full min-w-[20px] text-center dark:bg-white dark:text-indigo-700">
                    {basketCount}
                  </span>
                )}
              </button>

              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowAccountMenu((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={showAccountMenu}
                  aria-label="Abrir menú"
                  title="Menú"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 dark:bg-stone-800/60 dark:text-stone-200"
                >
                  <Menu className="h-6 w-6" aria-hidden="true" />
                </button>
                {showAccountMenu && (
                  <div
                    role="menu"
                    aria-label="Menú principal"
                    className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-stone-200 bg-white p-2 text-stone-800 shadow-xl dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
                  >
                    {user ? (
                      <>
                        <Link role="menuitem" to="/perfil" onClick={() => setShowAccountMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">
                          <UserRound className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> Perfil
                        </Link>
                        <Link role="menuitem" to="/mis-alertas" onClick={() => setShowAccountMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">
                          <Heart className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> Mis alertas
                        </Link>
                        {profile?.role === 'business' && (
                          <Link role="menuitem" to="/panel-gestion" onClick={() => setShowAccountMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">
                            <ShoppingBag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Panel de gestión
                          </Link>
                        )}
                        <button role="menuitem" type="button" onClick={() => { setShowAccountMenu(false); signOut() }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">
                          <LogOut className="h-4 w-4 text-stone-500" aria-hidden="true" /> Cerrar sesión
                        </button>
                      </>
                    ) : (
                      <>
                        <Link role="menuitem" to="/ingresar" onClick={() => setShowAccountMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">
                          <LogIn className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> Iniciar sesión
                        </Link>
                        <Link role="menuitem" to="/registro" onClick={() => setShowAccountMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">
                          <UserPlus className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> Registrarse
                        </Link>
                      </>
                    )}
                    <div className="my-1 border-t border-stone-200 dark:border-stone-700" />
                    <Link role="menuitem" to="/faq" onClick={() => setShowAccountMenu(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">
                      <CircleHelp className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> FAQ
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Admin action button in header */}
          {isAdminHeader && (
            <button
              onClick={() => setShowAdminPanel(true)}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold bg-yellow-500 text-black rounded-2xl hover:brightness-90 transition-all duration-150 ml-2"
              title="Abrir panel rápido de actualización de precios"
            >
              Actualizar Precios
            </button>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-white dark:text-stone-300 hover:bg-white/20 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-amber-300" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
        </div>

      </div>

      {!isAdminHeader && showCategoryMenu && (
        <div className="fixed right-4 top-24 z-50 w-[min(22rem,calc(100vw-2rem))] max-h-[65vh] overflow-auto rounded-2xl border border-sky-200 bg-white p-3 text-stone-900 shadow-2xl dark:border-stone-700 dark:bg-stone-800 dark:text-white">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">Comparar precios</p>
              <h2 className="text-base font-black">Selecciona una categoría</h2>
            </div>
            <button onClick={() => setShowCategoryMenu(false)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700" aria-label="Cerrar menú de categorías">Cerrar</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setShowCategoryMenu(false)
                onSelectCategory('todos')
              }}
              className={`rounded-xl border p-3 text-left transition-colors ${selectedCategory === 'todos' ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-200 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-700 dark:hover:border-sky-700 dark:hover:bg-sky-950/40'}`}
            >
              <span className="block text-sm font-black">Todos los productos</span>
              <span className={`mt-1 block text-xs ${selectedCategory === 'todos' ? 'text-sky-100' : 'text-stone-500 dark:text-stone-400'}`}>Comparar todo el catálogo</span>
            </button>
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => {
                  setShowCategoryMenu(false)
                  onSelectCategory(category.id)
                }}
                className={`rounded-xl border p-3 text-left transition-colors ${selectedCategory === category.id ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-200 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-700 dark:hover:border-sky-700 dark:hover:bg-sky-950/40'}`}
              >
                <span className="block text-sm font-black">{category.name}</span>
                <span className={`mt-1 block text-xs ${selectedCategory === category.id ? 'text-sky-100' : 'text-stone-500 dark:text-stone-400'}`}>{category.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating admin quick panel */}
      {isAdminHeader && showAdminPanel && (
        <div className="fixed right-4 top-4 z-50 w-72 max-h-[60vh] overflow-auto bg-white dark:bg-stone-800 border rounded-xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <strong>Actualizar precios (rápido)</strong>
            <button onClick={() => setShowAdminPanel(false)} className="text-sm text-stone-500">Cerrar</button>
          </div>
          <div className="space-y-2 text-sm">
            <label className="block">Filtros de actualización</label>
            <select value={panelCategoryId} onChange={(e) => setPanelCategoryId(e.target.value)} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900">
              <option value="">Todas las categorías</option>
              {panelCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select value={panelBrandId} onChange={(e) => setPanelBrandId(e.target.value)} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900">
              <option value="">Todas las marcas</option>
              {panelBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <select value={panelSupermarket} onChange={(e) => setPanelSupermarket(e.target.value)} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900">
              <option value="">Todos los supermercados</option>
              {panelSupermarkets.map((supermarket) => <option key={supermarket.id} value={supermarket.name}>{supermarket.name}</option>)}
            </select>

            <label className="block">Fecha de actualización</label>
            <input type="date" value={panelUpdatedAt} onChange={(e) => setPanelUpdatedAt(e.target.value)} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900" />

            <input type="number" value={panelPercentage} onChange={(e) => setPanelPercentage(Number(e.target.value))} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900" />

            <div className="flex gap-2">
              <button onClick={async () => {
                if (!panelCategoryId && !panelBrandId && !panelSupermarket) { alert('Elige al menos un filtro'); return }
                try {
                  const body = { percentage: Number(panelPercentage) }
                  if (panelCategoryId) body.categoryId = panelCategoryId
                  if (panelBrandId) body.brandId = panelBrandId
                  if (panelSupermarket) body.supermarket = panelSupermarket
                  body.updatedAt = panelUpdatedAt
                  const res = await adminFetch('/admin/update-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
                  const data = await res.json()
                  if (!res.ok) alert('Error: ' + (data.error || 'no especificado'))
                  else {
                    window.dispatchEvent(new Event('price-updates-changed'))
                    alert('Aplicado: ' + (data.updated || 0) + ' precios')
                  }
                } catch (e) { console.error(e); alert('Error de red') }
              }} className="flex-1 px-3 py-1 bg-emerald-600 text-white rounded">Aplicar</button>
              <button onClick={() => { setPanelCategoryId(''); setPanelBrandId(''); setPanelSupermarket(''); setPanelPercentage(5) }} className="px-3 py-1 bg-stone-900 text-white dark:bg-stone-200 dark:text-stone-900 rounded">Limpiar</button>
            </div>
          </div>
        </div>
      )}

    </header>
  );
}
