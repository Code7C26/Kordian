import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  Calculator,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  PackageSearch,
  Search,
  TrendingUp,
} from 'lucide-react'
import { apiUrl } from '../config/api.js'
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx'
import { SupermarketLogo } from '../components/SupermarketLogo.jsx'
import BrandHeader from '../components/BrandHeader.jsx'
import { CATALOG_REQUEST_TIMEOUT_MS, fetchCachedCatalogResponse } from '../services/catalogResponseCache.js'
import { fetchProductAnalysis } from '../services/analysisApi.js'
import ClearableSearchInput from '../components/ClearableSearchInput.jsx'
import { isValidCatalogProduct } from '../utils/validCatalogProducts.js'
import { getSearchRelevance } from '../utils/searchTerms.js'

const PRODUCT_SEARCH_LIMIT = 20
const PRODUCT_SEARCH_MIN_LENGTH = 2
const PRODUCT_SEARCH_DEBOUNCE_MS = 300
const PRODUCT_SEARCH_TIMEOUT_MS = 30_000

const periods = [
  { label: '1 mes', months: 1 },
  { label: '3 meses', months: 3 },
  { label: '6 meses', months: 6 },
  { label: '12 meses', months: 12 },
]

function getPriceHistory(product) {
  return (Array.isArray(product?.priceHistory) ? product.priceHistory : [])
    .map((point) => ({
      date: point.date || point.observed_at || point.updatedAt || point.timestamp || '',
      price: Number(point.avgPrice ?? point.cash_price ?? point.cashPrice ?? point.price),
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
}

function getHistoryForPeriod(history, months) {
  if (history.length < 2) return history
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const recent = history.filter((point) => {
    const pointDate = new Date(point.date)
    return Number.isFinite(pointDate.getTime()) && pointDate >= cutoff
  })
  return recent.length >= 2 ? recent : history
}

function getVariation(history) {
  if (history.length < 2) return null
  return ((history.at(-1).price - history[0].price) / history[0].price) * 100
}

function formatHistoryDate(date, language) {
  const parsedDate = new Date(date)
  return Number.isFinite(parsedDate.getTime())
    ? new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'es-AR', { day: '2-digit', month: 'short' }).format(parsedDate)
    : date
}

function normalizeProducts(products) {
  return products
    .map((product) => {
      const offers = Array.isArray(product.offers) ? product.offers : []
      const offerPrices = offers
        .map((offer) => Number(offer.cash_price ?? offer.cashPrice ?? offer.price))
        .filter((price) => Number.isFinite(price) && price > 0)
      const currentPrice = Number(product.currentPrice || product.price || Math.min(...offerPrices))
      const primaryOffer = offers.find((offer) => Number(offer.cash_price ?? offer.cashPrice ?? offer.price) === currentPrice)
      const primaryStoreName = product.primaryStore?.name || primaryOffer?.supermarket || ''
      return {
        ...product,
        currentPrice,
        brand: product.brand || product.brands?.name || '',
        primaryStore: {
          ...product.primaryStore,
          name: primaryStoreName,
          image: product.primaryStore?.image || '',
        },
      }
    })
    .filter((product) => (
      isValidCatalogProduct(product)
      && product.name
      && Number.isFinite(product.currentPrice)
      && product.currentPrice > 0
    ))
}

function rankSearchResults(products, query) {
  return [...products].sort((left, right) => {
    return getSearchRelevance(left.name, query) - getSearchRelevance(right.name, query)
  })
}

function PriceHistoryChart({ points, productName, language, t }) {
  if (points.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
        {t('Todavía no hay suficientes registros para mostrar la evolución de este producto.')}
      </div>
    )
  }

  const width = 720
  const height = 210
  const padding = { top: 20, right: 18, bottom: 28, left: 18 }
  const prices = points.map((point) => point.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || Math.max(max * 0.1, 1)
  const coordinates = points.map((point, index) => ({
    x: padding.left + (index / (points.length - 1)) * (width - padding.left - padding.right),
    y: padding.top + ((max - point.price) / range) * (height - padding.top - padding.bottom),
  }))
  const line = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = `${line} L ${coordinates.at(-1).x} ${height - padding.bottom} L ${coordinates[0].x} ${height - padding.bottom} Z`
  const firstDate = points[0].date
  const lastDate = points.at(-1).date

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-3 pb-2 pt-4 dark:border-stone-700 dark:bg-stone-950/50">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full overflow-visible"
        role="img"
        aria-label={`${t('Evolución del precio de')} ${productName}`}
      >
        {[0, 1, 2, 3].map((lineIndex) => {
          const y = padding.top + (lineIndex / 3) * (height - padding.top - padding.bottom)
          return <line key={lineIndex} x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" className="text-stone-200 dark:text-stone-800" strokeDasharray="3 5" />
        })}
        <path d={area} className="fill-sky-500/10" />
        <path d={line} fill="none" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((point, index) => (
          <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={index === coordinates.length - 1 ? 5 : 3} fill="#0284c7" stroke="white" strokeWidth="2" />
        ))}
        <text x={padding.left} y={height - 4} className="fill-stone-500 text-[11px]">{formatHistoryDate(firstDate, language)}</text>
        <text x={width - padding.right} y={height - 4} textAnchor="end" className="fill-stone-500 text-[11px]">{formatHistoryDate(lastDate, language)}</text>
      </svg>
    </div>
  )
}

