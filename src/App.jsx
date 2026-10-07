import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  SlidersHorizontal,
  ChevronRight,
  RotateCcw,
  ArrowLeft,
  TrendingDown,
  Tag,
  ThumbsUp,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Percent,
  Heart,
} from 'lucide-react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'

import { useSelectedCity } from './contexts/SelectedCityContext.jsx'
import { Header } from './components/Header.jsx'
import { CategorySelectionPage } from './components/CategorySelectionPage.jsx'
import { HeroCategoryGrid } from './components/HeroCategoryGrid.jsx'
import { DealsSummaryBanner } from './components/DealsSummaryBanner.jsx'
import { ReportPriceModal } from './components/ReportPriceModal.jsx'
import { ProductCard } from './components/ProductCard.jsx'
import { ComparisonModal } from './components/ComparisonModal.jsx'
import { SmartBasketModal } from './components/SmartBasketModal.jsx'
import PriceExplanationModal from './components/PriceExplanationModal.jsx'

import Admin from './pages/Admin'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'

import { MOCK_PRODUCTS, CATEGORIES as MOCK_CATEGORIES } from './data/mockProducts.js'
import { apiFetch } from './config/api.js'
import { getTotalPages, getVisiblePageNumbers } from './utils/pagination.js'
import { appendUniqueProducts, buildProductsQuery } from './utils/catalogQuery.js'
import { isValidCatalogProduct } from './utils/validCatalogProducts.js'

const PAGE_SIZE = 20

