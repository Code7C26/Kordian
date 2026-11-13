import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LoaderCircle, MapPin, X } from 'lucide-react'
import { customerApiFetch } from '../config/api.js'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import { SupermarketLogo } from './SupermarketLogo.jsx'

const branchAddressCache = new Map()

export default function StoreFilter({ stores, value, onChange, selectedCity }) {
  const { t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)
  const [locationDialog, setLocationDialog] = useState(null)
  const menuRef = useRef(null)
  const locationRequestId = useRef(0)
  const selectedStore = stores.find((store) => String(store.id) === String(value))

  useEffect(() => {
    if (!menuOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!locationDialog) return undefined

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        locationRequestId.current += 1
        setLocationDialog(null)
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [locationDialog])

  const closeLocationDialog = () => {
    locationRequestId.current += 1
    setLocationDialog(null)
  }

  const showStoreLocations = async (store) => {
    setMenuOpen(false)
    const city = selectedCity
    const cacheKey = `${city.toLocaleLowerCase()}:${store.name.toLocaleLowerCase()}`
    const cachedResult = branchAddressCache.get(cacheKey)
    const requestId = ++locationRequestId.current
    if (cachedResult) {
      setLocationDialog({
        store,
        city,
        addresses: cachedResult.addresses,
        loading: false,
        error: '',
      })
      return
    }

    setLocationDialog({ store, city, addresses: [], loading: true, error: '' })
    try {
      const params = new URLSearchParams({ city, store: store.name })
      const response = await customerApiFetch(`/supermarket-locations?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || t('No se pudieron cargar las direcciones. Intenta nuevamente.'))
      }

      const addresses = Array.isArray(payload?.addresses)
        ? payload.addresses.filter((address) => typeof address === 'string' && address.trim())
        : []
      branchAddressCache.set(cacheKey, { addresses })
      if (locationRequestId.current === requestId) {
        setLocationDialog({ store, city, addresses, loading: false, error: '' })
      }
    } catch (error) {
      console.error('Branch addresses could not be loaded', { store: store.name, city, error })
      if (locationRequestId.current === requestId) {
        const errorMessage = /failed to fetch|fetch failed|network/i.test(error.message || '')
          ? t('No se pudieron cargar las direcciones. Intenta nuevamente.')
          : error.message
        setLocationDialog({
          store,
          city,
          addresses: [],
          loading: false,
          error: errorMessage || t('No se pudieron cargar las direcciones. Intenta nuevamente.'),
        })
      }
    }
  }

  return (
    <>
      <div className="relative min-w-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-xs font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
        >
          <span className="truncate">{selectedStore?.name || t('Todos los comercios')}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label={t('Filtrar por Comercio')}
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-800"
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={value === 'todos'}
              onClick={() => {
                onChange('todos')
                setMenuOpen(false)
              }}
              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              {t('Todos los comercios')}
            </button>
            {stores.map((store) => (
              <div key={store.id} className="flex items-center gap-1">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={String(value) === String(store.id)}
                  onClick={() => {
                    onChange(store.id)
                    setMenuOpen(false)
                  }}
                  className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  {store.name}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  title={`${t('Ver direcciones de sucursales')} ${store.name} ${t('en')} ${selectedCity}`}
                  aria-label={`${t('Ver direcciones de sucursales')} ${store.name} ${t('en')} ${selectedCity}`}
                  onClick={() => { void showStoreLocations(store) }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sky-700 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-sky-300 dark:hover:bg-stone-700"
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {locationDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/60 p-4"
          onClick={closeLocationDialog}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="branch-addresses-title"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b border-stone-200 p-4 dark:border-stone-700">
              <div className="min-w-0">
                <h2 id="branch-addresses-title" className="font-bold text-stone-900 dark:text-white">
                  {t('Direcciones de sucursales')}
                </h2>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <SupermarketLogo
                    name={locationDialog.store.name}
                    image={locationDialog.store.image}
                    className="h-7 w-16"
                  />
                  <span className="truncate text-sm text-stone-500 dark:text-stone-400">
                    {locationDialog.city}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeLocationDialog}
                aria-label={t('Cerrar')}
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              {locationDialog.loading ? (
                <p className="flex items-center gap-2 py-4 text-sm text-stone-600 dark:text-stone-300" role="status">
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('Cargando direcciones…')}
                </p>
              ) : locationDialog.error ? (
                <p className="py-3 text-sm text-rose-700 dark:text-rose-300" role="alert">{t(locationDialog.error)}</p>
              ) : locationDialog.addresses.length ? (
                <ul className="space-y-2">
                  {locationDialog.addresses.map((address) => (
                    <li key={address}>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${locationDialog.store.name}, ${locationDialog.city}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${t('Ver ubicación en Maps')}: ${address}, ${locationDialog.city}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2.5 text-sm text-stone-800 transition-colors hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700 dark:hover:text-sky-300"
                      >
                        <span>{address}</span>
                        <MapPin className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-3 text-sm text-stone-600 dark:text-stone-300" role="status">
                  {t('No hay direcciones registradas para este comercio en la ubicación seleccionada.')}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
