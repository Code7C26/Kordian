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

<<<<<<< HEAD
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
=======
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectedCity } from './contexts/SelectedCityContext.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Header.jsx';
import { CategorySelectionPage } from './components/CategorySelectionPage.jsx';
import { HeroCategoryGrid } from './components/HeroCategoryGrid.jsx';
import { DealsSummaryBanner } from './components/DealsSummaryBanner.jsx';
import { ReportPriceModal } from './components/ReportPriceModal.jsx';
import { ProductCard } from './components/ProductCard.jsx';
import { ComparisonModal } from './components/ComparisonModal.jsx';
import { SmartBasketModal } from './components/SmartBasketModal.jsx';
import PriceExplanationModal from './components/PriceExplanationModal.jsx';
import { MOCK_PRODUCTS, CATEGORIES as MOCK_CATEGORIES } from './data/mockProducts.js';
import { apiFetch } from './config/api.js';
import { getTotalPages, getVisiblePageNumbers } from './utils/pagination.js';
import { appendUniqueProducts, buildProductsQuery } from './utils/catalogQuery.js';
import { isValidCatalogProduct } from './utils/validCatalogProducts.js';
// Data will be loaded from backend API
import { Search, SlidersHorizontal, ChevronRight, RotateCcw, ArrowLeft, TrendingDown, Tag, ThumbsUp, AlertTriangle, Loader2, ChevronDown, ArrowDownAZ, ArrowDownWideNarrow, ArrowUpWideNarrow, Percent } from 'lucide-react';
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244

import Admin from './pages/Admin'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'

import { SelectedCityProvider } from './contexts/SelectedCityContext.jsx'

import { MOCK_PRODUCTS, MOCK_CATEGORIES } from './data/mockData'
import { apiFetch } from './config/api'
import { getTotalPages } from './utils/pagination'
import { buildCatalogQuery } from './utils/catalogQuery'
import { validCatalogProduct } from './utils/validCatalogProduct'


const PAGE_SIZE = 20


