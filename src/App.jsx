
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
import { apiUrl } from './config/api.js';
import { getTotalPages, getVisiblePageNumbers } from './utils/pagination.js';
import { buildProductsQuery } from './utils/catalogQuery.js';
import { isValidCatalogProduct } from './utils/validCatalogProducts.js';
import { fetchAnalysisProducts } from './services/analysisApi.js';
import { resolveSelectedAnalysisProduct } from './utils/priceExplanationPresentation.js';
import { Heart, Search, SlidersHorizontal, ChevronRight, RotateCcw, ArrowLeft, TrendingDown, Tag, ThumbsUp, AlertTriangle, Loader2, ChevronDown, ArrowDownAZ, ArrowDownWideNarrow, ArrowUpWideNarrow, Percent } from 'lucide-react';

const CATEGORY_ONBOARDING_KEY = 'arprice_category_onboarding_complete';

const SORT_OPTIONS = [
  { value: 'discount-desc', label: 'Mayor ahorro', icon: Percent },
  { value: 'price-asc', label: 'Menor precio', icon: ArrowDownWideNarrow },
  { value: 'price-desc', label: 'Mayor precio', icon: ArrowUpWideNarrow },
  { value: 'name-asc', label: 'Nombre A-Z', icon: ArrowDownAZ },
]

function getCategoryCacheKey() {
  return `arprice_categories:${apiUrl('/categories')}`
}

function readCachedCategories() {
  try {
    const saved = JSON.parse(localStorage.getItem(getCategoryCacheKey()) || 'null')
    return Array.isArray(saved) && saved.length > 0 && saved.every((category) =>
      category && category.id != null && typeof category.name === 'string'
    )
      ? saved
      : []
  } catch {
    return []
  }
}

