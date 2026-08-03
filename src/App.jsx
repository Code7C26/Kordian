import React, { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header.jsx';
import { HeroCategoryGrid } from './components/HeroCategoryGrid.jsx';
import { DealsSummaryBanner } from './components/DealsSummaryBanner.jsx';
import { ReportPriceModal } from './components/ReportPriceModal.jsx';
import { ProductCard } from './components/ProductCard.jsx';
import { ComparisonModal } from './components/ComparisonModal.jsx';
import { SmartBasketModal } from './components/SmartBasketModal.jsx';
import { MOCK_PRODUCTS, CATEGORIES as MOCK_CATEGORIES } from './data/mockProducts.js';
// Data will be loaded from backend API
import { Search, SlidersHorizontal, ChevronRight, RotateCcw, ArrowLeft, TrendingDown } from 'lucide-react';

export default function App() {
  const [viewMode, setViewMode] = useState('categories');
  const [darkMode, setDarkMode] = useState(() => {
    return (
      localStorage.getItem('arprice_theme') === 'dark' ||
      (!('arprice_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const [selectedCity, setSelectedCity] = useState('Buenos Aires - CABA');
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [storesList, setStoresList] = useState([])
  const [filters, setFilters] = useState({
    category: 'todos',
    searchQuery: '',
    store: 'todos',
    priceStatus: 'todos',
    sortBy: 'discount-desc',
    maxPrice: 1000000,
  });
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);

  const [selectedProductForComparison, setSelectedProductForComparison] = useState(null);
  const [basketOpen, setBasketOpen] = useState(false);
  const [favoritesOnlyView, setFavoritesOnlyView] = useState(false);

  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem('arprice_favorites');
      return saved ? JSON.parse(saved) : ['prod-1', 'prod-4'];
    } catch (e) {
      return ['prod-1', 'prod-4'];
    }
  });

  const [basket, setBasket] = useState(() => {
    try {
      const saved = localStorage.getItem('arprice_basket');
      return saved
        ? JSON.parse(saved)
        : [];
    } catch (e) {
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
        const [catsRes, prodsRes] = await Promise.all([
          fetch('http://localhost:3000/categories'),
          fetch('http://localhost:3000/products'),
        ])

        if (!mounted) return

        if (!catsRes.ok || !prodsRes.ok) {
          throw new Error('Backend returned non-ok response')
        }

        const cats = await catsRes.json()
        const prods = await prodsRes.json()

        // enrich products with derived fields for the UI (defensive)
        const enriched = (prods || []).map((p) => {
          const offers = p.offers || []
          const otherStores = offers.map((o) => ({ id: o.id, price: Number(o.cash_price) || 0, supermarket: o.supermarket || '' }))
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

          return {
            ...p,
            brand: p.brand || p.brands?.name || '',
            subcategory: p.subcategory || p.categories?.name || '',
            currentPrice,
            primaryStore: primary ? { name: primary.supermarket, id: primary.id } : { name: '', id: null },
            avgMarketPrice,
            percentageDiff,
            status,
            otherStores,
            unit: p.unit || '',
          }
        })

        setCategories(cats || [])
        setProducts(enriched)

        // derive stores list from offers
        const storesSet = new Set()
        prods.forEach((p) => {
          (p.offers || []).forEach((o) => {
            if (o.supermarket) storesSet.add(o.supermarket)
          })
        })

        const storesArr = Array.from(storesSet).map((name, i) => ({ id: name, name }))
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
        setUsingMockData(true)

        const storesSet = new Set()
        enriched.forEach((p) => {
          (p.otherStores || []).forEach((o) => {
            if (o.storeName) storesSet.add(o.storeName)
          })
          if (p.primaryStore?.name) storesSet.add(p.primaryStore.name)
        })

        const storesArr = Array.from(storesSet).map((name, i) => ({ id: name, name }))
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
    const offer = selectedOffer || {
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

      const rawStatus = (product.status || '').toString().toUpperCase()
      const derivedStatus = rawStatus || (product.currentPrice <= product.avgMarketPrice ? 'EN_PRECIO' : 'INFLADO')

      if (filters.priceStatus === 'EN_PRECIO') {
        if (derivedStatus !== 'EN_PRECIO' && derivedStatus !== 'OFERTA') return false;
      } else if (filters.priceStatus === 'INFLADO') {
        if (derivedStatus !== 'INFLADO' && derivedStatus !== 'SOBREPRECIO') return false;
      }

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
      priceStatus: 'todos',
      sortBy: 'discount-desc',
      maxPrice: 1000000,
    });
    setFavoritesOnlyView(false);
    setViewMode('categories');
  };

  const handleSelectCategory = (catId) => {
    setFilters((prev) => ({ ...prev, category: catId }));
    setFavoritesOnlyView(false);
    setViewMode('products');
  };

  const currentCategoryName = categories.find((c) => c.id === filters.category)?.name || 'Todos los productos';

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
        }}
        onResetView={resetFilters}
      />

      {viewMode === 'categories' ? (
        <>
          <HeroCategoryGrid
            categories={categories}
            selectedCategory={filters.category}
            onSelectCategory={handleSelectCategory}
            searchQuery={filters.searchQuery}
            setSearchQuery={(value) => setFilters((prev) => ({ ...prev, searchQuery: value }))}
            onSearchSubmit={() => setViewMode('products')}
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
              }}
            />
          </div>
        </>
      ) : (
        <main id="products-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="bg-white dark:bg-stone-800 p-4 rounded-3xl border border-stone-200/80 dark:border-stone-700/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <button
                onClick={() => setViewMode('categories')}
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
            <div className="pt-2 border-t border-stone-100 dark:border-stone-700/50 flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              <span className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider shrink-0 mr-1">Cambiar:</span>
              <button
                onClick={() => handleSelectCategory('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                  filters.category === 'todos' && !favoritesOnlyView
                    ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs'
                    : 'bg-stone-100 dark:bg-stone-700/60 text-stone-600 dark:text-stone-300 hover:bg-stone-200'
                }`}
              >
                Todos los productos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    filters.category === cat.id && !favoritesOnlyView
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-stone-100 dark:bg-stone-700/60 text-stone-600 dark:text-stone-300 hover:bg-sky-50 dark:hover:bg-sky-950/50 hover:text-sky-600'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
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
              {(filters.category !== 'todos' || filters.searchQuery || filters.store !== 'todos' || filters.priceStatus !== 'todos' || favoritesOnlyView) && (
                <button
                  onClick={() => {
                    setFilters({
                      category: filters.category,
                      searchQuery: '',
                      store: 'todos',
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
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">Estado del Precio</label>
                <select
                  value={filters.priceStatus}
                  onChange={(e) => setFilters((prev) => ({ ...prev, priceStatus: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                >
                  <option value="todos">Todos los estados</option>
                  <option value="EN_PRECIO">👍 Solo ¡En Precio!</option>
                  <option value="INFLADO">⚠️ Solo Ojo, Inflados</option>
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

            <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-stone-700/50">
              <span className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider">Filtro Rápido:</span>
              <button
                onClick={() => setFilters((prev) => ({ ...prev, priceStatus: 'todos' }))}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filters.priceStatus === 'todos'
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-100 dark:bg-stone-700/60 text-stone-600 dark:text-stone-300'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilters((prev) => ({ ...prev, priceStatus: 'EN_PRECIO' }))}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filters.priceStatus === 'EN_PRECIO'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                }`}
              >
                ¡En Precio! 👍
              </button>
              <button
                onClick={() => setFilters((prev) => ({ ...prev, priceStatus: 'INFLADO' }))}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filters.priceStatus === 'INFLADO'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                }`}
              >
                Ojo, Inflado ⚠️
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
                    priceStatus: 'todos',
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
        />
      )}

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