function MainCatalog() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedCity } = useSelectedCity()

  // Referencias y caches
  const catalogReferenceCache = useRef(null)
  const analysisCache = useRef(null)
  const sortMenuRef = useRef(null)

  // Estados principales
  const [categories, setCategories] = useState([])
  const [taxonomy, setTaxonomy] = useState([])
  const [supermarkets, setSupermarkets] = useState([])
  const [storesList, setStoresList] = useState([])

  const [products, setProducts] = useState([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)

  // Modales
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showSmartBasket, setShowSmartBasket] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showPriceExplanation, setShowPriceExplanation] = useState(false)

  // Filtros y paginación
  const [filters, setFilters] = useState({
    searchQuery: '',
    category: '',
    store: 'todos',
  })
  const [sortBy, setSortBy] = useState('default')
  const [productsPage, setProductsPage] = useState(1)
  const [productsPageSize, setProductsPageSize] = useState(PAGE_SIZE)
  const [totalPages, setTotalPages] = useState(1)

  // Favoritos e Historial de Búsqueda
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('arprice_search_history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('arprice_favorites')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Carga de Referencias y Productos con Análisis de Precios
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()

    async function loadData() {
      setIsLoadingProducts(true)
      try {
        const baseQuery = {
          searchQuery: filters.searchQuery,
          category: filters.category,
          store: filters.store,
          city: selectedCity,
          page: productsPage,
          limit: productsPageSize,
        }

        const referencesPromise = catalogReferenceCache.current
          ? Promise.resolve(catalogReferenceCache.current)
          : Promise.all([
              apiFetch('/categories', { signal: controller.signal }),
              apiFetch('/taxonomy', { signal: controller.signal }),
              apiFetch('/supermarkets', { signal: controller.signal }),
            ]).then(([categoriesRes, taxonomyRes, supermarketsRes]) => {
              const refs = {
                categories: Array.isArray(categoriesRes) ? categoriesRes : categoriesRes?.categories || [],
                taxonomy: Array.isArray(taxonomyRes) ? taxonomyRes : taxonomyRes?.taxonomy || [],
                supermarkets: Array.isArray(supermarketsRes) ? supermarketsRes : supermarketsRes?.supermarkets || [],
              }
              catalogReferenceCache.current = refs
              return refs
            })

        const [productsRes, references] = await Promise.all([
          apiFetch(`/products?${buildProductsQuery(baseQuery)}`, { signal: controller.signal }),
          referencesPromise,
        ])

        if (!mounted) return

        const { categories: cats, taxonomy: taxonomyData, supermarkets } = references
        const supermarketImages = new Map((supermarkets || []).map((s) => [s.name, s.image]))

        // Cache de análisis
        if (!analysisCache.current && !filters.searchQuery.trim()) {
          try {
            const analysisRes = await apiFetch('/analysis/products', { signal: controller.signal })
            analysisCache.current = Array.isArray(analysisRes) ? analysisRes : []
          } catch {
            analysisCache.current = []
          }
        }

        const analyses = analysisCache.current || []
        const analysisByProduct = new Map(analyses.map((item) => [String(item.product?.id), item]))

        const rawProducts = Array.isArray(productsRes) ? productsRes : productsRes?.data || productsRes?.products || []
        const calcTotalPages = productsRes?.totalPages || getTotalPages(productsRes?.total || rawProducts.length, productsPageSize)

        setTotalPages(calcTotalPages)

        const enrichProducts = (list) =>
          list
            .filter(isValidCatalogProduct)
            .map((p) => {
              const offers = p.offers || []
              const otherStores = offers.map((o) => ({
                id: o.id,
                price: Number(o.cash_price ?? o.cashPrice ?? o.price) || 0,
                supermarket: o.supermarket || o.supermarket_name || o.storeName || '',
                image: supermarketImages.get(o.supermarket || o.supermarket_name || o.storeName) || '',
              }))

              const primary = otherStores.reduce((best, s) => {
                if (!best) return s
                return s.price && s.price < best.price ? s : best
              }, null)

              const avgMarketPrice = otherStores.length
                ? Math.round(otherStores.reduce((acc, s) => acc + (s.price || 0), 0) / otherStores.length)
                : 0
              const currentPrice = primary ? primary.price : Number(p.price || p.currentPrice) || 0
              const percentageDiff = avgMarketPrice
                ? parseFloat((((currentPrice - avgMarketPrice) / avgMarketPrice) * 100).toFixed(1))
                : 0

              const analysis = analysisByProduct.get(String(p.id))
              const status = analysis?.classification
                ? analysis.classification === 'PRECIO_NORMAL'
                  ? 'EN_PRECIO'
                  : analysis.classification
                : primary
                ? currentPrice <= avgMarketPrice
                  ? 'EN_PRECIO'
                  : 'INFLADO'
                : 'EN_PRECIO'

              return {
                ...p,
                brand: p.brand || p.brands?.name || '',
                subcategory: p.subcategory || p.subcategories?.name || '',
                currentPrice,
                primaryStore: primary ? { name: primary.supermarket, id: primary.id } : { name: '', id: null },
                avgMarketPrice,
                percentageDiff,
                status,
                analysis: analysis || null,
                priceHistory: analysis?.priceHistory || p.priceHistory || [],
                otherStores,
                unit: p.unit || '',
              }
            })

        setCategories(cats.length ? cats : MOCK_CATEGORIES)
        setTaxonomy(taxonomyData)
        setSupermarkets(supermarkets)
        setProducts(enrichProducts(rawProducts))

        // Extraer lista única de supermercados
        const storesSet = new Set()
        rawProducts.forEach((p) => {
          (p.offers || []).forEach((o) => {
            if (o.supermarket) storesSet.add(o.supermarket)
          })
        })
        setStoresList(Array.from(storesSet).map((name) => ({ id: name, name, image: supermarketImages.get(name) || '' })))
      } catch (error) {
        if (!mounted) return
        console.error('Error cargando catálogo:', error)

        // Respaldo Mock
        const mockEnriched = MOCK_PRODUCTS.filter(isValidCatalogProduct).map((p) => ({
          ...p,
          currentPrice: Number(p.currentPrice || p.price || 0),
          avgMarketPrice: Number(p.avgMarketPrice || 0),
          percentageDiff: Number(p.percentageDiff || 0),
          status: p.status || 'EN_PRECIO',
          primaryStore: p.primaryStore || { name: '', id: null },
          otherStores: Array.isArray(p.otherStores) ? p.otherStores : [],
        }))

        setCategories(MOCK_CATEGORIES)
        setProducts(mockEnriched)
      } finally {
        if (mounted) setIsLoadingProducts(false)
      }
    }

    loadData()

    return () => {
      mounted = false
      controller.abort()
    }
  }, [filters, productsPage, productsPageSize, selectedCity, catalogRefreshKey])

  // Persistencia de Favoritos
  useEffect(() => {
    try {
      localStorage.setItem('arprice_favorites', JSON.stringify(favorites))
    } catch (e) {
      console.error('Error guardando favoritos', e)
    }
  }, [favorites])

  // Cerrar menú orden al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setShowSortMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtrado y Ordenamiento local de productos
  const filteredProducts = useMemo(() => {
    let result = [...products]

    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.brand?.toLowerCase().includes(query) ||
          p.category?.toLowerCase().includes(query)
      )
    }

    if (filters.category) {
      const cat = filters.category.toLowerCase()
      result = result.filter(
        (p) => p.category?.toLowerCase() === cat || p.category_name?.toLowerCase() === cat
      )
    }

    if (filters.store && filters.store !== 'todos') {
      const store = filters.store.toLowerCase()
      result = result.filter((p) =>
        p.otherStores?.some((o) => o.supermarket?.toLowerCase() === store)
      )
    }

    // Ordenamiento
    if (sortBy === 'name-asc') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
    } else if (sortBy === 'price-asc') {
      result.sort((a, b) => (a.currentPrice || 0) - (b.currentPrice || 0))
    } else if (sortBy === 'price-desc') {
      result.sort((a, b) => (b.currentPrice || 0) - (a.currentPrice || 0))
    } else if (sortBy === 'discount') {
      result.sort((a, b) => (b.percentageDiff || 0) - (a.percentageDiff || 0))
    }

    return result
  }, [products, filters, sortBy])

  // Manejadores
  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const query = String(form.get('search') || '').trim()

    setFilters((prev) => ({ ...prev, searchQuery: query }))
    setProductsPage(1)

    if (query && !searchHistory.includes(query)) {
      const updated = [query, ...searchHistory].slice(0, 5)
      setSearchHistory(updated)
      localStorage.setItem('arprice_search_history', JSON.stringify(updated))
    }
  }

  const toggleFavorite = (product) => {
    const id = product.id ?? product.product_id ?? product.name
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((favId) => favId !== id) : [...prev, id]
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header
        onOpenSmartBasket={() => setShowSmartBasket(true)}
        onOpenReportModal={() => setShowReportModal(true)}
        favoritesCount={favorites.length}
      />

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        <DealsSummaryBanner />
        <HeroCategoryGrid
          categories={categories}
          selectedCategory={filters.category}
          onSelectCategory={(catName) => {
            setFilters((prev) => ({ ...prev, category: catName }))
            setProductsPage(1)
          }}
        />

        {/* BARRA DE FILTROS Y BÚSQUEDA */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              name="search"
              defaultValue={filters.searchQuery}
              placeholder="Buscar productos, marcas..."
              className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </form>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              <SlidersHorizontal size={16} />
              <span>Filtros</span>
            </button>

            {/* Selector de Orden */}
            <div className="relative" ref={sortMenuRef}>
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                <ArrowDownWideNarrow size={16} />
                <span>Ordenar</span>
                <ChevronDown size={14} />
              </button>

              {showSortMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border p-1 z-20 text-sm">
                  <button
                    onClick={() => { setSortBy('default'); setShowSortMenu(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded"
                  >
                    Relevancia
                  </button>
                  <button
                    onClick={() => { setSortBy('price-asc'); setShowSortMenu(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded"
                  >
                    Menor precio
                  </button>
                  <button
                    onClick={() => { setSortBy('price-desc'); setShowSortMenu(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded"
                  >
                    Mayor precio
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GRILLA DE PRODUCTOS */}
        {isLoadingProducts ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border">
            <AlertTriangle className="mx-auto text-amber-500 mb-2" size={32} />
            <p className="text-gray-600">No se encontraron productos con los filtros aplicados.</p>
            <button
              onClick={() => setFilters({ searchQuery: '', category: '', store: 'todos' })}
              className="mt-4 text-sm font-semibold text-green-600 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id || product.name}
                product={product}
                isFavorite={favorites.includes(product.id ?? product.product_id ?? product.name)}
                onToggleFavorite={() => toggleFavorite(product)}
                onClick={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        )}

        {/* PAGINACIÓN */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 pt-6">
            {getVisiblePageNumbers(productsPage, totalPages).map((p, idx) =>
              p === '...' ? (
                <span key={idx} className="px-2 text-gray-400">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => setProductsPage(p)}
                  className={`px-3 py-1 text-sm rounded-md border ${
                    productsPage === p ? 'bg-green-600 text-white border-green-600' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              )
            )}
          </div>
        )}
      </main>

      {/* MODALES */}
      {selectedProduct && (
        <ComparisonModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onOpenExplanation={() => setShowPriceExplanation(true)}
        />
      )}

      {showSmartBasket && (
        <SmartBasketModal onClose={() => setShowSmartBasket(false)} />
      )}

      {showReportModal && (
        <ReportPriceModal onClose={() => setShowReportModal(false)} />
      )}

      {showPriceExplanation && selectedProduct && (
        <PriceExplanationModal
          product={selectedProduct}
          onClose={() => setShowPriceExplanation(false)}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MainCatalog />} />
      <Route path="/categories" element={<CategorySelectionPage />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute>
            <Admin />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
