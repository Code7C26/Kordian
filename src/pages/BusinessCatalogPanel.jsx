import { useEffect, useState } from 'react'
import { Check, LoaderCircle, Search, Store, X } from 'lucide-react'
import { apiUrl } from '../config/api.js'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx'
import ClearableSearchInput from '../components/ClearableSearchInput.jsx'

async function readPayload(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'No se pudo completar la solicitud.')
  return payload
}

export default function BusinessCatalogPanel({ onStoreStateChange, adminStoreId = null, realDiscoMode = false }) {
  const { accessToken } = useCustomerAuth()
  const { t } = useLanguage()
  const [products, setProducts] = useState([])
  const [storeName, setStoreName] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [priceDrafts, setPriceDrafts] = useState({})
  const [busyProductId, setBusyProductId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const translateProductName = useProductNameTranslator(products.map((product) => product.name))
  const visibleProducts = products

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    if (adminStoreId === '') {
      setProducts([])
      setStoreName('')
      setLoading(false)
      onStoreStateChange?.('ready', null)
      return () => controller.abort()
    }
    onStoreStateChange?.('loading')

    const params = new URLSearchParams({ page: String(page), limit: '40' })
    if (search) params.set('search', search)

    const requestUrl = realDiscoMode
      ? (() => {
          params.set('supermarket', 'Disco')
          params.set('catalogOnly', 'true')
          return apiUrl(`/products?${params.toString()}`)
        })()
      : apiUrl(`/business/catalog?${params.toString()}`)

    fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(adminStoreId ? { 'X-Admin-Store-Id': adminStoreId } : {}),
      },
    })
      .then(readPayload)
      .then((payload) => {
        if (realDiscoMode) {
          const discoProducts = (Array.isArray(payload.data) ? payload.data : [])
            .map((product) => {
              const discoOffer = (Array.isArray(product.offers) ? product.offers : [])
                .find((offer) => String(offer.supermarket || '').toLowerCase() === 'disco')
              const cashPrice = Number(discoOffer?.cash_price ?? discoOffer?.cashPrice)
              return discoOffer && Number.isFinite(cashPrice) && cashPrice > 0
                ? { ...product, available: true, cashPrice }
                : null
            })
            .filter(Boolean)
          setProducts(discoProducts)
          setStoreName('Disco')
          setHasMore(page * 40 < Number(payload.total || 0))
          onStoreStateChange?.('ready', { id: 'disco', name: 'Disco' })
        } else {
          setProducts(payload.products || [])
          setStoreName(payload.store?.name || '')
          onStoreStateChange?.('ready', payload.store || null)
          setHasMore(Boolean(payload.hasMore))
          setPriceDrafts((current) => ({
            ...current,
            ...(payload.products || []).reduce((drafts, product) => ({
              ...drafts,
              [product.id]: current[product.id] ?? (product.cashPrice ? String(product.cashPrice) : ''),
            }), {}),
          }))
        }
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') {
          setError(loadError.message)
          onStoreStateChange?.('error', null, loadError.message)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [accessToken, adminStoreId, onStoreStateChange, page, realDiscoMode, refreshKey, search])

  const submitSearch = (event) => {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const updateAvailability = async (product, available) => {
    if (realDiscoMode) return
    const displayName = translateProductName(product.name)
    const cashPrice = Number(priceDrafts[product.id])
    if (available && (!Number.isFinite(cashPrice) || cashPrice <= 0)) {
      setError(t('Ingresa un precio válido mayor que cero para publicar el producto.'))
      return
    }

    setBusyProductId(product.id)
    setError('')
    setNotice('')
    try {
      const response = await fetch(apiUrl(`/business/catalog/${encodeURIComponent(product.id)}`), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...(adminStoreId ? { 'X-Admin-Store-Id': adminStoreId } : {}),
        },
        body: JSON.stringify({ available, cashPrice }),
      })
      await readPayload(response)
      setNotice(available
        ? `${displayName} ${t('está disponible en')} ${storeName}.`
        : `${displayName} ${t('ya no figura disponible.')}`)
      setRefreshKey((current) => current + 1)
    } catch (updateError) {
      setError(updateError.message)
    } finally {
      setBusyProductId(null)
    }
  }

  return (
    <section className="mt-7 space-y-5">
      {!realDiscoMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{t(adminStoreId !== null ? 'Supermercado seleccionado' : 'Supermercado asignado')}</p>
              <p className="font-black text-stone-900 dark:text-white">{storeName || t('Cargando…')}</p>
            </div>
          </div>
          <p className="max-w-xl text-xs text-stone-600 dark:text-stone-300">
            {t('Publicá productos del catálogo general y actualizá su precio o disponibilidad únicamente para este supermercado.')}
          </p>
        </div>
      )}

      <form onSubmit={submitSearch} className="flex gap-2">
        <label className="sr-only" htmlFor="business-catalog-search">{t('Buscar productos del catálogo')}</label>
        <ClearableSearchInput
          id="business-catalog-search"
          value={searchInput}
          clearLabel={t('Limpiar búsqueda')}
          onChange={(event) => setSearchInput(event.target.value)}
          onClear={() => setSearchInput('')}
          placeholder={t('Buscar un producto del catálogo')}
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
        />
        <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-500">
          <Search className="h-4 w-4" aria-hidden="true" />
          {t('Buscar')}
        </button>
      </form>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{t(error)}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}

      {adminStoreId === '' ? (
        <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
          {t('Selecciona un supermercado para gestionar su catálogo.')}
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-10 text-sm font-semibold text-stone-500 dark:bg-stone-800 dark:text-stone-300" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> {t('Cargando catálogo…')}
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
          {t(realDiscoMode
            ? 'No hay ofertas de Disco registradas para esta búsqueda.'
            : search
              ? 'No encontramos productos con esa búsqueda.'
              : 'Todavía no hay productos publicados. Busca un producto para incorporarlo a tu catálogo.')}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleProducts.map((product) => {
            const busy = busyProductId === product.id
            return (
              <article key={product.id} className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-700 dark:bg-stone-800 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {product.image ? (
                    <img src={product.image} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-stone-100 object-contain dark:bg-stone-900" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-400 dark:bg-stone-900"><Store className="h-6 w-6" aria-hidden="true" /></span>
                  )}
                  <div className="min-w-0">
                    <h2 className="truncate font-bold text-stone-900 dark:text-white">{translateProductName(product.name)}</h2>
                    <p className={`mt-1 text-xs font-bold ${product.available ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-500 dark:text-stone-400'}`}>
                      {t(product.available ? 'Disponible en tu supermercado' : 'No publicado en tu supermercado')}
                    </p>
                  </div>
                </div>

                {realDiscoMode ? (
                  <p className="shrink-0 rounded-lg bg-stone-100 px-3 py-2 text-sm font-bold text-stone-700 dark:bg-stone-900 dark:text-stone-200">
                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(product.cashPrice)}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`business-price-${product.id}`}>{t('Precio de ')}{translateProductName(product.name)}</label>
                    <input
                      id={`business-price-${product.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={priceDrafts[product.id] ?? ''}
                      onChange={(event) => setPriceDrafts((current) => ({ ...current, [product.id]: event.target.value }))}
                      placeholder={t('Precio ARS')}
                      className="w-32 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900 dark:text-white"
                    />
                    {product.available ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => updateAvailability(product, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                          <Check className="h-4 w-4" aria-hidden="true" /> {t('Guardar precio')}
                        </button>
                        <button type="button" disabled={busy} onClick={() => updateAvailability(product, false)} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-100 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-200 disabled:opacity-50 dark:bg-rose-950 dark:text-rose-200">
                          <X className="h-4 w-4" aria-hidden="true" /> {t('Quitar')}
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => updateAvailability(product, true)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                        {t('Publicar')}
                      </button>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-stone-700">{t('Anterior')}</button>
        <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">{t('Página')} {page}</span>
        <button type="button" disabled={!hasMore || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold disabled:opacity-40 dark:border-stone-700">{t('Siguiente')}</button>
      </div>
    </section>
  )
}
