import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { 
  TrendingDown, 
  MapPin, 
  Sun, 
  Moon, 
  ShoppingBag, 
  Heart, 
} from 'lucide-react';
import { adminFetch, apiUrl } from '../config/api.js';

export function Header({
  darkMode,
  setDarkMode,
  selectedCity,
  basketCount,
  onOpenBasket,
  favoritesCount,
  onOpenFavorites,
  onResetView,
  isAdminPage = false,
}) {
  const location = useLocation()
  const isAdminHeader = isAdminPage || location.pathname === '/admin'
  const [showAdminPanel, setShowAdminPanel] = useState(false)
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
        const cRes = await fetch(apiUrl('/categories'))
        const cats = await cRes.json()
        setPanelCategories(cats.value || cats)
      } catch {
        // ignore
      }
      try {
        const bRes = await fetch(apiUrl('/brands'))
        const bs = await bRes.json()
        setPanelBrands(bs.value || bs)
      } catch {
        // ignore
      }
      try {
        const sRes = await fetch(apiUrl('/supermarkets'))
        const supermarkets = await sRes.json()
        setPanelSupermarkets(supermarkets)
      } catch {
        // ignore
      }
    })()
  }, [])
  return (
    <header className="sticky top-0 z-40 w-full border-b border-sky-200 bg-gradient-to-r from-sky-100/95 to-cyan-50/95 dark:border-stone-800 dark:bg-gradient-to-r dark:from-stone-950 dark:to-stone-900 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 md:h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onResetView}
            className="flex items-center gap-2.5 group text-left focus:outline-none cursor-pointer"
            title="Ir al inicio de ARPrice"
          >
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-sky-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-black/30 group-hover:scale-105 transition-transform duration-200">
              <TrendingDown className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-600 dark:from-sky-400 dark:via-blue-400 dark:to-emerald-400 bg-clip-text text-transparent">
                  ARPrice
                </span>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-sky-700/10 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 border border-sky-700/30">
                  AR
                </span>
              </div>
              <p className="hidden md:block text-[10px] font-medium text-stone-500 dark:text-stone-400 leading-none mt-0.5">
                Precios Justos & Transparente
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-800 dark:text-stone-200 bg-white/60 dark:bg-stone-900/40 rounded-xl border border-sky-200 dark:border-stone-700/40">
          <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="max-w-[120px] sm:max-w-[180px] truncate">{selectedCity}</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {!isAdminHeader && (
            <>
              <button
                onClick={onOpenFavorites}
                className="relative p-2 rounded-lg text-stone-600 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                title="Ver Favoritos"
              >
                <Heart className="w-5 h-5" />
                {favoritesCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {favoritesCount}
                  </span>
                )}
              </button>

              <button
                onClick={onOpenBasket}
                className="relative flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-500 text-white rounded-2xl text-sm font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer"
                title="Canasta Ahorro"
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden md:inline">Canasta</span>
                {basketCount > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-white text-indigo-700 text-xs font-black rounded-full min-w-[20px] text-center">
                    {basketCount}
                  </span>
                )}
              </button>
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
            className="p-2 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-stone-600" />
            )}
          </button>
        </div>

      </div>

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
