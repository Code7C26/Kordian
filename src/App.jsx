
import { useEffect, useMemo, useState } from 'react';
import { useSelectedCity } from './contexts/SelectedCityContext.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from './components/Header.jsx';
import { HeroCategoryGrid } from './components/HeroCategoryGrid.jsx';
import { DealsSummaryBanner } from './components/DealsSummaryBanner.jsx';
import { ReportPriceModal } from './components/ReportPriceModal.jsx';
import { ProductCard } from './components/ProductCard.jsx';
import { ComparisonModal } from './components/ComparisonModal.jsx';
import { SmartBasketModal } from './components/SmartBasketModal.jsx';
import PriceExplanationModal from './components/PriceExplanationModal.jsx';
import { MOCK_PRODUCTS, CATEGORIES as MOCK_CATEGORIES } from './data/mockProducts.js';
import { apiUrl } from './config/api.js';
// Data will be loaded from backend API
import { Search, SlidersHorizontal, ChevronRight, RotateCcw, ArrowLeft, TrendingDown, Tag, ThumbsUp, AlertTriangle } from 'lucide-react';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('categories');
  const [darkMode, setDarkMode] = useState(() => {
    return (
      localStorage.getItem('arprice_theme') === 'dark' ||
      (!('arprice_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const { selectedCity, setSelectedCity } = useSelectedCity();
  const [categories, setCategories] = useState([])
  const [taxonomy, setTaxonomy] = useState([])
  const [products, setProducts] = useState([])
  const [storesList, setStoresList] = useState([])
  const [filters, setFilters] = useState({
    category: 'todos',
    searchQuery: '',
    store: 'todos',
    subcategory: 'todos',
    priceStatus: 'todos',
    sortBy: 'discount-desc',
    maxPrice: 1000000,
  });
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const [selectedProductForComparison, setSelectedProductForComparison] = useState(null);
  const [selectedProductForExplanation, setSelectedProductForExplanation] = useState(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [favoritesOnlyView, setFavoritesOnlyView] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setViewMode(location.pathname === '/buscar' ? 'products' : 'categories');
    if (location.pathname === '/buscar') {
      setFilters((previous) => ({
        ...previous,
        searchQuery: params.get('q') ?? '',
        category: params.get('category') ?? 'todos',
        subcategory: 'todos',
      }));
    } else {
      setFilters((previous) => ({
        ...previous,
        searchQuery: '',
        category: 'todos',
        subcategory: 'todos',
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

  // Load categories and products from backend
  useEffect(() => {
    let mounted = true
    const loadData = async () => {
      try {
        const [catsRes, prodsRes, taxonomyRes, supermarketsRes] = await Promise.all([
          fetch(apiUrl('/categories')),
          fetch(apiUrl('/products')),
          fetch(apiUrl('/taxonomy')),
          fetch(apiUrl('/supermarkets')),
        ])

        if (!mounted) return

        if (!catsRes.ok || !prodsRes.ok) {
          throw new Error('Backend returned non-ok response')
        }

        const cats = await catsRes.json()
        const prods = await prodsRes.json()
        const taxonomyData = taxonomyRes.ok ? await taxonomyRes.json() : []
        const supermarkets = supermarketsRes.ok ? await supermarketsRes.json() : []
        const supermarketImages = new Map((supermarkets || []).map((supermarket) => [supermarket.name, supermarket.image]))
        const analysisRes = await fetch(apiUrl('/analysis/products'))
        const analyses = analysisRes.ok ? await analysisRes.json() : []
        const analysisByProduct = new Map((analyses || []).map((item) => [String(item.product?.id), item]))

        // enrich products with derived fields for the UI (defensive)
        const enriched = (prods || []).map((p) => {
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
          }
        })

        setCategories(cats || [])
        setTaxonomy(taxonomyData || [])
        setProducts(enriched)

        // derive stores list from offers
        const storesSet = new Set()
        prods.forEach((p) => {
          (p.offers || []).forEach((o) => {
            if (o.supermarket) storesSet.add(o.supermarket)
          })
        })

        const storesArr = Array.from(storesSet).map((name) => ({ id: name, name, image: supermarketImages.get(name) || '' }))
        setStoresList(storesArr)
      } catch (err) {
        console.error('Error loading data', err)
        if (!mounted) return

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
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [])

  const toggleFavorite = (product) => {
    setFavorites((prev) =>
      prev.includes(product.id) ? prev.filter((id) => id !== product.id) : [...prev, product.id]
    );
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

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (favoritesOnlyView && !favorites.includes(product.id)) {
        return false;
      }

      if (filters.category !== 'todos' && product.category_id !== filters.category && product.category !== filters.category) {
        return false;
      }

      if (filters.subcategory !== 'todos' && product.subcategory_id !== filters.subcategory) {
        return false;
      }

      if (filters.searchQuery.trim() !== '') {
        const query = filters.searchQuery.toLowerCase();
        const matchesName = (product.name || '').toLowerCase().includes(query);
        const matchesBrand = (product.brand || '').toLowerCase().includes(query);
        const matchesSubcat = (product.subcategory || '').toLowerCase().includes(query);
        // offers and supermarket names
        const matchesStore = (product.offers || []).some((o) => ((o.supermarket || '') + '').toLowerCase().includes(query));
        if (!matchesName && !matchesBrand && !matchesSubcat && !matchesStore) {
          return false;
        }
      }

      if (filters.store !== 'todos') {
        const hasStore = (product.offers || []).some((o) => (o.supermarket || '') === filters.store);
        if (!hasStore) return false;
      }

      const rawStatus = (product.status || '').toString().toUpperCase();
      const derivedStatus = rawStatus || (product.currentPrice <= product.avgMarketPrice ? 'EN_PRECIO' : 'INFLADO');
      if (filters.priceStatus === 'OFERTA' && derivedStatus !== 'OFERTA') return false;
      if (filters.priceStatus === 'EN_PRECIO' && derivedStatus !== 'EN_PRECIO' && derivedStatus !== 'PRECIO_NORMAL') return false;
      if (filters.priceStatus === 'INFLADO' && derivedStatus !== 'INFLADO' && derivedStatus !== 'AUMENTO_ATIPICO' && derivedStatus !== 'SOBREPRECIO') return false;

      // attempt to evaluate current price from offers (min cash_price)
      const currentPrice = (product.offers || []).reduce((min, o) => {
        const p = Number(o.cash_price) || 0
        if (min === null) return p
        return p && p < min ? p : min
      }, null)

      if (currentPrice && currentPrice > filters.maxPrice) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      switch (filters.sortBy) {
        case 'price-asc':
          return (a.currentPrice || 0) - (b.currentPrice || 0);
        case 'price-desc':
          return (b.currentPrice || 0) - (a.currentPrice || 0);
        case 'discount-desc':
          return (b.percentageDiff || 0) - (a.percentageDiff || 0);
        case 'rating-desc':
          return (b.rating || 0) - (a.rating || 0);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [filters, favoritesOnlyView, favorites, products]);

  const resetFilters = () => {
    setFilters({
      category: 'todos',
      searchQuery: '',
      store: 'todos',
      subcategory: 'todos',
      priceStatus: 'todos',
      sortBy: 'discount-desc',
      maxPrice: 1000000,
    });
    setFavoritesOnlyView(false);
    setViewMode('categories');
    navigate('/');
  };

  const handleSelectCategory = (catId) => {
    setFilters((prev) => ({ ...prev, category: catId, subcategory: 'todos' }));
    setFavoritesOnlyView(false);
    setViewMode('products');
    navigate(`/buscar${catId !== 'todos' ? `?category=${encodeURIComponent(catId)}` : ''}`);
  };

  const navigateToSearch = () => {
    const query = filters.searchQuery.trim();
    navigate(`/buscar${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  };

  const currentCategoryName = categories.find((c) => c.id === filters.category)?.name || 'Todos los productos';
  const selectedTaxonomyCategory = taxonomy.find((category) => String(category.id) === String(filters.category));
  const availableSubcategories = selectedTaxonomyCategory?.subcategories || [];

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
          setFavoritesOnlyView((prev) => !prev);
          setViewMode('products');
          navigate('/buscar');
        }}
        onResetView={resetFilters}
        isAdminPage={false}
      />

      {viewMode === 'categories' ? (
        <>
          <HeroCategoryGrid
            categories={categories}
            selectedCategory={filters.category}
            onSelectCategory={handleSelectCategory}
            searchQuery={filters.searchQuery}
            setSearchQuery={(value) => setFilters((prev) => ({ ...prev, searchQuery: value }))}
            onSearchSubmit={navigateToSearch}
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
                Mostrando <strong className="text-sky-600 dark:text-sky-400 font-extrabold">{filteredProducts.length}</strong> productos
              </span>
              {(filters.category !== 'todos' || filters.subcategory !== 'todos' || filters.searchQuery || filters.store !== 'todos' || favoritesOnlyView) && (
                <button
                  onClick={() => {
                    setFilters({
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
                    onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
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
                  onChange={(e) => setFilters((prev) => ({ ...prev, store: e.target.value }))}
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
                  onChange={(e) => setFilters((prev) => ({ ...prev, subcategory: e.target.value }))}
                  disabled={filters.category === 'todos'}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold disabled:opacity-60"
                >
                  <option value="todos">Todas las subcategorías</option>
                  {availableSubcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Ordenar Lista Por</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters((prev) => ({ ...prev, sortBy: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                >
                  <option value="discount-desc">🔥 Mayor Descuento primero</option>
                  <option value="price-asc">💵 Menor Precio primero</option>
                  <option value="price-desc">💰 Mayor Precio primero</option>
                  <option value="name-asc">🔤 Orden Alfabético (A-Z)</option>
                </select>

              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-stone-100 dark:border-stone-700/50">
              <span className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider">Filtros rápidos:</span>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, priceStatus: 'OFERTA' }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filters.priceStatus === 'OFERTA' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900'}`}
              >
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                En oferta
              </button>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, priceStatus: 'EN_PRECIO' }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filters.priceStatus === 'EN_PRECIO' ? 'bg-sky-600 text-white' : 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900'}`}
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                En precio
              </button>
              <button
                type="button"
                onClick={() => setFilters((prev) => ({ ...prev, priceStatus: 'INFLADO' }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${filters.priceStatus === 'INFLADO' ? 'bg-rose-600 text-white' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900'}`}
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Inflado
              </button>
            </div>

          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-stone-800 rounded-3xl p-12 text-center border border-stone-200/80 dark:border-stone-700/80 space-y-4">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-900 dark:text-white">No encontramos productos con los filtros seleccionados</h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">Intenta cambiar los términos de búsqueda o restablecer los filtros para ver todos los productos.</p>
              <button
                onClick={() => {
                  setFilters({
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {filteredProducts.map((product) => (
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
                <span className="text-xl font-black bg-gradient-to-r from-sky-600 to-emerald-600 bg-clip-text text-transparent">ARPrice</span>
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
            <p>© {new Date().getFullYear()} ARPrice Argentina. Comparativa libre e independiente.</p>
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
        product={selectedProductForExplanation}
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