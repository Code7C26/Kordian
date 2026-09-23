import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { 
  MapPin, 
  Sun, 
  Moon, 
  ShoppingBag, 
  Heart, 
} from 'lucide-react';
import { adminFetch, apiUrl } from '../config/api.js';
import brandLogo from '../../assents/Ar-Price/Logo_final.svg';
import brandLogoDark from '../../assents/Ar-Price/Logo_final_Negativo.svg';

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
                onClick={onOpenFavorites}
                className="relative p-2 rounded-lg text-white dark:text-stone-300 hover:text-rose-200 dark:hover:text-rose-400 hover:bg-white/20 dark:hover:bg-stone-800 transition-colors cursor-pointer"
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