export default function PriceInflationPage() {
  const { language, t } = useLanguage()
  const currency = useMemo(() => new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }), [language])
  const [products, setProducts] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchRetryKey, setSearchRetryKey] = useState(0)
  const [amount, setAmount] = useState('100000')
  const [variation, setVariation] = useState('0.0')
  const [period, setPeriod] = useState(3)
  const [isSearchingProducts, setIsSearchingProducts] = useState(false)
  const [productMenuOpen, setProductMenuOpen] = useState(false)
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0)
  const [productSearchError, setProductSearchError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const translateProductName = useProductNameTranslator(products.map((product) => product.name))
  const [historyLoading, setHistoryLoading] = useState(false)
  const analysisCache = useRef(new Map())
  const productMenuRef = useRef(null)
  const productOptionRefs = useRef([])

  useEffect(() => {
    const query = searchQuery.trim()
    setSelectedProductId('')
    setProducts([])
    setProductMenuOpen(false)
    setHighlightedProductIndex(0)
    setProductSearchError('')
    setHistoryError('')
    setVariation('0.0')

    if (query.length < PRODUCT_SEARCH_MIN_LENGTH) {
      setIsSearchingProducts(false)
      return undefined
    }

    const controller = new AbortController()
    let active = true
    setIsSearchingProducts(true)
    const debounceId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: String(PRODUCT_SEARCH_LIMIT),
          search: query,
          catalogOnly: 'true',
        })
        const payload = await fetchCachedCatalogResponse(
          apiUrl(`/products?${params.toString()}`),
          {
            signal: controller.signal,
            timeoutMs: PRODUCT_SEARCH_TIMEOUT_MS,
          },
        )
        if (!active) return

        const results = Array.isArray(payload) ? payload : payload?.data || []
        const matches = rankSearchResults(normalizeProducts(results), query)
        setProducts(matches)
        setProductMenuOpen(matches.length > 0)
      } catch (error) {
        if (!active || error.name === 'AbortError') return
        console.error('Error searching products for inflation calculator', error)
        const timedOut = error.name === 'TimeoutError'
          || controller.signal.reason?.name === 'TimeoutError'
        setProductSearchError(timedOut
          ? 'La búsqueda tardó demasiado. Intenta nuevamente.'
          : error instanceof TypeError
            ? 'No se pudo conectar con el catálogo. Verifica que el servidor esté activo.'
            : 'No se pudieron buscar productos. Intenta nuevamente.')
      } finally {
        if (active) setIsSearchingProducts(false)
      }
    }, PRODUCT_SEARCH_DEBOUNCE_MS)

    return () => {
      active = false
      window.clearTimeout(debounceId)
      controller.abort()
    }
  }, [searchQuery, searchRetryKey])

  const selectedProduct = products.find((product) => String(product.id) === selectedProductId)
  const activeProductId = selectedProduct?.id

  useEffect(() => {
    if (!productMenuOpen) return undefined

    const closeOnOutsideClick = (event) => {
      if (!productMenuRef.current?.contains(event.target)) setProductMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [productMenuOpen])

  useEffect(() => {
    if (activeProductId === undefined || activeProductId === null) {
      setHistoryLoading(false)
      return
    }

    const productId = String(activeProductId)
    if (analysisCache.current.has(productId)) {
      const cachedAnalysis = analysisCache.current.get(productId)
      if (cachedAnalysis) {
        setProducts((current) => current.map((product) => (
          String(product.id) === productId
            ? { ...product, analysis: cachedAnalysis, priceHistory: cachedAnalysis.priceHistory || product.priceHistory }
            : product
        )))
      }
      setHistoryLoading(false)
      setHistoryError('')
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException('La consulta del historial excedió el tiempo de espera.', 'TimeoutError'))
    }, CATALOG_REQUEST_TIMEOUT_MS)
    let active = true
    setHistoryLoading(true)
    setHistoryError('')

    fetchProductAnalysis(
      apiUrl(`/analysis/products/${encodeURIComponent(productId)}`),
      { signal: controller.signal },
    )
      .then((analysis) => {
        if (!active) return
        analysisCache.current.set(productId, analysis)
        if (analysis) {
          setProducts((current) => current.map((product) => (
            String(product.id) === productId
              ? { ...product, analysis, priceHistory: analysis.priceHistory || product.priceHistory }
              : product
          )))
        }
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return
        console.error('Error loading product price history for inflation calculator', error)
        setHistoryError('No se pudo cargar el historial de precios.')
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (active) setHistoryLoading(false)
      })

    return () => {
      active = false
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [activeProductId])

  const history = useMemo(() => getPriceHistory(selectedProduct), [selectedProduct])
  const visibleHistory = useMemo(() => getHistoryForPeriod(history, period), [history, period])
  useEffect(() => {
    const rate = getVariation(visibleHistory)
    if (rate !== null) setVariation(rate.toFixed(1))
  }, [visibleHistory])
  const observedVariation = visibleHistory.length > 1
    ? getVariation(visibleHistory)
    : null
  const calculation = useMemo(() => {
    const initialAmount = Number(amount)
    const inflation = Number(variation)
    if (!Number.isFinite(initialAmount) || initialAmount < 0 || !Number.isFinite(inflation)) return null
    const updatedAmount = initialAmount * (1 + inflation / 100)
    return { initialAmount, inflation, updatedAmount, difference: updatedAmount - initialAmount }
  }, [amount, variation])

  const inputClass = 'w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-stone-700 dark:bg-stone-900 dark:text-white dark:focus:ring-sky-950'

  const selectProduct = (id) => {
    setSelectedProductId(id)
    setProductMenuOpen(false)
    const product = products.find((item) => String(item.id) === id)
    const productHistory = getHistoryForPeriod(getPriceHistory(product), period)
    const rate = getVariation(productHistory)
    setVariation(rate === null ? '0.0' : rate.toFixed(1))
    setHistoryError('')
  }

  const selectPeriod = (months) => {
    setPeriod(months)
    const periodHistory = getHistoryForPeriod(history, months)
    const rate = getVariation(periodHistory)
    if (rate !== null) setVariation(rate.toFixed(1))
  }

  const moveProductHighlight = (index) => {
    const nextIndex = Math.max(0, Math.min(index, products.length - 1))
    setHighlightedProductIndex(nextIndex)
    productOptionRefs.current[nextIndex]?.focus()
  }

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <BrandHeader>
          <Link to="/buscar" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-sky-700 dark:text-stone-300 dark:hover:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Volver a productos')}
          </Link>
        </BrandHeader>

        <section className="py-8 sm:py-10">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <Calculator className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">{t('Herramientas para ahorrar')}</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">{t('Calculadora de inflación')}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-400">
                {t('Explora cómo cambian los precios y estima el impacto en tu presupuesto.')}
              </p>
            </div>
          </div>
        </section>

        {productSearchError && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200" role="alert">
            <span>{t(productSearchError)}</span>
            <button
              type="button"
              onClick={() => setSearchRetryKey((current) => current + 1)}
              className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-800"
            >
              {t('Reintentar búsqueda')}
            </button>
          </div>
        )}
        {historyError && (
          <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100" role="status">
            {t(historyError)} {t('Se muestran los productos disponibles, pero su evolución puede no estar completa.')}
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            <div>
              <h2 className="font-black">{t('Elige un producto')}</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">{t('Consulta su historial de precios en comercios locales.')}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.65fr)]">
            <label className="relative block">
              <span className="sr-only">{t('Buscar producto')}</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
              <ClearableSearchInput
                type="text"
                value={searchQuery}
                clearLabel={t('Limpiar búsqueda')}
                onChange={(event) => setSearchQuery(event.target.value)}
                onClear={() => setSearchQuery('')}
                placeholder={t('Buscar producto...')}
                className={`${inputClass} pl-9`}
              />
            </label>
            <div className="relative min-w-0" ref={productMenuRef}>
              <span id="inflation-product-select-label" className="sr-only">{t('Seleccionar producto')}</span>
              <button
                type="button"
                aria-labelledby="inflation-product-select-label"
                aria-haspopup="listbox"
                aria-expanded={productMenuOpen}
                aria-controls="inflation-product-results"
                disabled={searchQuery.trim().length < PRODUCT_SEARCH_MIN_LENGTH || isSearchingProducts || products.length === 0}
                onClick={() => setProductMenuOpen((isOpen) => !isOpen)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && products.length) {
                    event.preventDefault()
                    setProductMenuOpen(true)
                    moveProductHighlight(0)
                  } else if (event.key === 'Escape') {
                    setProductMenuOpen(false)
                  }
                }}
                className={`${inputClass} flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-100`}
              >
                {selectedProduct ? (
                  <>
                    <span className="min-w-0 truncate">{translateProductName(selectedProduct.name)}</span>
                    <span className="shrink-0 font-bold text-sky-700 dark:text-sky-300">{currency.format(selectedProduct.currentPrice)}</span>
                  </>
                ) : (
                  <span className="min-w-0 truncate text-stone-500 dark:text-stone-400">
                    {isSearchingProducts
                      ? t('Buscando productos...')
                      : productSearchError
                        ? t('No se pudo completar la búsqueda')
                        : products.length
                          ? t('Selecciona un producto')
                          : searchQuery.trim().length < PRODUCT_SEARCH_MIN_LENGTH
                            ? t('Busca un producto')
                            : t('No se encontraron productos')}
                  </span>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-stone-500 transition-transform ${productMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {productMenuOpen && products.length > 0 && (
                <div
                  id="inflation-product-results"
                  role="listbox"
                  aria-labelledby="inflation-product-select-label"
                  className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-900"
                >
                  {products.map((product, index) => (
                    <div
                      key={product.id}
                      ref={(element) => { productOptionRefs.current[index] = element }}
                      role="option"
                      aria-selected={String(product.id) === selectedProductId}
                      tabIndex={0}
                      onClick={() => selectProduct(String(product.id))}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          event.preventDefault()
                          moveProductHighlight(index + 1)
                        } else if (event.key === 'ArrowUp') {
                          event.preventDefault()
                          if (index === 0) {
                            setProductMenuOpen(false)
                          } else {
                            moveProductHighlight(index - 1)
                          }
                        } else if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectProduct(String(product.id))
                        } else if (event.key === 'Escape') {
                          setProductMenuOpen(false)
                        }
                      }}
                      onFocus={() => setHighlightedProductIndex(index)}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-stone-800 hover:bg-sky-50 focus:bg-sky-50 focus:outline-none dark:text-stone-100 dark:hover:bg-stone-800 dark:focus:bg-stone-800 ${highlightedProductIndex === index ? 'bg-sky-50 dark:bg-stone-800' : ''}`}
                    >
                      <span className="min-w-0 truncate">{translateProductName(product.name)}</span>
                      <span className="shrink-0 text-right font-bold text-sky-700 dark:text-sky-300">{currency.format(product.currentPrice)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {isSearchingProducts && (
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400" role="status">
              {t('Buscando coincidencias en el catálogo...')}
            </p>
          )}
          {searchQuery.trim().length > 0 && searchQuery.trim().length < PRODUCT_SEARCH_MIN_LENGTH && (
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              {t('Escribe al menos 2 caracteres para buscar productos.')}
            </p>
          )}
          {historyLoading && (
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400" role="status">
              {t('Cargando el historial de precios del producto...')}
            </p>
          )}
          {selectedProduct && (
            <div className="mt-4 flex min-w-0 items-center gap-3 rounded-xl bg-stone-50 p-3 dark:bg-stone-800">
              {selectedProduct.image && <img src={selectedProduct.image} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain p-1 dark:bg-stone-700" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{translateProductName(selectedProduct.name)}</p>
                <div className="flex items-center gap-2">
                  {selectedProduct.brand ? (
                    <p className="text-xs text-stone-500 dark:text-stone-400">{selectedProduct.brand}</p>
                  ) : selectedProduct.primaryStore?.name ? (
                    <SupermarketLogo
                      name={selectedProduct.primaryStore.name}
                      image={selectedProduct.primaryStore.image}
                      className="h-7 max-w-16"
                    />
                  ) : (
                    <p className="text-xs text-stone-500 dark:text-stone-400">{t('Precio actual')}</p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-stone-500 dark:text-stone-400">{t('Precio actual')}</p>
                <p className="font-black text-sky-700 dark:text-sky-300">{currency.format(selectedProduct.currentPrice)}</p>
              </div>
            </div>
          )}
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
          <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-5">
            <div className="flex flex-col gap-4 border-b border-stone-100 pb-4 dark:border-stone-800 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">{t('Historial de precios')}</p>
                <h2 className="mt-1 text-lg font-black">{t('Variación del producto')}</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">{t('Observa cómo evolucionó su precio.')}</p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800" aria-label={t('Período del historial')}>
                {periods.map((option) => (
                  <button
                    key={option.months}
                    type="button"
                    aria-pressed={period === option.months}
                    onClick={() => selectPeriod(option.months)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${period === option.months ? 'bg-sky-600 text-white shadow-sm' : 'text-stone-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-700'}`}
                  >
                    {t(option.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className="my-4 grid grid-cols-3 gap-2 sm:gap-3">
              <div className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                <p className="text-[10px] text-stone-500 dark:text-stone-400">{t('Precio actual')}</p>
                <p className="mt-1 text-sm font-black sm:text-base">{selectedProduct ? currency.format(selectedProduct.currentPrice) : '—'}</p>
              </div>
              <div className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                <p className="text-[10px] text-stone-500 dark:text-stone-400">{t('Precio inicial')}</p>
                <p className="mt-1 text-sm font-black sm:text-base">{history.length ? currency.format(visibleHistory[0].price) : '—'}</p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
                <p className="text-[10px] text-sky-700 dark:text-sky-300">{t('Variación observada')}</p>
                <p className="mt-1 text-sm font-black text-sky-800 dark:text-sky-200">{observedVariation === null ? '—' : `${observedVariation > 0 ? '+' : ''}${observedVariation.toFixed(1)}%`}</p>
              </div>
            </div>

            <PriceHistoryChart points={visibleHistory} productName={selectedProduct?.name || t('producto')} language={language} t={t} />
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              {t('La variación de precios es una referencia basada en los registros disponibles; no representa un índice oficial de inflación.')}
            </p>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-700 via-blue-700 to-indigo-800 p-5 text-white shadow-lg dark:border-sky-900">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-sky-100" aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-100">{t('Proyecta tu presupuesto')}</p>
                  <h2 className="font-black">{t('¿Cuánto necesitas hoy?')}</h2>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-sky-100">{t('Estima cómo cambia tu monto con la variación acumulada del período.')}</p>

              <label htmlFor="inflation-amount" className="mb-1.5 mt-5 block text-xs font-bold text-sky-50">{t('Presupuesto actual')}</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-sky-200">$</span>
                <input
                  id="inflation-amount"
                  type="number"
                  min="0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-8 pr-3 text-sm font-semibold text-white outline-none placeholder:text-sky-200 focus:border-white/60 focus:ring-2 focus:ring-white/20"
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inflation-period" className="mb-1.5 block text-xs font-bold text-sky-50">{t('Período')}</label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-200" aria-hidden="true" />
                    <select id="inflation-period" value={period} onChange={(event) => selectPeriod(Number(event.target.value))} className="w-full appearance-none rounded-xl border border-white/20 bg-white/10 py-2.5 pl-9 pr-2 text-xs font-semibold text-white outline-none focus:border-white/60">
                      {periods.map((option) => <option key={option.months} value={option.months} className="text-stone-900">{t(option.label)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="inflation-rate" className="mb-1.5 block text-xs font-bold text-sky-50">{t('Variación')}</label>
                  <div className="relative">
                    <input id="inflation-rate" type="number" step="0.1" value={variation} onChange={(event) => setVariation(event.target.value)} className="w-full rounded-xl border border-white/20 bg-white/10 py-2.5 pl-3 pr-8 text-xs font-semibold text-white outline-none focus:border-white/60" />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-sky-200">%</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/20 bg-white/10 p-4">
                <p className="text-xs font-semibold text-sky-100">{t('Presupuesto proyectado')}</p>
                <p className="mt-1 text-3xl font-black tracking-tight">{calculation ? currency.format(calculation.updatedAmount) : '—'}</p>
                        <p className="mt-1 text-xs text-sky-100">{t(periods.find((option) => option.months === period)?.label || 'Período')} · {t('diferencia')} {calculation ? currency.format(calculation.difference) : '—'}</p>
              </div>

              <div className="mt-3 rounded-xl bg-white p-3 text-stone-800">
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500">{t('¿Qué significa?')}</p>
                <p className="mt-1 text-xs leading-5">
                  {t('Para mantener el poder de compra de ')}{calculation ? currency.format(calculation.initialAmount) : t('tu presupuesto')}{t(', necesitarías ')}{calculation ? currency.format(calculation.updatedAmount) : '—'}.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">{t('Registros recientes')}</p>
                  <h2 className="font-black">{t('Historial del producto')}</h2>
                </div>
                <CalendarDays className="h-4 w-4 text-stone-400" aria-hidden="true" />
              </div>
              {history.length ? (
                <ul className="space-y-2">
                  {[...visibleHistory].reverse().slice(0, 4).map((point, index) => (
                    <li key={`${point.date}-${index}`} className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2 last:border-0 last:pb-0 dark:border-stone-800">
                      <span className="truncate text-xs text-stone-500 dark:text-stone-400">{point.date ? formatHistoryDate(point.date, language) : t('Registro de precio')}</span>
                      <span className="shrink-0 text-sm font-bold">{currency.format(point.price)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-500 dark:text-stone-400">{t('Aún no hay registros de precios disponibles.')}</p>
              )}
            </section>

            <Link
              to={selectedProduct ? `/buscar?q=${encodeURIComponent(selectedProduct.name)}` : '/buscar'}
              className="flex items-center justify-between gap-3 rounded-xl bg-stone-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-sky-800 dark:bg-sky-950 dark:hover:bg-sky-900"
            >
              <span>{t('Encontrá un mejor precio')}</span>
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </div>
    </main>
  )
}