function SortMenu({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selectedOption = SORT_OPTIONS.find((option) => option.value === value) || SORT_OPTIONS[0];
  const SelectedIcon = selectedOption.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          <SelectedIcon className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
          <span className="truncate">{selectedOption.label}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-800" role="listbox" aria-label="Ordenar lista por">
          {SORT_OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${isSelected ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300' : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-700'}`}
              >
                <OptionIcon className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialViewMode = location.pathname === '/favoritos'
    ? 'favorites'
    : location.pathname === '/buscar'
      ? 'products'
      : 'categories';
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [darkMode, setDarkMode] = useState(() => {
    return (
      localStorage.getItem('arprice_theme') === 'dark' ||
      (!('arprice_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const { selectedCity, setSelectedCity } = useSelectedCity();
  const { user, favorites, favoritesLoading, favoritesError, toggleFavorite: updateFavorite } = useCustomerAuth();
  const [favoriteNotice, setFavoriteNotice] = useState('');
  const [categories, setCategories] = useState(readCachedCategories)
  const [categories, setCategories] = useState(MOCK_CATEGORIES)
  const [taxonomy, setTaxonomy] = useState([])
  const [products, setProducts] = useState([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [catalogLoadError, setCatalogLoadError] = useState(false)
  const [analysisLoadState, setAnalysisLoadState] = useState('idle')
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState(
    () => localStorage.getItem('arprice_selected_category'),
  )
  const catalogReferenceCache = useRef(null)
  const analysisCache = useRef(null)
  const [productsPage, setProductsPage] = useState(1)
  const productsPageSize = 20
  const initialSearchParams = new URLSearchParams(location.search)
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('arprice_search_history') || '[]')
      return Array.isArray(saved) ? saved.filter(Boolean).slice(0, 6) : []
    } catch {
      return []
    }
  })
  const [storesList, setStoresList] = useState([])
  const [filters, setFilters] = useState({
    category: 'todos',
    searchQuery: initialSearchParams.get('q') || '',
    store: 'todos',
    subcategory: 'todos',
    priceStatus: 'todos',
    sortBy: 'discount-desc',
    maxPrice: 1000000,
  });
  const sortBy = filters.sortBy
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const [selectedProductForComparison, setSelectedProductForComparison] = useState(null);
  const [selectedProductForExplanation, setSelectedProductForExplanation] = useState(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [favoritesOnlyView, setFavoritesOnlyView] = useState(false);
  const updateFilters = (updater) => {
    setProductsPage(1)
    setFilters(updater)
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setProductsPage(1)
    setViewMode(
      location.pathname === '/buscar'
        ? 'products'
        : location.pathname === '/favoritos'
          ? 'favorites'
          : 'categories'
    );
    setFavoritesOnlyView(location.pathname === '/favoritos');
    if (location.pathname === '/buscar') {
      setFilters((previous) => ({
        ...previous,
        searchQuery: params.get('q') ?? '',
        category: params.get('category') ?? 'todos',
        subcategory: 'todos',
        priceStatus: params.get('deals') === '1' ? 'OFERTA' : 'todos',
      }));
    } else if (
      location.pathname === '/'
      && localStorage.getItem(CATEGORY_ONBOARDING_KEY) === 'true'
    ) {
      setFilters((previous) => ({
        ...previous,
        searchQuery: '',
        category: localStorage.getItem('arprice_selected_category') || 'todos',
        subcategory: 'todos',
        priceStatus: 'todos',
      }));
    } else {
      setFilters((previous) => ({
        ...previous,
        searchQuery: '',
        category: 'todos',
        subcategory: 'todos',
        priceStatus: 'todos',
      }));
    }
  }, [location.pathname, location.search]);

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('arprice_favorites');
      return saved ? JSON.parse(saved) : ['prod-1', 'prod-4'];
    } catch {
      return ['prod-1', 'prod-4'];
    }
  });
  const favoriteIdsKey = favoritesOnlyView ? favorites.join(',') : ''

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

  const handleSelectCategory = (category) => {
    const selectedCategoryId = String(category)
    setSelectedCategory(selectedCategoryId)
    localStorage.setItem('arprice_selected_category', selectedCategoryId)
    updateFilters((previous) => ({
      ...previous,
      category: selectedCategoryId,
      searchQuery: '',
      subcategory: 'todos',
    }));
    setFavoritesOnlyView(false);
    setViewMode('products');
    navigate(`/buscar?category=${encodeURIComponent(category)}`);
  };

  const handleOnboardingCategorySelect = (category) => {
    localStorage.setItem(CATEGORY_ONBOARDING_KEY, 'true')
    handleSelectCategory(category)
  }

  const navigateToSearch = () => {
    const query = filters.searchQuery.trim()
    if (query) {
      setSearchHistory((previous) => [
        query,
        ...previous.filter((item) => item !== query),
      ].slice(0, 6))
    }
    setFavoritesOnlyView(false)
    setViewMode('products')
    navigate(query ? `/buscar?q=${encodeURIComponent(query)}` : '/buscar')
  }

  const handleQuickSearch = (query) => {
    const normalizedQuery = String(query || '').trim()
    updateFilters((previous) => ({
      ...previous,
      category: 'todos',
      searchQuery: normalizedQuery,
      subcategory: 'todos',
    }))
    if (normalizedQuery) {
      setSearchHistory((previous) => [
        normalizedQuery,
        ...previous.filter((item) => item !== normalizedQuery),
      ].slice(0, 6))
    }
    setFavoritesOnlyView(false)
    setViewMode('products')
    navigate(normalizedQuery ? `/buscar?q=${encodeURIComponent(normalizedQuery)}` : '/buscar')
  }

  const resetFilters = () => {
    updateFilters((previous) => ({
      ...previous,
      category: 'todos',
      searchQuery: '',
      store: 'todos',
      subcategory: 'todos',
      priceStatus: 'todos',
      sortBy: 'discount-desc',
      maxPrice: 1000000,
    }));
    setFavoritesOnlyView(false);
    setViewMode('categories');
    navigate('/');
  };

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

  // Keep the result index keyed by query and fetch only the requested page.
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    let searchTimer
    setIsLoadingProducts(true)
    setCatalogLoadError(false)
    const loadData = async () => {
      const requestTimeout = setTimeout(() => {
        controller.abort(new DOMException('Catalog request timed out', 'TimeoutError'))
      }, 15000)
      try {
        const query = buildProductsQuery({
          page: productsPage,
          limit: productsPageSize,
          searchQuery: filters.searchQuery,
          category: filters.category,
          subcategory: filters.subcategory,
          store: filters.store,
          status: filters.priceStatus,
          sortBy,
          favoritesOnly: favoritesOnlyView,
          favoriteIds: favoriteIdsKey ? favoriteIdsKey.split(',') : [],
          maxPrice: filters.maxPrice,
        })
        const referencesPromise = catalogReferenceCache.current
          ? Promise.resolve(catalogReferenceCache.current)
          : Promise.all([
            fetch(apiUrl('/categories'), { signal: controller.signal })
              .then(async (response) => {
                const data = response.ok ? await response.json() : []
                const freshCategories = Array.isArray(data) ? data : []
                if (freshCategories.length > 0) {
                  try {
                    localStorage.setItem(getCategoryCacheKey(), JSON.stringify(freshCategories))
                  } catch (error) {
                    console.warn('Could not cache categories', error)
                  }
                  if (mounted) setCategories(freshCategories)
                }
                return freshCategories
              }),
            fetch(apiUrl('/taxonomy'), { signal: controller.signal }),
            fetch(apiUrl('/supermarkets'), { signal: controller.signal }),
          ]).then(async ([categoriesData, taxonomyResponse, supermarketsResponse]) => {
            const supermarkets = supermarketsResponse.ok ? await supermarketsResponse.json() : []
          ]).then(async ([categoriesResponse, taxonomyResponse, supermarketsResponse]) => {
            const references = {
              categories: categoriesData,
              taxonomy: taxonomyResponse.ok ? await taxonomyResponse.json() : [],
              supermarkets: supermarketsResponse.ok ? await supermarketsResponse.json() : [],
            }
            catalogReferenceCache.current = references
            return references
          })
        const [productsResponse, references] = await Promise.all([
          fetch(apiUrl(`/products?${query.toString()}`), { signal: controller.signal }),
          referencesPromise,
        ])

        if (!mounted) return
        if (!productsResponse.ok) throw new Error('Backend returned non-ok response')

        const pagePayload = await productsResponse.json()
        const pageData = Array.isArray(pagePayload) ? pagePayload : pagePayload?.data || []
        const total = Array.isArray(pagePayload)
          ? pageData.length
          : Number(pagePayload?.total ?? pageData.length)
        const validProducts = pageData.filter((product) => isValidCatalogProduct(product))
        const { categories: cats, taxonomy: taxonomyData, supermarkets } = references
        const supermarketImages = new Map((supermarkets || []).map((supermarket) => [supermarket.name, supermarket.image]))
        const analysisByProduct = new Map((analysisCache.current || []).map((item) => [String(item.product?.id), item]))

        const enriched = validProducts.map((product) => {
          const offers = (product.offers || [])
            .map((offer) => ({
              ...offer,
              price: Number(offer.cash_price ?? offer.cashPrice ?? offer.price ?? 0),
              supermarket: offer.supermarket || offer.supermarket_name || offer.storeName || '',
            }))
            .filter((offer) => Number.isFinite(offer.price) && offer.price > 0)
          const primary = offers.reduce(
            (lowest, offer) => (!lowest || offer.price < lowest.price ? offer : lowest),
            null,
          )
          const currentPrice = Number(product.currentPrice || primary?.price || product.price || 0)
          const avgMarketPrice = offers.length
            ? offers.reduce((sum, offer) => sum + offer.price, 0) / offers.length
            : Number(product.avgMarketPrice || 0)
          const analysis = analysisByProduct.get(String(product.id))

          return {
            ...product,
            brand: product.brand || product.brands?.name || '',
            subcategory: product.subcategory || product.subcategories?.name || '',
            currentPrice,
            primaryStore: primary
              ? { name: primary.supermarket, id: primary.id }
              : { name: '', id: null },
            avgMarketPrice,
            percentageDiff: avgMarketPrice
              ? ((avgMarketPrice - currentPrice) / avgMarketPrice) * 100
              : Number(product.percentageDiff || 0),
            status: analysis?.classification === 'PRECIO_NORMAL'
              ? 'EN_PRECIO'
              : analysis?.classification || product.status || 'EN_PRECIO',
            analysis: analysis || null,
            priceHistory: analysis?.priceHistory || product.priceHistory || [],
            otherStores: offers.filter((offer) => offer !== primary),
            unit: product.unit || '',
          }
        })

        setCategories((current) => cats.length ? cats : current)
        setTaxonomy(taxonomyData || [])
        setProducts(enriched)
        setCatalogTotal(total)
        setCatalogLoadError(false)

        const stores = new Map()
        ;(supermarkets || []).forEach((supermarket) => {
          if (supermarket?.name) stores.set(supermarket.name, { id: supermarket.name, name: supermarket.name, image: supermarket.image || '' })
        })
        validProducts.forEach((product) => (product.offers || []).forEach((offer) => {
          const name = offer.supermarket || offer.supermarket_name || offer.storeName
          if (name && !stores.has(name)) stores.set(name, { id: name, name, image: supermarketImages.get(name) || '' })
        }))
        setStoresList([...stores.values()])

        if (!analysisCache.current && !filters.searchQuery.trim() && !favoritesOnlyView) {
          setAnalysisLoadState('loading')
          fetchAnalysisProducts(apiUrl('/analysis/products'), { signal: controller.signal })
            .then((analysisResults) => {
              if (!mounted) return
              analysisCache.current = analysisResults
              setAnalysisLoadState('loaded')
              const resultsByProduct = new Map(analysisResults.map((item) => [String(item.product?.id), item]))
              setProducts((current) => current.map((product) => {
                const analysis = resultsByProduct.get(String(product.id))
                if (!analysis) return product
                return {
                  ...product,
                  analysis,
                  status: analysis.classification === 'PRECIO_NORMAL'
                    ? 'EN_PRECIO'
                    : analysis.classification || product.status,
                  priceHistory: analysis.priceHistory || product.priceHistory,
                }
              }))
            })
            .catch((error) => {
              if (error.name !== 'AbortError') {
                console.error('Error loading price analysis', error)
                if (mounted) setAnalysisLoadState('error')
              }
            })
        }
      } catch (error) {
        if (!mounted || error.name === 'AbortError') return
        console.error('Error loading data', error)
        setCatalogLoadError(true)
        setProducts([])
        setCatalogTotal(0)
        setStoresList([])
      } finally {
        clearTimeout(requestTimeout)
        if (mounted) setIsLoadingProducts(false)
      }
    }

    searchTimer = setTimeout(loadData, filters.searchQuery.trim() ? 250 : 0)
    return () => {
      mounted = false
      controller.abort()
      clearTimeout(searchTimer)
    }
  }, [filters, productsPage, productsPageSize, selectedCity, sortBy, catalogRefreshKey, favoriteIdsKey, favoritesOnlyView])

  const toggleFavorite = (product) => {
    setFavorites((prev) =>
      prev.includes(product.id) ? prev.filter((id) => id !== product.id) : [...prev, product.id]
    );
    if (favoritesOnlyView) setProductsPage(1)
  };

  const addToBasket = (product, selectedOffer = null) => {
    // Normalize selectedOffer shapes coming from different places
    const offer = selectedOffer
      ? {
          price: Number((selectedOffer.price ?? selectedOffer.cash_price ?? selectedOffer.cashPrice ?? product.currentPrice) || 0),
          storeId: selectedOffer.id ?? selectedOffer.storeId ?? (selectedOffer.supermarket || selectedOffer.storeName) ?? 'default',
          storeName: selectedOffer.supermarket ?? selectedOffer.storeName ?? product.primaryStore?.name ?? 'Precio actual',
        }
      : {
          price: Number(product.currentPrice || 0),
          storeId: product.primaryStore?.id || 'default',
          storeName: product.primaryStore?.name || 'Precio actual',
        };

    const itemId = `${product.id}-${offer.storeId}-${offer.price}`;

    setBasket((prev) => {
      const existing = prev.find((item) => item.id === itemId);
      if (existing) {
        return prev.map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { id: itemId, product, quantity: 1, selectedOffer: offer }];
    });
  };

  const updateBasketQuantity = (itemId, delta) => {
    setBasket((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromBasket = (itemId) => {
    setBasket((prev) => prev.filter((item) => item.id !== itemId));
  };

  const clearBasket = () => {
    setBasket([]);
  };

  const filteredProducts = products
  const favoriteIds = useMemo(() => new Set(favorites.map(String)), [favorites])
  const favoriteProducts = useMemo(
    () => filteredProducts.filter((product) => favoriteIds.has(String(product.id))),
    [favoriteIds, filteredProducts],
  )

  useEffect(() => {
    localStorage.setItem('arprice_search_history', JSON.stringify(searchHistory))
  }, [searchHistory])

  const totalPages = useMemo(
    () => getTotalPages(catalogTotal, productsPageSize),
    [catalogTotal, productsPageSize],
  );
  const visiblePages = useMemo(() => getVisiblePageNumbers(productsPage, totalPages, 1), [productsPage, totalPages]);
  const paginatedProducts = useMemo(
    () => filteredProducts,
    [filteredProducts],
  );

  useEffect(() => {
    if (productsPage > totalPages) {
      setProductsPage(totalPages);
    }
  }, [productsPage, totalPages]);

  const currentCategoryName = categories.find((c) => c.id === filters.category)?.name || 'Todos los productos';
  const selectedTaxonomyCategory = taxonomy.find((category) => String(category.id) === String(filters.category));
  const availableSubcategories = selectedTaxonomyCategory?.subcategories || [];
  const isCategoryOnboarding = location.pathname === '/seleccionar-categorias'
    || (
      location.pathname === '/'
      && localStorage.getItem(CATEGORY_ONBOARDING_KEY) !== 'true'
    );
  const explanationProduct = resolveSelectedAnalysisProduct(
    selectedProductForExplanation,
    products,
  );

  if (isCategoryOnboarding) {
    return (
      <CategorySelectionPage
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={handleOnboardingCategorySelect}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans transition-colors duration-200">
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        selectedCity={selectedCity}
        setSelectedCity={setSelectedCity}
        basketCount={basket.reduce((acc, i) => acc + i.quantity, 0)}
        onOpenBasket={() => setBasketOpen(true)}
        favoritesCount={favorites.length}
        onOpenFavorites={() => {
          setProductsPage(1)
          setFavoritesOnlyView(true);
          setViewMode('favorites');
          navigate('/favoritos', { replace: true });
        }}
        onResetView={resetFilters}
        categories={categories}
        selectedCategory={filters.category}
        onSelectCategory={handleSelectCategory}
        isAdminPage={false}
      />

      {viewMode === 'favorites' ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          <div className="bg-white dark:bg-stone-800 rounded-3xl border border-rose-200/80 dark:border-rose-900/80 p-5 shadow-xs sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-300 flex items-center justify-center">
                  <Heart className="w-6 h-6 fill-current" />
                </div>
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-rose-600 dark:text-rose-400">Tu selección</p>
                  <h1 className="mt-1 text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">Favoritos</h1>
                </div>
              </div>
              <button
                onClick={() => {
                  setViewMode('categories');
                  navigate('/');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver a Categorías
              </button>
            </div>
          </div>

          {favoriteProducts.length === 0 ? (
            <div className="bg-white dark:bg-stone-800 rounded-3xl p-12 text-center border border-stone-200/80 dark:border-stone-700/80 space-y-4">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300 rounded-2xl flex items-center justify-center mx-auto">
                <Heart className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-white">no hay favoritos agregados</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">Agrega productos a tu lista de favoritos para verlos aquí.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {favoriteProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onCompare={(p) => setSelectedProductForComparison(p)}
                  onToggleFavorite={toggleFavorite}
                  isFavorite={favorites.includes(product.id)}
                  onAddToBasket={addToBasket}
                  isInBasket={basket.some((item) => item.product.id === product.id)}
                />
              ))}
            </div>
          )}
        </main>
      ) : viewMode === 'categories' ? (
        <HeroCategoryGrid
          categories={categories}
          isLoadingCategories={isLoadingProducts && categories.length === 0}
          selectedCategory={filters.category}
          onSelectCategory={handleSelectCategory}
          searchQuery={filters.searchQuery}
          setSearchQuery={(value) => updateFilters((prev) => ({ ...prev, searchQuery: value }))}
          onSearchSubmit={navigateToSearch}
          onQuickSearch={handleQuickSearch}
          searchHistory={searchHistory}
          onSelectSearch={handleQuickSearch}
          onRemoveSearch={(query) => setSearchHistory((previous) => previous.filter((item) => item !== query))}
          onClearSearch={() => setSearchHistory([])}
        />
        <>
          <HeroCategoryGrid
            categories={categories}
            selectedCategory={filters.category}
            onSelectCategory={handleSelectCategory}
            searchQuery={filters.searchQuery}
            setSearchQuery={(value) => updateFilters((prev) => ({ ...prev, searchQuery: value }))}
            onSearchSubmit={navigateToSearch}
            onQuickSearch={handleQuickSearch}
            searchHistory={searchHistory}
            onSelectSearch={handleQuickSearch}
            onRemoveSearch={(query) => setSearchHistory((previous) => previous.filter((item) => item !== query))}
            onClearSearch={() => setSearchHistory([])}
          />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.24em] text-sky-600 font-bold">Novedades y ofertas</p>
                <h2 className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white">Ofertas destacadas y alertas de precios inflados</h2>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-500 transition-colors"
              >
                Reportar un precio
              </button>
            </div>

            <DealsSummaryBanner
              products={products}
              onSelectProduct={(product) => {
                setSelectedProductForComparison(product);
                setViewMode('products');
                navigate('/buscar');
              }}
            />
          </div>
        </>
      ) : (
        <main id="products-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="bg-white dark:bg-stone-800 p-4 rounded-3xl border border-stone-200/80 dark:border-stone-700/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                onClick={() => {
                  setViewMode('categories');
                  navigate('/');
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/80 text-sky-700 dark:text-sky-300 font-bold text-xs sm:text-sm border border-sky-200/80 dark:border-sky-800 transition-all cursor-pointer w-fit"
              >
                <ArrowLeft className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Volver a Categorías</span>
              </button>
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                <span className="text-stone-400">Categoría activa:</span>
                <span className="px-3 py-1.5 rounded-full bg-sky-600 text-white font-extrabold text-xs">
                  {favoritesOnlyView ? '❤️ Favoritos' : currentCategoryName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-stone-800 p-4 rounded-2xl border border-stone-200/80 dark:border-stone-700/80 shadow-xs">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-stone-500 dark:text-stone-400">
              <button onClick={resetFilters} className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer">
                Inicio
              </button>
              <ChevronRight className="w-4 h-4 text-stone-400" />
              <span className="text-stone-900 dark:text-white font-bold">{favoritesOnlyView ? '❤️ Mis Favoritos' : currentCategoryName}</span>
              {filters.searchQuery && (
                <>
                  <ChevronRight className="w-4 h-4 text-stone-400" />
                  <span className="text-sky-600 dark:text-sky-400 italic">"{filters.searchQuery}"</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-stone-600 dark:text-stone-300">
                Mostrando <strong className="text-sky-600 dark:text-sky-400 font-extrabold">{paginatedProducts.length}</strong> productos · Página {productsPage} de {totalPages}
              </span>
              {(filters.category !== 'todos' || filters.subcategory !== 'todos' || filters.searchQuery || filters.store !== 'todos' || favoritesOnlyView) && (
                <button
                  onClick={() => {
                    updateFilters({
                      category: filters.category,
                      searchQuery: '',
                      store: 'todos',
                      subcategory: 'todos',
                      priceStatus: 'todos',
                      sortBy: 'discount-desc',
                      maxPrice: 1000000,
                    });
                    setFavoritesOnlyView(false);
                  }}
                  className="flex items-center gap-1 text-rose-500 hover:underline font-bold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpiar Filtros</span>
                </button>
              )}
            </div>
          </div>

          <section className="rounded-3xl border border-sky-300 bg-sky-50/70 p-4 shadow-sm dark:border-sky-700 dark:bg-sky-950/30 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">Explorar por rubro</p>
                <h2 className="mt-1 text-lg font-black text-stone-900 dark:text-white">Categorías principales</h2>
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory">
              <button
                type="button"
                onClick={() => handleSelectCategory('todos')}
                className={`min-w-[150px] flex-1 snap-start min-h-20 rounded-xl border-2 p-2 text-left transition-all ${filters.category === 'todos' && !favoritesOnlyView ? 'border-sky-600 bg-sky-600 text-white shadow-md ring-2 ring-sky-300 dark:border-sky-500 dark:bg-sky-600 dark:ring-sky-500' : 'border-stone-300 bg-white text-stone-900 shadow-sm hover:border-sky-400 hover:shadow-md dark:border-stone-600 dark:bg-stone-800 dark:text-white'}`}
              >
                <span className="block text-sm font-black leading-tight">Todos</span>
              </button>
              {categories.map((category) => {
                const isSelected = filters.category === category.id && !favoritesOnlyView
                return (
                  <button key={category.id} type="button" onClick={() => handleSelectCategory(category.id)} className={`min-w-[150px] flex-1 snap-start min-h-20 rounded-xl border-2 p-2 text-left transition-all ${isSelected ? 'border-sky-600 bg-sky-600 text-white shadow-md ring-2 ring-sky-300 dark:border-sky-500 dark:bg-sky-600 dark:ring-sky-500' : 'border-stone-300 bg-white text-stone-900 shadow-sm hover:border-sky-400 hover:shadow-md dark:border-stone-600 dark:bg-stone-800 dark:text-white'}`}>
                    <span className={`block text-sm font-black leading-tight ${isSelected ? 'text-white' : 'text-stone-900 dark:text-white'}`}>{category.name}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="bg-white dark:bg-stone-800 p-4 sm:p-5 rounded-3xl border border-stone-200/80 dark:border-stone-700/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-700/60">
              <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Panel de Búsqueda y Filtros</span>
              </h3>
              <div className="text-xs font-semibold text-stone-400">Ubicación: {selectedCity}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Buscar Producto o Marca</label>

                <div className="relative">
                  <input
                    type="text"
                    value={filters.searchQuery}
                    onChange={(e) => updateFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
                    placeholder="Ej: Leche, Playadito, TV..."
                    className="w-full pl-9 pr-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                  />
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Filtrar por Comercio</label>
                <select
                  value={filters.store}
                  onChange={(e) => updateFilters((prev) => ({ ...prev, store: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                >
                  <option value="todos">Todos los comercios</option>
                  {storesList.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Subcategoría</label>
                <select
                  value={filters.subcategory}
                  onChange={(e) => updateFilters((prev) => ({ ...prev, subcategory: e.target.value }))}
                  disabled={filters.category === 'todos'}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold disabled:opacity-60"
                >
                  <option value="todos">Todas las subcategorías</option>
                  {availableSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name} ({subcategory.productCount || 0})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Ordenar Lista Por</label>
                <SortMenu
                  value={filters.sortBy}
                  onChange={(sortBy) => updateFilters((prev) => ({ ...prev, sortBy }))}
                />

              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-stone-100 dark:border-stone-700/50">
              <span className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider">Filtros rápidos:</span>
              <button
                type="button"
                 onClick={() => updateFilters((prev) => ({ ...prev, priceStatus: 'todos' }))}
                 aria-pressed={filters.priceStatus === 'todos'}
                 className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filters.priceStatus === 'todos' ? 'bg-stone-700 text-white dark:bg-stone-200 dark:text-stone-900' : 'bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700'}`}
               >
                 Todos
               </button>
               <button
                 type="button"
                 onClick={() => updateFilters((prev) => ({ ...prev, priceStatus: 'OFERTA' }))}
                 aria-pressed={filters.priceStatus === 'OFERTA'}
                 className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filters.priceStatus === 'OFERTA' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900'}`}
              >
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                En oferta
              </button>
              <button
                type="button"
                onClick={() => updateFilters((prev) => ({ ...prev, priceStatus: 'EN_PRECIO' }))}
                aria-pressed={filters.priceStatus === 'EN_PRECIO'}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filters.priceStatus === 'EN_PRECIO' ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900'}`}
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                En precio
              </button>
              <button
                type="button"
                onClick={() => updateFilters((prev) => ({ ...prev, priceStatus: 'INFLADO' }))}
                aria-pressed={filters.priceStatus === 'INFLADO'}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filters.priceStatus === 'INFLADO' ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900'}`}
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Inflado
              </button>
            </div>
          </div>

          {isLoadingProducts ? (
            <div className="bg-white dark:bg-stone-800 rounded-3xl p-12 text-center border border-sky-200 dark:border-sky-800 space-y-4" role="status" aria-live="polite">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 dark:text-white">{t('Cargando productos')}</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">{t('Estamos actualizando los productos de esta categoría.')}</p>
            </div>
          ) : catalogLoadError ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-amber-300 bg-amber-50 p-10 text-center text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100" role="alert">
              <AlertTriangle className="h-10 w-10" aria-hidden="true" />
              <div>
                <h3 className="text-xl font-bold">{t('No se pudieron cargar los productos actuales.')}</h3>
                <p className="mt-2 text-sm">{t('No se muestran productos para evitar información desactualizada.')}</p>
                <p className="font-bold">No se pudo conectar con la base de datos.</p>
                <p className="mt-1 text-sm">Se muestran productos de demostración; los precios no son datos actuales.</p>
              </div>
              <button
                type="button"
                onClick={() => setCatalogRefreshKey((key) => key + 1)}
                className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                Reintentar conexión
              </button>
            </div>
          )}

          {isLoadingProducts ? (
            <div className="bg-white dark:bg-stone-800 rounded-3xl p-12 text-center border border-sky-200 dark:border-sky-800 space-y-4" role="status" aria-live="polite">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 dark:text-white">Cargando productos</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">Estamos actualizando los productos de esta categoría.</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-stone-800 rounded-3xl p-12 text-center border border-stone-200/80 dark:border-stone-700/80 space-y-4">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 dark:text-white">
                {favoritesOnlyView ? 'no hay favoritos agregados' : 'No encontramos productos con los filtros seleccionados'}
              </h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">Intenta cambiar los términos de búsqueda o restablecer los filtros para ver todos los productos.</p>
              <button
                onClick={() => {
                  updateFilters({
                    category: 'todos',
                    searchQuery: '',
                    store: 'todos',
                    subcategory: 'todos',
                    sortBy: 'discount-desc',
                    maxPrice: 1000000,
                  });
                  setFavoritesOnlyView(false);
                }}
                className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Restablecer Filtros
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {paginatedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onCompare={(p) => setSelectedProductForComparison(p)}
                    onExplain={(p) => setSelectedProductForExplanation(p)}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={favorites.includes(product.id)}
                    onAddToBasket={addToBasket}
                    isInBasket={basket.some((i) => i.product.id === product.id)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setProductsPage((page) => Math.max(1, page - 1))}
                    disabled={productsPage === 1}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  >
                    Anterior
                  </button>
                  {visiblePages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setProductsPage(page)}
                      className={`min-w-10 rounded-lg border px-3 py-2 text-xs font-bold ${productsPage === page ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'}`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setProductsPage((page) => Math.min(totalPages, page + 1))}
                    disabled={productsPage === totalPages}
                    className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}

      <footer className="mt-16 bg-white dark:bg-stone-900 border-t border-stone-200/80 dark:border-stone-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-stone-100 dark:border-stone-800 pb-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 via-blue-600 to-emerald-500 flex items-center justify-center text-white">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <span className="text-xl font-black text-stone-900 dark:text-white">Ar-Price</span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md">Plataforma colaborativa e independiente para la comparación de precios en tiempo real.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setReportModalOpen(true)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer">
                Reportar precio
              </button>
              <button onClick={() => setBasketOpen(true)} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer">
                Ver Mi Canasta Ahorro
              </button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-400 font-medium">
            <p>© {new Date().getFullYear()} Ar-Price Argentina</p>
            <p>Ubicación activa: <strong className="text-sky-600 dark:text-sky-400">{selectedCity}</strong></p>
          </div>
        </div>
      </footer>

      {selectedProductForComparison && (
        <ComparisonModal
          product={selectedProductForComparison}
          onClose={() => setSelectedProductForComparison(null)}
          onAddToBasket={addToBasket}
          isInBasket={basket.some((i) => i.product.id === selectedProductForComparison.id)}
          onExplain={(p) => setSelectedProductForExplanation(p)}
        />
      )}

      <PriceExplanationModal
        product={explanationProduct}
        analysisLoadState={analysisLoadState}
        onClose={() => setSelectedProductForExplanation(null)}
      />

      {basketOpen && (
        <SmartBasketModal
          basket={basket}
          onClose={() => setBasketOpen(false)}
          onUpdateQuantity={updateBasketQuantity}
          onRemoveItem={removeFromBasket}
          onClearBasket={clearBasket}
        />
      )}

      {reportModalOpen && (
        <ReportPriceModal onClose={() => setReportModalOpen(false)} selectedCity={selectedCity} />
      )}
    </div>

  );
}