function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const [categories, setCategories] = useState([])
  const [taxonomy, setTaxonomy] = useState([])
  const [supermarkets, setSupermarkets] = useState([])

  const [products, setProducts] = useState([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
<<<<<<< HEAD

  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)

  const [filters, setFilters] = useState({
    searchQuery: '',
    category: '',
    store: '',
  })

  const [sortBy, setSortBy] = useState('default')
  const [productsPageSize, setProductsPageSize] = useState(PAGE_SIZE)

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showSortMenu, setShowSortMenu] = useState(false)

  const [favorites, setFavorites] = useState(() => {
=======
<<<<<<< HEAD
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)
=======
>>>>>>> origin/main
  const catalogReferenceCache = useRef(null)
  const analysisCache = useRef(null)
  const [productsPage, setProductsPage] = useState(1)
  const productsPageSize = 20
  const initialSearchParams = new URLSearchParams(location.search)
  const [searchHistory, setSearchHistory] = useState(() => {
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244
    try {
      const saved = localStorage.getItem('arprice_favorites')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const sortMenuRef = useRef(null)

  /*
   * Cargar referencias:
   * categorías, taxonomía y supermercados.
   */
  useEffect(() => {
    let cancelled = false

<<<<<<< HEAD
    async function loadReferences() {
=======
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('arprice_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [basket, setBasket] = useState(() => {
    try {
      const saved = localStorage.getItem('arprice_basket');
      return saved
        ? JSON.parse(saved)
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('arprice_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('arprice_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('arprice_basket', JSON.stringify(basket));
  }, [basket]);

  useEffect(() => {
    if (productsPage !== 1) {
      setProductsPage(1);
    }
  }, [filters.searchQuery, filters.category, filters.store]);

  useEffect(() => {
    const handleReviewDecisionUpdated = () => {
      catalogReferenceCache.current = null
      setCatalogRefreshKey((previous) => previous + 1)
      setProductsPage(1)
    }

    window.addEventListener('arprice:review-decision-updated', handleReviewDecisionUpdated)
    return () => window.removeEventListener('arprice:review-decision-updated', handleReviewDecisionUpdated)
  }, [])

  // Load categories and products from backend
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    let searchTimer
    setIsLoadingProducts(true)
    const loadData = async () => {
      let hasLoadedCatalog = false
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244
      try {
        const [categoriesResponse, taxonomyResponse, supermarketsResponse] =
          await Promise.all([
            apiFetch('/categories', { method: 'GET' }),
            apiFetch('/taxonomy', { method: 'GET' }),
            apiFetch('/supermarkets', { method: 'GET' }),
          ])

        if (cancelled) return

        setCategories(
          Array.isArray(categoriesResponse)
            ? categoriesResponse
            : categoriesResponse?.categories || []
        )

        setTaxonomy(
          Array.isArray(taxonomyResponse)
            ? taxonomyResponse
            : taxonomyResponse?.taxonomy || []
        )

        setSupermarkets(
          Array.isArray(supermarketsResponse)
            ? supermarketsResponse
            : supermarketsResponse?.supermarkets || []
        )
      } catch (error) {
        console.error('Error cargando referencias:', error)

        if (!cancelled) {
          setCategories(MOCK_CATEGORIES)
          setTaxonomy([])
          setSupermarkets([])
        }
      }
    }

    loadReferences()

    return () => {
      cancelled = true
    }
  }, [catalogRefreshKey])


  /*
   * Cargar productos.
   */
  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      setIsLoadingProducts(true)

      try {
        const query = buildCatalogQuery({
          searchQuery: filters.searchQuery,
          category: filters.category,
<<<<<<< HEAD
          store: filters.store,
          page: 1,
          limit: productsPageSize,
        })

        const response = await apiFetch(`/products?${query}`, {
          method: 'GET',
        })
=======
          store: 'todos',
        }

        const referencesPromise = catalogReferenceCache.current
          ? Promise.resolve(catalogReferenceCache.current)
          : Promise.all([
<<<<<<< HEAD
            apiFetch('/categories', { signal: controller.signal }),
            apiFetch('/taxonomy', { signal: controller.signal }),
            apiFetch('/supermarkets', { signal: controller.signal }),
=======
            fetch(apiUrl('/categories'), { signal: controller.signal }),
            fetch(apiUrl('/taxonomy'), { signal: controller.signal }),
            fetch(apiUrl('/supermarkets'), { signal: controller.signal }),
>>>>>>> origin/main
          ]).then(async ([categoriesResponse, taxonomyResponse, supermarketsResponse]) => {
            const references = {
              categories: categoriesResponse.ok ? await categoriesResponse.json() : [],
              taxonomy: taxonomyResponse.ok ? await taxonomyResponse.json() : [],
              supermarkets: supermarketsResponse.ok ? await supermarketsResponse.json() : [],
            }
            catalogReferenceCache.current = references
            return references
          })
        const [firstPageRes, references] = await Promise.all([
<<<<<<< HEAD
          apiFetch(`/products?${buildProductsQuery(baseQuery).toString()}`, { signal: controller.signal }),
=======
          fetch(apiUrl(`/products?${buildProductsQuery(baseQuery).toString()}`), { signal: controller.signal }),
>>>>>>> origin/main
          referencesPromise,
        ])
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244

        if (cancelled) return

        const firstPageProducts = Array.isArray(response)
          ? response
          : response?.products || response?.data || []

<<<<<<< HEAD
        const totalPages =
          response?.totalPages ||
          response?.pagination?.totalPages ||
          getTotalPages(
            response?.total ||
            response?.pagination?.total ||
            firstPageProducts.length,
            productsPageSize
          )

        let allProducts = [...firstPageProducts]
=======
        const firstPagePayload = await firstPageRes.json()
        const firstPageData = Array.isArray(firstPagePayload) ? firstPagePayload : firstPagePayload.data || []
        const firstPageTotal = Array.isArray(firstPagePayload)
          ? firstPageData.length
          : Number(firstPagePayload.total || firstPageData.length || 0)
        const totalPagesToFetch = Math.max(1, Math.ceil(firstPageTotal / requestPageSize))
<<<<<<< HEAD
        const { categories: cats, taxonomy: taxonomyData, supermarkets } = references
        const supermarketImages = new Map((supermarkets || []).map((supermarket) => [supermarket.name, supermarket.image]))
=======
        const pageNumbers = Array.from({ length: totalPagesToFetch }, (_, index) => index + 1)
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244

        /*
         * Si la API devuelve varias páginas, las cargamos.
         */
        const totalPagesToFetch = Math.max(1, Number(totalPages) || 1)

        for (
          let pageNumber = 2;
          pageNumber <= totalPagesToFetch;
          pageNumber += 1
        ) {
          if (cancelled) return

          try {
            const pageQuery = buildCatalogQuery({
              searchQuery: filters.searchQuery,
              category: filters.category,
              store: filters.store,
              page: pageNumber,
              limit: productsPageSize,
            })

            const pageResponse = await apiFetch(`/products?${pageQuery}`, {
              method: 'GET',
            })

            const pageProducts = Array.isArray(pageResponse)
              ? pageResponse
              : pageResponse?.products || pageResponse?.data || []

            if (Array.isArray(pageProducts)) {
              allProducts = [...allProducts, ...pageProducts]
            }
<<<<<<< HEAD
          } catch (pageError) {
            console.error(
              `Error cargando página ${pageNumber}:`,
              pageError
            )
=======

            return response.json()
          })
        )

        const pagePayloads = [firstPagePayload, ...remainingPageResponses]
        const allProductsFromApi = pagePayloads.flatMap((payload) => {
          const pageData = Array.isArray(payload) ? payload : payload?.data || []
          return Array.isArray(pageData) ? pageData : []
        })
        const validProds = allProductsFromApi.filter((product) => isValidCatalogProduct(product))

        const { categories: cats, taxonomy: taxonomyData, supermarkets } = references
        const supermarketImages = new Map((supermarkets || []).map((supermarket) => [supermarket.name, supermarket.image]))
        if (!analysisCache.current && !filters.searchQuery.trim()) {
          const analysisRes = await fetch(apiUrl('/analysis/products'), { signal: controller.signal })
          analysisCache.current = analysisRes.ok ? await analysisRes.json() : []
        }
>>>>>>> origin/main
        const analyses = analysisCache.current || []
        const analysisByProduct = new Map((analyses || []).map((item) => [String(item.product?.id), item]))

        const enrichProducts = (productsToEnrich) => productsToEnrich
          .filter((product) => isValidCatalogProduct(product))
          .map((p) => {
          const offers = p.offers || []
          const otherStores = offers.map((o) => ({
            id: o.id,
            // handle either snake_case (cash_price) or camelCase (cashPrice) coming from different imports
            price: Number(o.cash_price ?? o.cashPrice) || 0,
            supermarket: o.supermarket || o.supermarket_name || o.storeName || '',
            image: supermarketImages.get(o.supermarket || o.supermarket_name || o.storeName) || ''
          }))
          const primary = otherStores.reduce((best, s) => {
            if (!best) return s
            return s.price && s.price < best.price ? s : best
          }, null)
          const avgMarketPrice = otherStores.length ? Math.round(otherStores.reduce((acc, s) => acc + (s.price || 0), 0) / otherStores.length) : 0
          const currentPrice = primary ? primary.price : 0
          const percentageDiff = avgMarketPrice ? parseFloat((((currentPrice - avgMarketPrice) / avgMarketPrice) * 100).toFixed(1)) : 0
          const status = primary
            ? currentPrice <= avgMarketPrice
              ? 'EN_PRECIO'
              : 'INFLADO'
            : 'EN_PRECIO'

          const analysis = analysisByProduct.get(String(p.id))
          const analysisStatus = analysis?.classification === 'PRECIO_NORMAL' ? 'EN_PRECIO' : analysis?.classification

          return {
            ...p,
            brand: p.brand || p.brands?.name || '',
            subcategory: p.subcategory || p.subcategories?.name || '',
            currentPrice,
            primaryStore: primary ? { name: primary.supermarket, id: primary.id } : { name: '', id: null },
            avgMarketPrice,
            percentageDiff,
            status: analysisStatus || status,
            analysis: analysis || null,
            priceHistory: analysis?.priceHistory || p.priceHistory || [],
            otherStores,
            unit: p.unit || '',
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244
          }
        }

<<<<<<< HEAD
        /*
         * Validamos los productos antes de mostrarlos.
         */
        const validProducts = allProducts.filter(validCatalogProduct)

        if (!cancelled) {
          setProducts(validProducts)
        }
      } catch (error) {
        console.error('Error cargando productos:', error)

        if (!cancelled) {
          /*
           * Como respaldo usamos los productos mock.
           * Esto evita que la aplicación quede completamente vacía
           * si la API está temporalmente caída.
           */
          setProducts(
            Array.isArray(MOCK_PRODUCTS)
              ? MOCK_PRODUCTS.filter(validCatalogProduct)
              : []
          )
        }
=======
        const populatedTaxonomy = (taxonomyData || [])
          .map((category) => ({
            ...category,
            subcategories: (category.subcategories || []).filter((subcategory) => Number(subcategory.productCount || 0) > 0),
          }))
          .filter((category) => Number(category.productCount || 0) > 0)
        const populatedCategoryIds = new Set(populatedTaxonomy.map((category) => String(category.id)))
        setCategories((cats || []).filter((category) => populatedCategoryIds.has(String(category.id))))
        setTaxonomy(populatedTaxonomy)
        setProducts(enrichProducts(firstPageData))
        setIsLoadingProducts(false)
        hasLoadedCatalog = true

        const storesSet = new Set()
        const addStoreOptions = (productRows) => {
          productRows.forEach((product) => {
            (product.offers || []).forEach((offer) => {
              if (offer.supermarket) storesSet.add(offer.supermarket)
            })
          })
          const storesArr = Array.from(storesSet).map((name) => ({ id: name, name, image: supermarketImages.get(name) || '' }))
          setStoresList(storesArr)
        }
        addStoreOptions(firstPageData)

        for (let pageNumber = 2; pageNumber <= totalPagesToFetch; pageNumber += 1) {
          const pageQuery = buildProductsQuery({ ...baseQuery, page: pageNumber, limit: requestPageSize })
          const response = await apiFetch(`/products?${pageQuery.toString()}`, { signal: controller.signal })
          if (!response.ok) throw new Error('Backend returned non-ok response')
          const pagePayload = await response.json()
          const pageData = Array.isArray(pagePayload) ? pagePayload : pagePayload?.data || []
          if (!mounted) return
          setProducts((current) => appendUniqueProducts(current, enrichProducts(pageData)))
          addStoreOptions(pageData)
        }
      } catch (err) {
        console.error('Error loading data', err)
        if (!mounted) return
        if (hasLoadedCatalog) return

        const enriched = MOCK_PRODUCTS.map((p) => ({
          ...p,
          currentPrice: Number(p.currentPrice || 0),
          avgMarketPrice: Number(p.avgMarketPrice || 0),
          percentageDiff: Number(p.percentageDiff || 0),
          status: p.status || 'EN_PRECIO',
          primaryStore: p.primaryStore || { name: '', id: null },
          otherStores: Array.isArray(p.otherStores) ? p.otherStores : [],
        }))

        setCategories(MOCK_CATEGORIES)
        setProducts(enriched)

        const storesSet = new Set()
        enriched.forEach((p) => {
          (p.otherStores || []).forEach((o) => {
            if (o.storeName) storesSet.add(o.storeName)
          })
          if (p.primaryStore?.name) storesSet.add(p.primaryStore.name)
        })

        const storesArr = Array.from(storesSet).map((name) => ({ id: name, name }))
        setStoresList(storesArr)
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244
      } finally {
        if (!cancelled) {
          setIsLoadingProducts(false)
        }
      }
    }

    loadProducts()

    return () => {
      cancelled = true
    }
<<<<<<< HEAD
  }, [
    productsPageSize,
    filters.searchQuery,
    filters.category,
    filters.store,
    catalogRefreshKey,
  ])
=======
<<<<<<< HEAD
  }, [productsPageSize, filters.searchQuery, filters.category, filters.store, catalogRefreshKey])
