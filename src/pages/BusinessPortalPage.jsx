import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleHelp,
  Clock3,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  Store,
} from 'lucide-react'
import { apiUrl } from '../config/api.js'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import BusinessCatalogPanel from './BusinessCatalogPanel.jsx'
import BusinessPriceHistoryPanel from './BusinessPriceHistoryPanel.jsx'

const modules = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { id: 'store', label: 'Datos de Sucursal', icon: Store },
  { id: 'catalog', label: 'Carga de Productos', icon: PackagePlus },
  { id: 'history', label: 'Historial de Precios', icon: Clock3 },
]

export default function BusinessPortalPage({ user, onSignOut, isAdministrator = false }) {
  const { t } = useLanguage()
  const { accessToken } = useCustomerAuth()
  const [activeModule, setActiveModule] = useState('overview')
  const [storeState, setStoreState] = useState({ status: 'loading', store: null, error: '' })
  const [stores, setStores] = useState([])
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [storesLoading, setStoresLoading] = useState(isAdministrator)
  const [storesError, setStoresError] = useState('')
  const reportStoreState = useCallback((status, store = null, error = '') => {
    setStoreState({ status, store, error })
  }, [])

  useEffect(() => {
    if (!isAdministrator) return undefined
    const controller = new AbortController()
    setStoresLoading(true)
    setStoresError('')
    fetch(apiUrl('/business/stores'), {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los supermercados.')
        return payload
      })
      .then((payload) => {
        if (!controller.signal.aborted) setStores(Array.isArray(payload.stores) ? payload.stores : [])
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setStoresError(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setStoresLoading(false)
      })
    return () => controller.abort()
  }, [accessToken, isAdministrator])

  useEffect(() => {
    if (isAdministrator && !selectedStoreId) {
      setStoreState({ status: 'ready', store: null, error: '' })
    }
  }, [isAdministrator, selectedStoreId])

  const assignedStore = storeState.store
  const moduleTitle = modules.find((module) => module.id === activeModule)?.label || 'Resumen'

  return (
    <main className="dark min-h-screen bg-[#0b0a09] text-stone-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col md:flex-row">
        <aside className="flex w-full shrink-0 flex-col border-b border-slate-800 bg-[#070d1b] px-4 py-4 md:min-h-screen md:w-64 md:border-b-0 md:border-r md:px-3">
          <Link to="/" className="flex items-center gap-3 rounded-xl border border-sky-900/50 bg-sky-950/40 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white">
              <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-white">{t('Comercio')}</span>
              <span className="block truncate text-[11px] text-slate-400">{t('Espacio privado')}</span>
            </span>
          </Link>

          <p className="mb-2 mt-6 px-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
            {t('Gestión comercial')}
          </p>
          <nav aria-label={t('Módulos del comercio')} className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {modules.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={activeModule === id ? 'page' : undefined}
                onClick={() => setActiveModule(id)}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold transition-colors md:w-full ${
                  activeModule === id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t(label)}
              </button>
            ))}
          </nav>

          <div className="mt-auto hidden pt-6 md:block">
            <Link to="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Volver al sitio')}
            </Link>
            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="flex items-center gap-2 text-xs font-bold text-white">
                <CircleHelp className="h-4 w-4 text-sky-400" aria-hidden="true" /> {t('¿Necesitas ayuda?')}
              </p>
              <p className="mt-2 break-all text-[11px] leading-5 text-slate-400">{user.email}</p>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4 border-b border-stone-800 pb-5">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-sky-400">{t('Panel para comercios')}</p>
              <h1 className="mt-1 text-2xl font-black text-white">{t(moduleTitle)}</h1>
              <p className="mt-1 text-xs text-stone-400">{t('Administra la información de tu comercio y la sucursal.')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isAdministrator && (
                <label className="flex items-center gap-2 text-xs font-semibold text-stone-300">
                  {t('Supermercado')}
                  <select
                    value={selectedStoreId}
                    onChange={(event) => {
                      setSelectedStoreId(event.target.value)
                      setStoreState({ status: 'loading', store: null, error: '' })
                    }}
                    disabled={storesLoading || stores.length === 0}
                    className="max-w-56 rounded-lg border border-stone-700 bg-[#100f0e] px-3 py-2 text-xs text-white disabled:opacity-60"
                  >
                    <option value="">{storesLoading ? t('Cargando…') : t('Selecciona un supermercado')}</option>
                    {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                  </select>
                </label>
              )}
              <button type="button" onClick={onSignOut} className="inline-flex items-center gap-2 rounded-lg border border-stone-700 px-3 py-2 text-xs font-semibold text-stone-300 transition hover:border-stone-500 hover:text-white">
                <LogOut className="h-4 w-4" aria-hidden="true" /> {t('Cerrar sesión')}
              </button>
            </div>
          </header>

          {storesError && <p role="alert" className="mb-5 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-xs text-rose-200">{t(storesError)}</p>}
          {isAdministrator && !storesLoading && !storesError && stores.length === 0 && (
            <p role="status" className="mb-5 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-xs text-amber-200">{t('No hay supermercados disponibles para gestionar.')}</p>
          )}
          {storeState.status === 'error' && (
            <p role="alert" className="mb-5 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-xs text-rose-200">
              {t(storeState.error)}
            </p>
          )}

          {activeModule === 'overview' && (
            <div className="space-y-5">
              {storeState.status === 'ready' && !assignedStore && (
                <p role="status" className="rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-xs text-rose-200">
                  {t(isAdministrator ? 'Selecciona un supermercado para gestionar.' : 'Tu cuenta comercial todavía no tiene un supermercado asignado. Contacta a administración.')}
                </p>
              )}
              <section className="rounded-xl border border-stone-800 bg-[#1c1917] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-400">{t('Panel para comercios')}</p>
                    <h2 className="mt-2 text-xl font-black text-white">{t('Resumen')}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
                      {t('Administra la presencia de tu comercio, actualiza los precios de tus productos y consulta su historial.')}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                    assignedStore
                      ? 'border-emerald-900 bg-emerald-950/50 text-emerald-300'
                      : 'border-stone-700 bg-stone-900 text-stone-300'
                  }`}>
                    {storeState.status === 'loading'
                      ? t('Verificando cuenta…')
                      : assignedStore
                        ? assignedStore.name
                        : t(isAdministrator ? 'Selecciona un supermercado' : 'Pendiente de asignación')}
                  </span>
                </div>
              </section>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { id: 'store', title: 'Datos de Sucursal', description: assignedStore?.name || 'Consulta la sucursal asignada a tu cuenta.', icon: Store },
                  { id: 'catalog', title: 'Carga de Productos', description: 'Actualiza disponibilidad y precios del catálogo.', icon: PackagePlus },
                  { id: 'history', title: 'Historial de Precios', description: 'Revisa los cambios registrados en tu sucursal.', icon: ChartNoAxesCombined },
                ].map(({ id, title, description, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => setActiveModule(id)} className="group flex min-h-32 items-start gap-3 rounded-xl border border-stone-800 bg-[#1c1917] p-4 text-left transition hover:border-sky-700 hover:bg-[#211e1c]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-950 text-sky-400">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-white">{t(title)}</span>
                      <span className="mt-1 block text-xs leading-5 text-stone-400">{t(description)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeModule === 'store' && (
            <section className="rounded-xl border border-stone-800 bg-[#1c1917] p-5 sm:p-6">
              <h2 className="text-base font-black text-white">{t('Datos de Sucursal')}</h2>
              <p className="mt-1 text-xs text-stone-400">{t('Información de la sucursal asignada a tu cuenta.')}</p>
              {storeState.status === 'loading' ? (
                <p className="mt-6 text-sm text-stone-400" role="status">{t('Cargando…')}</p>
              ) : assignedStore ? (
                <dl className="mt-5 divide-y divide-stone-800 border-y border-stone-800">
                  <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr]">
                    <dt className="text-xs font-semibold text-stone-400">{t('Nombre de sucursal')}</dt>
                    <dd className="text-sm font-bold text-white">{assignedStore.name}</dd>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr]">
                    <dt className="text-xs font-semibold text-stone-400">{t('Estado de asignación')}</dt>
                    <dd className="text-sm font-bold text-emerald-300">{t('Asignada')}</dd>
                  </div>
                </dl>
              ) : (
                <p role="status" className="mt-5 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
                  {t(isAdministrator ? 'Selecciona un supermercado para gestionar.' : 'Tu cuenta comercial todavía no tiene un supermercado asignado. Contacta a administración.')}
                </p>
              )}
            </section>
          )}

          <div hidden={activeModule !== 'catalog'} className="business-dark-panel">
            <BusinessCatalogPanel key={isAdministrator ? selectedStoreId : 'assigned'} adminStoreId={isAdministrator ? selectedStoreId : null} onStoreStateChange={reportStoreState} />
          </div>

          {activeModule === 'history' && <BusinessPriceHistoryPanel adminStoreId={isAdministrator ? selectedStoreId : null} />}

          <div className="mt-8 md:hidden">
            <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-stone-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Volver al sitio')}
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
