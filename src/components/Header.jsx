import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  ChartNoAxesCombined,
  CircleHelp,
  Menu,
  MapPin, 
  ChevronDown,
  Settings,
  Sun, 
  Moon, 
  ShoppingBag, 
  Heart, 
  ListFilter,
  LogIn,
  LogOut,
  UserPlus,
  UsersRound,
  TicketPercent,
  Languages,
  X,
} from 'lucide-react';
import { adminFetch, apiFetch } from '../config/api.js';
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { CITIES_LIST } from '../data/mockProducts.js'
import { CategoryIconImage, getCategoryIconAsset } from '../utils/categoryIconAssets.jsx';
import brandLogo from '../../assents/Ar-Price/Logo_final.svg';
import brandLogoDark from '../../assents/Ar-Price/Logo_final_Negativo.svg';

export function Header({
  darkMode,
  setDarkMode,
  selectedCity,
  setSelectedCity,
  basketCount,
  favoritesCount = 0,
  onOpenBasket,
  onOpenFavorites,
  onResetView,
  categories = [],
  selectedCategory,
  onSelectCategory,
  isAdminPage = false,
}) {
  const location = useLocation()
  const { user, signOut } = useCustomerAuth()
  const { language, setLanguage, t } = useLanguage()
  const isAdminHeader = isAdminPage || location.pathname === '/admin'
  const [openMenu, setOpenMenu] = useState(null)
  const showAdminPanel = openMenu === 'admin'
  const showCategoryMenu = openMenu === 'category'
  const showAccountMenu = openMenu === 'account'
  const accountMenuRef = useRef(null)
  const showLocationMenu = openMenu === 'location'
  const [locationQuery, setLocationQuery] = useState('')
  const locationMenuRef = useRef(null)
  const [panelCategories, setPanelCategories] = useState([])
  const [panelBrands, setPanelBrands] = useState([])
  const [panelSupermarkets, setPanelSupermarkets] = useState([])
  const [panelCategoryId, setPanelCategoryId] = useState('')
  const [panelBrandId, setPanelBrandId] = useState('')
  const [panelSupermarket, setPanelSupermarket] = useState('')
  const [panelPercentage, setPanelPercentage] = useState(5)
  const [panelUpdatedAt, setPanelUpdatedAt] = useState(() => new Date().toISOString().slice(0, 10))

  const toggleExclusiveMenu = (menu) => {
    setOpenMenu((currentMenu) => currentMenu === menu ? null : menu)
  }

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
      if (!accountMenuRef.current?.contains(event.target)) setOpenMenu(null)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showAccountMenu])

  useEffect(() => {
    if (!showLocationMenu) return undefined

    const closeOnOutsideClick = (event) => {
      if (!locationMenuRef.current?.contains(event.target)) setOpenMenu(null)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showLocationMenu])

  const normalizedLocationQuery = locationQuery
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  const matchingCities = CITIES_LIST.filter((city) => city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes(normalizedLocationQuery))
  const customCity = locationQuery.trim()
  const isKnownCity = CITIES_LIST.some((city) => city.toLowerCase() === customCity.toLowerCase())

  const selectCity = (city) => {
    setSelectedCity(city)
    setLocationQuery(city)
    setOpenMenu(null)
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-sky-400/30 dark:border-stone-800 bg-sky-600 dark:bg-stone-900/90 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex min-h-18 flex-wrap items-center justify-between gap-x-2 gap-y-2 py-2 lg:h-18 lg:flex-nowrap lg:gap-4 lg:py-0">
        <div className="flex min-w-0 items-center gap-3">
          <button 
            onClick={onResetView}
            className="flex items-center gap-2.5 group text-left focus:outline-none cursor-pointer"
            title={t('Ir al inicio de Ar-Price')}
          >
            <div className="relative flex items-center gap-3">
              <div className="relative rounded-xl p-1.5 bg-white dark:bg-black shadow-[0_6px_16px_rgba(14,116,144,0.18)] ring-1 ring-sky-300/40 dark:ring-sky-700/60 backdrop-blur-sm">
                <img
                  src={darkMode ? brandLogoDark : brandLogo}
                  alt="Ar-Price"
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
                  {t('Ahorrar no es suerte, es información')}
                </p>
              </div>
            </div>
          </button>
        </div>

        <div className="relative" ref={locationMenuRef}>
          <button
            type="button"
            onClick={() => {
              setLocationQuery(selectedCity)
              toggleExclusiveMenu('location')
            }}
            aria-haspopup="dialog"
            aria-expanded={showLocationMenu}
            aria-label={`${t('Cambiar ubicación. Ubicación actual:')} ${selectedCity}`}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-white/30 bg-white/20 px-2 py-2 text-sm font-medium text-white hover:bg-white/30 dark:border-stone-700/40 dark:bg-stone-900/40 dark:text-stone-200 sm:gap-2 sm:px-4"
          >
            <MapPin className="h-4 w-4 shrink-0 text-white dark:text-sky-400" aria-hidden="true" />
            <span className="max-w-[80px] max-[359px]:max-w-[44px] truncate sm:max-w-[120px] lg:max-w-[180px]">{selectedCity}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${showLocationMenu ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {showLocationMenu && (
            <div
              role="dialog"
              aria-label={t('Seleccionar ubicación')}
              className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-stone-200 bg-white p-3 text-stone-900 shadow-xl dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 sm:left-1/2 sm:-translate-x-1/2"
            >
              <label htmlFor="location-search" className="mb-2 block text-sm font-bold">{t('Selecciona tu ubicación')}</label>
              <input
                id="location-search"
                type="text"
                value={locationQuery}
                onChange={(event) => setLocationQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && customCity) {
                    event.preventDefault()
                    selectCity(customCity)
                  }
                }}
                placeholder={t('Escribe una ciudad')}
                autoComplete="address-level2"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-stone-600 dark:bg-stone-900 dark:focus:ring-sky-900"
              />
              <div className="mt-2 max-h-40 overflow-y-auto" role="listbox" aria-label={t('Ciudades disponibles')}>
                {matchingCities.map((city) => (
                  <button
                    key={city}
                    type="button"
                    role="option"
                    aria-selected={selectedCity === city}
                    onClick={() => selectCity(city)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-sky-50 dark:hover:bg-stone-700"
                  >
                    <span>{city}</span>
                    {selectedCity === city && <span className="text-xs font-bold text-sky-700 dark:text-sky-300">{t('Actual')}</span>}
                  </button>
                ))}
                {customCity && !isKnownCity && (
                  <button
                    type="button"
                    onClick={() => selectCity(customCity)}
                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-stone-700"
                  >
                    {t('Usar “')}{customCity}”
                  </button>
                )}
                {!matchingCities.length && !customCity && (
                  <p className="px-3 py-2 text-sm text-stone-500 dark:text-stone-400">{t('Escribe el nombre de tu ciudad.')}</p>
                )}
              </div>
              <p className="mt-2 border-t border-stone-200 pt-2 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
                {t('Por ahora, el catálogo no cambia según la ubicación seleccionada.')}
              </p>
            </div>
          )}
        </div>

        <div className="flex w-full items-center justify-between gap-1 lg:w-auto lg:justify-start lg:gap-2 xl:gap-3">
          {!isAdminHeader && (
            <>
              <button
                onClick={() => toggleExclusiveMenu('category')}
                className="relative flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold text-white hover:bg-white/25 dark:bg-stone-800/60 dark:text-stone-200 transition-colors cursor-pointer"
                title={t('Seleccionar categoría para comparar precios')}
                aria-expanded={showCategoryMenu}
              >
                <ListFilter className="w-4 h-4" />
                <span className="hidden sm:inline">{t('Categorías')}</span>
              </button>

              <button
                onClick={onOpenFavorites}
                className="relative p-2 rounded-lg text-white dark:text-stone-300 hover:text-rose-200 dark:hover:text-rose-400 hover:bg-white/20 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                title={t('Ver Favoritos')}
              >
                <Heart className={`w-5 h-5 ${favoritesCount > 0 ? 'fill-current text-red-500' : ''}`} />
              </button>

              <button
                onClick={onOpenBasket}
                className="relative flex items-center gap-2 rounded-2xl bg-sky-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition-colors hover:bg-sky-700"
                title={t('Canasta Ahorro')}
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden md:inline">{t('Canasta')}</span>
                {basketCount > 0 && (
                  <span className="ml-2 min-w-[20px] rounded-full bg-white px-2 py-0.5 text-center text-xs font-black text-sky-700">
                    {basketCount}
                  </span>
                )}
              </button>

              <div className="relative" ref={accountMenuRef}>
                <button
                  type="button"
                  onClick={() => toggleExclusiveMenu('account')}
                  aria-haspopup="menu"
                  aria-expanded={showAccountMenu}
                  aria-label={t('Abrir menú')}
                  title={t('Menú')}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white transition-colors hover:bg-white/25 dark:bg-stone-800/60 dark:text-stone-200"
                >
                  {showAccountMenu
                    ? <X className="h-6 w-6" aria-hidden="true" />
                    : <Menu className="h-6 w-6" aria-hidden="true" />}
                </button>
                {showAccountMenu && (
                  <div
                    role="menu"
                    aria-label={t('Menú principal')}
                    className="absolute right-0 top-full z-50 mt-2 max-h-[min(78vh,40rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2 text-stone-800 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 max-lg:fixed max-lg:right-4 max-lg:left-auto max-lg:top-[116px] max-lg:mt-0 max-sm:top-[108px]"
                  >
                    <Link role="menuitem" to="/listas-compartidas" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                      <UsersRound className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      {t('Lista compartida')}
                    </Link>
                    <Link role="menuitem" to="/calculadora" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                      <ChartNoAxesCombined className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      {t('Calculadora de precios')}
                    </Link>
                    <Link role="menuitem" to="/cupones" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                      <TicketPercent className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      {t('Cupones y descuentos')}
                    </Link>
                    <div className="my-2 border-t border-stone-200 dark:border-stone-700" />
                    <Link role="menuitem" to="/configuracion" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                      <Settings className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      {t('Configuración')}
                    </Link>
                    <Link role="menuitem" to="/faq" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                      <CircleHelp className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      {t('FAQ')}
                    </Link>
                    {user ? (
                      <>
                        <Link role="menuitem" to="/mis-alertas" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                          <Heart className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> {t('Mis alertas')}
                        </Link>
                        <button role="menuitem" type="button" onClick={() => { setOpenMenu(null); signOut() }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                          <LogOut className="h-4 w-4 text-stone-500" aria-hidden="true" /> {t('Cerrar sesión')}
                        </button>
                      </>
                    ) : (
                      <>
                        <Link role="menuitem" to="/ingresar" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-800">
                          <LogIn className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> {t('Iniciar sesión')}
                        </Link>
                        <Link role="menuitem" to="/registro" onClick={() => setOpenMenu(null)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/60">
                          <UserPlus className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" /> {t('Registrarse')}
                        </Link>
                      </>
                    )}
                    <div className="my-2 border-t border-stone-200 dark:border-stone-700" />
                    <div className="px-3 py-2">
                      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                        <Languages className="h-4 w-4" aria-hidden="true" />
                        {t('Idioma')}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 'es', label: 'Español' },
                          { value: 'en', label: 'English' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={language === option.value}
                            onClick={() => setLanguage(option.value)}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                              language === option.value
                                ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                                : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Admin action button in header */}
          {isAdminHeader && (
            <button
              onClick={() => toggleExclusiveMenu('admin')}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold bg-yellow-500 text-black rounded-2xl hover:brightness-90 transition-all duration-150 ml-2"
              title={t('Abrir panel rápido de actualización de precios')}
            >
              {t('Actualizar Precios')}
            </button>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-white dark:text-stone-300 hover:bg-white/20 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title={t(darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro')}
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
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">{t('Comparar precios')}</p>
              <h2 className="text-base font-black">{t('Selecciona una categoría')}</h2>
            </div>
            <button onClick={() => setOpenMenu(null)} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700" aria-label={t('Cerrar menú de categorías')}>{t('Cerrar')}</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null)
                onSelectCategory('todos')
              }}
              className={`rounded-xl border p-3 text-left transition-colors ${selectedCategory === 'todos' ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-200 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-700 dark:hover:border-sky-700 dark:hover:bg-sky-950/40'}`}
            >
              <span className="flex items-start gap-3">
                <span className={`mt-0.5 rounded-lg p-2 ${selectedCategory === 'todos' ? 'bg-white/20' : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'}`}>
                  <CategoryIconImage src={getCategoryIconAsset({ id: 'todos' })} className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-black">{t('Todos los productos')}</span>
                </span>
              </span>
            </button>
            {categories.map((category) => (
              (() => {
                const categoryIcon = getCategoryIconAsset(category)
                const isSelected = selectedCategory === category.id
                return (
                  <button
                    type="button"
                    key={category.id}
                    onClick={() => {
                      setOpenMenu(null)
                      onSelectCategory(category.id)
                    }}
                    className={`rounded-xl border p-3 text-left transition-colors ${isSelected ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-200 hover:border-sky-300 hover:bg-sky-50 dark:border-stone-700 dark:hover:border-sky-700 dark:hover:bg-sky-950/40'}`}
                  >
                    <span className="flex items-start gap-3">
                      <span className={`mt-0.5 rounded-lg p-2 ${isSelected ? 'bg-white/20' : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'}`}>
                        <CategoryIconImage src={categoryIcon} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black">{t(category.name)}</span>
                        <span className={`mt-1 block text-xs ${isSelected ? 'text-sky-100' : 'text-stone-500 dark:text-stone-400'}`}>{t(category.description)}</span>
                      </span>
                    </span>
                  </button>
                )
              })()
            ))}
          </div>
        </div>
      )}

      {/* Floating admin quick panel */}
      {isAdminHeader && showAdminPanel && (
        <div className="fixed right-4 top-4 z-50 w-72 max-h-[60vh] overflow-auto bg-white dark:bg-stone-800 border rounded-xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <strong>{t('Actualizar precios (rápido)')}</strong>
            <button onClick={() => setOpenMenu(null)} className="text-sm text-stone-500">{t('Cerrar')}</button>
          </div>
          <div className="space-y-2 text-sm">
            <label className="block">{t('Filtros de actualización')}</label>
            <select value={panelCategoryId} onChange={(e) => setPanelCategoryId(e.target.value)} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900">
              <option value="">{t('Todas las categorías')}</option>
              {panelCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select value={panelBrandId} onChange={(e) => setPanelBrandId(e.target.value)} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900">
              <option value="">{t('Todas las marcas')}</option>
              {panelBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <select value={panelSupermarket} onChange={(e) => setPanelSupermarket(e.target.value)} className="w-full px-2 py-1 rounded border bg-white dark:bg-stone-900">
              <option value="">{t('Todos los supermercados')}</option>
              {panelSupermarkets.map((supermarket) => <option key={supermarket.id} value={supermarket.name}>{supermarket.name}</option>)}
            </select>

            <label className="block">{t('Fecha de actualización')}</label>
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
              }} className="flex-1 px-3 py-1 bg-emerald-600 text-white rounded">{t('Aplicar')}</button>
              <button onClick={() => { setPanelCategoryId(''); setPanelBrandId(''); setPanelSupermarket(''); setPanelPercentage(5) }} className="px-3 py-1 bg-stone-900 text-white dark:bg-stone-200 dark:text-stone-900 rounded">{t('Limpiar')}</button>
            </div>
          </div>
        </div>
      )}

    </header>
  );
}