=======
  }, [productsPageSize, filters.searchQuery, filters.category, filters.store])
>>>>>>> origin/main
>>>>>>> 8c44b14f0ef402c7dd129023baf41b6aecca7244


  /*
   * Guardar favoritos.
   */
  useEffect(() => {
    try {
      localStorage.setItem(
        'arprice_favorites',
        JSON.stringify(favorites)
      )
    } catch (error) {
      console.error('No se pudieron guardar favoritos:', error)
    }
  }, [favorites])


  /*
   * Cerrar menú de ordenamiento cuando se hace click afuera.
   */
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(event.target)
      ) {
        setShowSortMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])


  /*
   * Mapa de imágenes de supermercados.
   */
  const supermarketImages = useMemo(() => {
    return new Map(
      (supermarkets || []).map((supermarket) => [
        supermarket.name,
        supermarket.image,
      ])
    )
  }, [supermarkets])


  /*
   * Productos filtrados y ordenados.
   */
  const filteredProducts = useMemo(() => {
    let result = [...products]

    if (filters.searchQuery.trim()) {
      const search = filters.searchQuery.toLowerCase().trim()

      result = result.filter((product) => {
        const name = String(product.name || '').toLowerCase()
        const brand = String(product.brand || '').toLowerCase()
        const category = String(product.category || '').toLowerCase()

        return (
          name.includes(search) ||
          brand.includes(search) ||
          category.includes(search)
        )
      })
    }

    if (filters.category) {
      const selectedCategory = filters.category.toLowerCase()

      result = result.filter((product) => {
        return (
          String(product.category || '').toLowerCase() ===
            selectedCategory ||
          String(product.category_name || '').toLowerCase() ===
            selectedCategory
        )
      })
    }

    if (filters.store) {
      const selectedStore = filters.store.toLowerCase()

      result = result.filter((product) => {
        const offers = Array.isArray(product.offers)
          ? product.offers
          : []

        return offers.some((offer) => {
          const supermarket = String(
            offer.supermarket ||
              offer.supermarket_name ||
              offer.store ||
              ''
          ).toLowerCase()

          return supermarket === selectedStore
        })
      })
    }

    /*
     * Ordenamiento.
     */
    if (sortBy === 'name-asc') {
      result.sort((a, b) =>
        String(a.name || '').localeCompare(
          String(b.name || ''),
          'es'
        )
      )
    }

    if (sortBy === 'price-asc') {
      result.sort((a, b) => {
        const priceA = getProductPrice(a)
        const priceB = getProductPrice(b)

        return priceA - priceB
      })
    }

    if (sortBy === 'price-desc') {
      result.sort((a, b) => {
        const priceA = getProductPrice(a)
        const priceB = getProductPrice(b)

        return priceB - priceA
      })
    }

    if (sortBy === 'discount') {
      result.sort((a, b) => {
        const discountA = getProductDiscount(a)
        const discountB = getProductDiscount(b)

        return discountB - discountA
      })
    }

    return result
  }, [products, filters, sortBy])


  /*
   * Categorías disponibles.
   */
  const availableCategories = useMemo(() => {
    if (Array.isArray(categories) && categories.length > 0) {
      return categories
    }

    if (Array.isArray(taxonomy) && taxonomy.length > 0) {
      return taxonomy
    }

    return MOCK_CATEGORIES || []
  }, [categories, taxonomy])


  /*
   * Supermercados disponibles.
   */
  const availableSupermarkets = useMemo(() => {
    if (Array.isArray(supermarkets) && supermarkets.length > 0) {
      return supermarkets
    }

    const stores = new Set()

    products.forEach((product) => {
      const offers = Array.isArray(product.offers)
        ? product.offers
        : []

      offers.forEach((offer) => {
        const name =
          offer.supermarket ||
          offer.supermarket_name ||
          offer.store

        if (name) {
          stores.add(name)
        }
      })
    })

    return Array.from(stores).map((name) => ({
      name,
      image: supermarketImages.get(name),
    }))
  }, [supermarkets, products, supermarketImages])


  function handleSearch(event) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const searchValue = String(
      formData.get('search') || ''
    ).trim()

    setFilters((previous) => ({
      ...previous,
      searchQuery: searchValue,
    }))
  }


  function handleSearchChange(event) {
    setFilters((previous) => ({
      ...previous,
      searchQuery: event.target.value,
    }))
  }


  function handleCategoryChange(event) {
    setFilters((previous) => ({
      ...previous,
      category: event.target.value,
    }))
  }


  function handleStoreChange(event) {
    setFilters((previous) => ({
      ...previous,
      store: event.target.value,
    }))
  }


  function clearFilters() {
    setFilters({
      searchQuery: '',
      category: '',
      store: '',
    })

    setSortBy('default')
  }


  function toggleFavorite(product) {
    if (!product) return

    const productId =
      product.id ??
      product.product_id ??
      product.name

    setFavorites((previous) => {
      const exists = previous.some(
        (id) => String(id) === String(productId)
      )

      if (exists) {
        return previous.filter(
          (id) => String(id) !== String(productId)
        )
      }

      return [...previous, productId]
    })
  }


  function isFavorite(product) {
    if (!product) return false

    const productId =
      product.id ??
      product.product_id ??
      product.name

    return favorites.some(
      (id) => String(id) === String(productId)
    )
  }


  function handleProductClick(product) {
    setSelectedProduct(product)
  }


  function closeProduct() {
    setSelectedProduct(null)
  }


  function getOfferPrice(offer) {
    if (!offer) return Infinity

    const possiblePrices = [
      offer.cash_price,
      offer.price,
      offer.current_price,
      offer.installment_price,
    ]

    for (const price of possiblePrices) {
      const numericPrice = Number(
        String(price ?? '')
          .replace(/\$/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
      )

      if (Number.isFinite(numericPrice) && numericPrice > 0) {
        return numericPrice
      }
    }

    return Infinity
  }


  function getProductPrice(product) {
    if (!product) return Infinity

    const directPrices = [
      product.price,
      product.cash_price,
      product.current_price,
      product.min_price,
    ]

    for (const price of directPrices) {
      const numericPrice = Number(
        String(price ?? '')
          .replace(/\$/g, '')
          .replace(/\./g, '')
          .replace(',', '.')
      )

      if (Number.isFinite(numericPrice) && numericPrice > 0) {
        return numericPrice
      }
    }

    if (Array.isArray(product.offers)) {
      const prices = product.offers
        .map(getOfferPrice)
        .filter(Number.isFinite)

      if (prices.length > 0) {
        return Math.min(...prices)
      }
    }

    return Infinity
  }


  function getProductDiscount(product) {
    if (!product) return 0

    const possibleDiscounts = [
      product.discount,
      product.discount_percentage,
      product.discountPercent,
    ]

    for (const discount of possibleDiscounts) {
      const numericDiscount = Number(
        String(discount ?? '')
          .replace('%', '')
          .replace(',', '.')
      )

      if (
        Number.isFinite(numericDiscount) &&
        numericDiscount > 0
      ) {
        return numericDiscount
      }
    }

    if (Array.isArray(product.offers)) {
      return Math.max(
        0,
        ...product.offers.map((offer) => {
          const value =
            offer.discount_percentage ??
            offer.discount ??
            offer.discountPercent

          const numeric = Number(
            String(value ?? '')
              .replace('%', '')
              .replace(',', '.')
          )

          return Number.isFinite(numeric) ? numeric : 0
        })
      )
    }

    return 0
  }


  function formatPrice(price) {
    if (!Number.isFinite(price)) {
      return 'Consultar'
    }

    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(price)
  }


  /*
   * Si estamos viendo una ruta distinta a la principal,
   * dejamos que React Router la maneje.
   */
  if (location.pathname !== '/') {
    return (
      <Routes>
        <Route path="/admin" element={<Admin />} />
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


  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 font-bold"
          >
            <span className="text-2xl font-black text-green-600">
              ARPRICE
            </span>
          </button>

          <form
            onSubmit={handleSearch}
            className="flex flex-1 items-center"
          >
            <div className="relative w-full">
              <Search
                size={20}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="text"
                name="search"
                value={filters.searchQuery}
                onChange={handleSearchChange}
                placeholder="Buscar productos..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 outline-none transition focus:border-green-500 focus:bg-white"
              />
            </div>
          </form>

          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50"
          >
            <SlidersHorizontal size={18} />
            <span className="hidden sm:inline">
              Filtros
            </span>
          </button>
        </div>
      </header>


      {/* CONTENIDO */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {/* FILTROS */}
        {showFilters && (
          <section className="mb-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                Filtrar productos
              </h2>

              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
              >
                <RotateCcw size={16} />
                Limpiar
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Categoría
                </span>

                <select
                  value={filters.category}
                  onChange={handleCategoryChange}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  <option value="">
                    Todas las categorías
                  </option>

                  {availableCategories.map((category, index) => {
                    const value =
                      typeof category === 'string'
                        ? category
                        : category.name ||
                          category.category ||
                          category.slug ||
                          ''

                    const label =
                      typeof category === 'string'
                        ? category
                        : category.name ||
                          category.category ||
                          category.label ||
                          value

                    if (!value) return null

                    return (
                      <option
                        key={`${value}-${index}`}
                        value={value}
                      >
                        {label}
                      </option>
                    )
                  })}
                </select>
              </label>


              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Supermercado
                </span>

                <select
                  value={filters.store}
                  onChange={handleStoreChange}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3"
                >
                  <option value="">
                    Todos los supermercados
                  </option>

                  {availableSupermarkets.map(
                    (supermarket, index) => {
                      const value =
                        typeof supermarket === 'string'
                          ? supermarket
                          : supermarket.name || ''

                      if (!value) return null

                      return (
                        <option
                          key={`${value}-${index}`}
                          value={value}
                        >
                          {value}
                        </option>
                      )
                    }
                  )}
                </select>
              </label>
            </div>
          </section>
        )}


        {/* BARRA DE RESULTADOS */}
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              Compará precios
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              {isLoadingProducts
                ? 'Cargando productos...'
                : `${filteredProducts.length} productos encontrados`}
            </p>
          </div>


          <div
            ref={sortMenuRef}
            className="relative"
          >
            <button
              type="button"
              onClick={() =>
                setShowSortMenu((value) => !value)
              }
              className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm"
            >
              {sortBy === 'name-asc' && (
                <ArrowDownAZ size={17} />
              )}

              {sortBy === 'price-asc' && (
                <ArrowDownWideNarrow size={17} />
              )}

              {sortBy === 'price-desc' && (
                <ArrowUpWideNarrow size={17} />
              )}

              {sortBy === 'discount' && (
                <Percent size={17} />
              )}

              {sortBy === 'default' && (
                <ArrowDownWideNarrow size={17} />
              )}

              <span>
                {sortBy === 'name-asc'
                  ? 'Nombre'
                  : sortBy === 'price-asc'
                    ? 'Precio menor'
                    : sortBy === 'price-desc'
                      ? 'Precio mayor'
                      : sortBy === 'discount'
                        ? 'Mayor descuento'
                        : 'Ordenar'}
              </span>

              <ChevronDown size={16} />
            </button>


            {showSortMenu && (
              <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded-xl border bg-white p-2 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setSortBy('default')
                    setShowSortMenu(false)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  Orden original
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSortBy('name-asc')
                    setShowSortMenu(false)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  Nombre A-Z
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSortBy('price-asc')
                    setShowSortMenu(false)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  Precio menor
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSortBy('price-desc')
                    setShowSortMenu(false)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  Precio mayor
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSortBy('discount')
                    setShowSortMenu(false)
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  Mayor descuento
                </button>
              </div>
            )}
          </div>
        </section>


        {/* LOADING */}
        {isLoadingProducts && (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-gray-500">
              <Loader2
                size={35}
                className="animate-spin"
              />

              <span>
                Cargando productos...
              </span>
            </div>
          </div>
        )}


        {/* SIN RESULTADOS */}
        {!isLoadingProducts &&
          filteredProducts.length === 0 && (
            <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
              <AlertTriangle
                size={40}
                className="mx-auto mb-4 text-gray-400"
              />

              <h2 className="text-xl font-bold">
                No encontramos productos
              </h2>

              <p className="mt-2 text-gray-500">
                Probá cambiar la búsqueda o quitar
                algunos filtros.
              </p>

              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-xl bg-green-600 px-5 py-3 font-medium text-white hover:bg-green-700"
              >
                Limpiar filtros
              </button>
            </div>
          )}


        {/* PRODUCTOS */}
        {!isLoadingProducts &&
          filteredProducts.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((product, index) => {
                const price = getProductPrice(product)
                const discount = getProductDiscount(product)

                return (
                  <article
                    key={
                      product.id ??
                      product.product_id ??
                      `${product.name}-${index}`
                    }
                    className="group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                  >
                    {/* FAVORITO */}
                    <button
                      type="button"
                      onClick={() =>
                        toggleFavorite(product)
                      }
                      className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm"
                      aria-label="Agregar a favoritos"
                    >
                      <Heart
                        size={19}
                        fill={
                          isFavorite(product)
                            ? 'currentColor'
                            : 'none'
                        }
                        className={
                          isFavorite(product)
                            ? 'text-red-500'
                            : 'text-gray-500'
                        }
                      />
                    </button>


                    {/* IMAGEN */}
                    <button
                      type="button"
                      onClick={() =>
                        handleProductClick(product)
                      }
                      className="block w-full text-left"
                    >
                      <div className="flex h-52 items-center justify-center bg-gray-50 p-6">
                        {product.image ||
                        product.image_url ? (
                          <img
                            src={
                              product.image ||
                              product.image_url
                            }
                            alt={product.name || 'Producto'}
                            className="h-full max-w-full object-contain transition group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                            Sin imagen
                          </div>
                        )}
                      </div>


                      <div className="p-4">
                        {product.brand && (
                          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
                            {product.brand}
                          </p>
                        )}

                        <h3 className="line-clamp-2 min-h-[48px] font-semibold">
                          {product.name ||
                            'Producto sin nombre'}
                        </h3>


                        <div className="mt-4 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-xs text-gray-500">
                              Desde
                            </p>

                            <p className="text-xl font-bold text-green-600">
                              {formatPrice(price)}
                            </p>
                          </div>

                          {discount > 0 && (
                            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">
                              -{discount}%
                            </span>
                          )}
                        </div>
                      </div>
                    </button>


                    {/* OFERTAS */}
                    {Array.isArray(product.offers) &&
                      product.offers.length > 0 && (
                        <div className="border-t px-4 py-3">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gray-500">
                            <Tag size={14} />
                            Ofertas disponibles
                          </div>

                          <div className="space-y-2">
                            {product.offers
                              .slice(0, 3)
                              .map((offer, offerIndex) => {
                                const offerPrice =
                                  getOfferPrice(offer)

                                const store =
                                  offer.supermarket ||
                                  offer.supermarket_name ||
                                  offer.store ||
                                  'Supermercado'

                                return (
                                  <div
                                    key={`${store}-${offerIndex}`}
                                    className="flex items-center justify-between gap-2 text-sm"
                                  >
                                    <span className="truncate text-gray-600">
                                      {store}
                                    </span>

                                    <span className="font-semibold">
                                      {formatPrice(
                                        offerPrice
                                      )}
                                    </span>
                                  </div>
                                )
                              })}
                          </div>
                        </div>
                      )}


                    {/* DETALLE */}
                    <button
                      type="button"
                      onClick={() =>
                        handleProductClick(product)
                      }
                      className="flex w-full items-center justify-between border-t px-4 py-3 text-sm font-medium text-green-600 hover:bg-green-50"
                    >
                      Ver comparación
                      <ChevronRight size={17} />
                    </button>
                  </article>
                )
              })}
            </div>
          )}


        {/* CARGAR MÁS */}
        {!isLoadingProducts &&
          filteredProducts.length >=
            productsPageSize && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() =>
                  setProductsPageSize(
                    (size) => size + PAGE_SIZE
                  )
                }
                className="rounded-xl border bg-white px-6 py-3 font-medium shadow-sm hover:bg-gray-50"
              >
                Cargar más productos
              </button>
            </div>
          )}
      </main>


      {/* MODAL PRODUCTO */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeProduct()
            }
          }}
        >
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
              <button
                type="button"
                onClick={closeProduct}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft size={18} />
                Volver
              </button>

              <button
                type="button"
                onClick={() =>
                  toggleFavorite(selectedProduct)
                }
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <Heart
                  size={20}
                  fill={
                    isFavorite(selectedProduct)
                      ? 'currentColor'
                      : 'none'
                  }
                  className={
                    isFavorite(selectedProduct)
                      ? 'text-red-500'
                      : 'text-gray-500'
                  }
                />
              </button>
            </div>


            <div className="grid gap-6 p-6 md:grid-cols-2">
              <div className="flex min-h-[300px] items-center justify-center rounded-2xl bg-gray-50 p-8">
                {selectedProduct.image ||
                selectedProduct.image_url ? (
                  <img
                    src={
                      selectedProduct.image ||
                      selectedProduct.image_url
                    }
                    alt={
                      selectedProduct.name ||
                      'Producto'
                    }
                    className="max-h-[350px] max-w-full object-contain"
                  />
                ) : (
                  <span className="text-gray-400">
                    Sin imagen
                  </span>
                )}
              </div>


              <div>
                {selectedProduct.brand && (
                  <p className="text-sm font-medium uppercase tracking-wide text-gray-400">
                    {selectedProduct.brand}
                  </p>
                )}

                <h2 className="mt-1 text-2xl font-bold">
                  {selectedProduct.name}
                </h2>

                {selectedProduct.category && (
                  <p className="mt-2 text-sm text-gray-500">
                    {selectedProduct.category}
                  </p>
                )}

                <div className="mt-6">
                  <p className="text-sm text-gray-500">
                    Mejor precio
                  </p>

                  <p className="text-3xl font-black text-green-600">
                    {formatPrice(
                      getProductPrice(
                        selectedProduct
                      )
                    )}
                  </p>
                </div>

                {getProductDiscount(
                  selectedProduct
                ) > 0 && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-700">
                    <TrendingDown size={16} />
                    {getProductDiscount(
                      selectedProduct
                    )}
                    % de descuento
                  </div>
                )}
              </div>
            </div>


            {Array.isArray(
              selectedProduct.offers
            ) &&
              selectedProduct.offers.length > 0 && (
                <div className="border-t p-6">
                  <h3 className="mb-4 text-lg font-bold">
                    Comparación de precios
                  </h3>

                  <div className="space-y-3">
                    {selectedProduct.offers.map(
                      (offer, index) => {
                        const price =
                          getOfferPrice(offer)

                        const store =
                          offer.supermarket ||
                          offer.supermarket_name ||
                          offer.store ||
                          'Supermercado'

                        return (
                          <div
                            key={`${store}-${index}`}
                            className="flex items-center justify-between rounded-xl border p-4"
                          >
                            <div className="flex items-center gap-3">
                              {supermarketImages.get(
                                store
                              ) && (
                                <img
                                  src={supermarketImages.get(
                                    store
                                  )}
                                  alt={store}
                                  className="h-10 w-10 rounded-lg object-contain"
                                />
                              )}

                              <div>
                                <p className="font-semibold">
                                  {store}
                                </p>

                                {offer.installments_quantity && (
                                  <p className="text-xs text-gray-500">
                                    {offer.installments_quantity}{' '}
                                    cuotas de{' '}
                                    {formatPrice(
                                      Number(
                                        offer.installment_price
                                      )
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-lg font-bold">
                                {formatPrice(price)}
                              </p>

                              {index === 0 && (
                                <p className="text-xs font-medium text-green-600">
                                  Mejor precio
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  )
}


/*
 * Helpers para precios.
 * Están fuera del componente para evitar recrearlos.
 */
function getOfferPrice(offer) {
  if (!offer) return Infinity

  const possiblePrices = [
    offer.cash_price,
    offer.price,
    offer.current_price,
    offer.installment_price,
  ]

  for (const price of possiblePrices) {
    const numericPrice = Number(
      String(price ?? '')
        .replace(/\$/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    )

    if (Number.isFinite(numericPrice) && numericPrice > 0) {
      return numericPrice
    }
  }

  return Infinity
}


function getProductPrice(product) {
  if (!product) return Infinity

  const directPrices = [
    product.price,
    product.cash_price,
    product.current_price,
    product.min_price,
  ]

  for (const price of directPrices) {
    const numericPrice = Number(
      String(price ?? '')
        .replace(/\$/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
    )

    if (Number.isFinite(numericPrice) && numericPrice > 0) {
      return numericPrice
    }
  }

  if (Array.isArray(product.offers)) {
    const prices = product.offers
      .map(getOfferPrice)
      .filter(Number.isFinite)

    if (prices.length > 0) {
      return Math.min(...prices)
    }
  }

  return Infinity
}


function getProductDiscount(product) {
  if (!product) return 0

  const possibleDiscounts = [
    product.discount,
    product.discount_percentage,
    product.discountPercent,
  ]

  for (const discount of possibleDiscounts) {
    const numericDiscount = Number(
      String(discount ?? '')
        .replace('%', '')
        .replace(',', '.')
    )

    if (
      Number.isFinite(numericDiscount) &&
      numericDiscount > 0
    ) {
      return numericDiscount
    }
  }

  if (Array.isArray(product.offers)) {
    return Math.max(
      0,
      ...product.offers.map((offer) => {
        const value =
          offer.discount_percentage ??
          offer.discount ??
          offer.discountPercent

        const numeric = Number(
          String(value ?? '')
            .replace('%', '')
            .replace(',', '.')
        )

        return Number.isFinite(numeric) ? numeric : 0
      })
    )
  }

  return 0
}


function AppWithProviders() {
  return (
    <SelectedCityProvider>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </SelectedCityProvider>
  )
}


export default AppWithProviders