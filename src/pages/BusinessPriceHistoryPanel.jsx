import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { apiUrl } from '../config/api.js'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx'
import ClearableSearchInput from '../components/ClearableSearchInput.jsx'
import { matchesSearchTerms } from '../utils/searchTerms.js'

export default function BusinessPriceHistoryPanel() {
  const { accessToken } = useCustomerAuth()
  const { language, t } = useLanguage()
  const [history, setHistory] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const translateProductName = useProductNameTranslator(history.map((item) => item.productName))

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')

    fetch(apiUrl('/business/price-history'), {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el historial de precios.')
        return payload
      })
      .then((payload) => setHistory(Array.isArray(payload.history) ? payload.history : []))
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [accessToken, refreshKey])

  const currency = useMemo(() => new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }), [language])
  const filteredHistory = history.filter((item) =>
    matchesSearchTerms(translateProductName(item.productName), search),
  )

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-stone-800 bg-[#1c1917] p-4 sm:p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-400">{t('Panel para comercios')}</p>
          <h2 className="mt-1 text-lg font-black text-white">{t('Cambios recientes')}</h2>
          <p className="mt-1 text-xs text-stone-400">{t('Registros recientes de cambios de precio en tu sucursal.')}</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:w-64">
            <span className="sr-only">{t('Buscar producto')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden="true" />
            <ClearableSearchInput value={search} clearLabel={t('Limpiar búsqueda')} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder={t('Buscar producto')} className="w-full rounded-lg border border-stone-700 bg-[#100f0e] py-2 pl-9 pr-3 text-xs text-white placeholder:text-stone-500" />
          </label>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('Buscar')}
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-xs text-rose-200">{t(error)}</p>}

      <div className="overflow-hidden rounded-xl border border-stone-800 bg-[#1c1917]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-[#100f0e] text-[10px] font-extrabold uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-4 py-3">{t('Producto')}</th>
                <th className="px-4 py-3">{t('Precio anterior')}</th>
                <th className="px-4 py-3">{t('Precio nuevo')}</th>
                <th className="px-4 py-3">{t('Variación')}</th>
                <th className="px-4 py-3">{t('Fecha')}</th>
                <th className="px-4 py-3">{t('Origen')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800 text-stone-300">
              {filteredHistory.map((item) => {
                const previousPrice = Number(item.previousPrice)
                const currentPrice = Number(item.cashPrice)
                const variation = Number.isFinite(previousPrice) && previousPrice > 0
                  ? ((currentPrice - previousPrice) / previousPrice) * 100
                  : null
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold text-white">{translateProductName(item.productName)}</td>
                    <td className="px-4 py-3">{Number.isFinite(previousPrice) ? currency.format(previousPrice) : '—'}</td>
                    <td className="px-4 py-3 font-semibold">{currency.format(currentPrice)}</td>
                    <td className={`px-4 py-3 font-semibold ${variation === null ? 'text-stone-500' : variation > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {variation === null ? '—' : `${variation > 0 ? '+' : ''}${variation.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-3">{new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.observedAt))}</td>
                    <td className="px-4 py-3">{t(item.source || 'Sistema')}</td>
                  </tr>
                )
              })}
              {!loading && filteredHistory.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-xs text-stone-400">
                    {error ? t('No se pudo mostrar el historial.') : search ? t('No hay cambios que coincidan con la búsqueda.') : t('Todavía no hay cambios de precio registrados para esta sucursal.')}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-xs text-stone-400" role="status">{t('Cargando historial…')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
