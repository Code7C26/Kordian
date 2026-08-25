import React, { useState, useEffect, useMemo } from 'react';
import { 
  Header 
} from './components/Header';
import { 
  CategoryMenuScreen 
} from './components/CategoryMenuScreen';
import { 
  ProductCard 
} from './components/ProductCard';
import { 
  ComparisonModal 
} from './components/ComparisonModal';
import { 
  SmartBasketModal 
} from './components/SmartBasketModal';

import { CATEGORIES, MOCK_PRODUCTS, STORES_LIST } from './data/mockProducts';
import { Product, FilterState, BasketItem } from './types';
import { 
  Search, 
  Filter, 
  SlidersHorizontal, 
  ChevronRight, 
  Store, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  Sparkles,
  Heart,
  ShoppingBag,
  TrendingDown,
  ArrowLeft,
  Grid
} from 'lucide-react';

export default function App() {
  // Navigation phase: 'categories' (Phase 1) vs 'products' (Phase 2)
  const [viewMode, setViewMode] = useState<'categories' | 'products'>('categories');

  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('arprice_theme') === 'dark' || 
      (!('arprice_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  // Location state
  const [selectedCity, setSelectedCity] = useState<string>('Alta Gracia');

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    category: 'todos',
    searchQuery: '',
    store: 'todos',
    priceStatus: 'todos',
    sortBy: 'discount-desc',
    maxPrice: 1000000,
  });

  // User Interactive Modals
  const [selectedProductForComparison, setSelectedProductForComparison] = useState<Product | null>(null);
  const [basketOpen, setBasketOpen] = useState<boolean>(false);
  const [favoritesOnlyView, setFavoritesOnlyView] = useState<boolean>(false);

  // Favorites & Basket persistence
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('arprice_favorites');
      return saved ? JSON.parse(saved) : ['prod-1', 'prod-4'];
    } catch (e) {
      return ['prod-1', 'prod-4'];
    }
  });

  const [basket, setBasket] = useState<BasketItem[]>(() => {
    try {
      const saved = localStorage.getItem('arprice_basket');
      return saved ? JSON.parse(saved) : [
        { product: MOCK_PRODUCTS[0], quantity: 2 },
        { product: MOCK_PRODUCTS[7], quantity: 3 }
      ];
    } catch (e) {
      return [];
    }
  });

  // Apply dark mode class to root HTML
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      localStorage.setItem('arprice_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      localStorage.setItem('arprice_theme', 'light');
    }
  }, [darkMode]);

  // Persist Favorites & Basket
  useEffect(() => {
    localStorage.setItem('arprice_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('arprice_basket', JSON.stringify(basket));
  }, [basket]);

  // Favorites Handlers
  const toggleFavorite = (product: Product) => {
    setFavorites(prev => 
      prev.includes(product.id)
        ? prev.filter(id => id !== product.id)
        : [...prev, product.id]
    );
  };

  // Basket Handlers
  const addToBasket = (product: Product) => {
    setBasket(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateBasketQuantity = (productId: string, delta: number) => {
    setBasket(prev => 
      prev.map(item => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean) as BasketItem[]
    );
  };

  const removeFromBasket = (productId: string) => {
    setBasket(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearBasket = () => {
    setBasket([]);
  };

  // Filtered products memory calculation
  const filteredProducts = useMemo(() => {
    return MOCK_PRODUCTS.filter(product => {
      // Favorites filter
      if (favoritesOnlyView && !favorites.includes(product.id)) {
        return false;
      }

      // Category filter
      if (filters.category !== 'todos' && product.category !== filters.category) {
        return false;
      }

      // Search query filter
      if (filters.searchQuery.trim() !== '') {
        const query = filters.searchQuery.toLowerCase();
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesBrand = product.brand.toLowerCase().includes(query);
        const matchesSubcat = product.subcategory.toLowerCase().includes(query);
        const matchesStore = product.primaryStore.name.toLowerCase().includes(query);
        if (!matchesName && !matchesBrand && !matchesSubcat && !matchesStore) {
          return false;
        }
      }

      // Store filter
      if (filters.store !== 'todos') {
        const hasStore = product.otherStores.some(s => s.storeId === filters.store) || 
                         product.primaryStore.id === filters.store;
        if (!hasStore) return false;
      }

      // Price Status filter
      if (filters.priceStatus === 'EN_PRECIO') {
        if (product.status !== 'EN_PRECIO' && product.status !== 'OFERTA') return false;
      } else if (filters.priceStatus === 'INFLADO') {
        if (product.status !== 'INFLADO' && product.status !== 'SOBREPRECIO') return false;
      }

      // Max Price filter
      if (product.currentPrice > filters.maxPrice) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      switch (filters.sortBy) {
        case 'price-asc':
          return a.currentPrice - b.currentPrice;
        case 'price-desc':
          return b.currentPrice - a.currentPrice;
        case 'discount-desc':
          return a.percentageDiff - b.percentageDiff; // Lowest percentage diff first (e.g. -22% before +35%)
        case 'rating-desc':
          return b.rating - a.rating;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [filters, favoritesOnlyView, favorites]);

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

  const handleSelectCategory = (catId: string) => {
    setFilters(prev => ({ ...prev, category: catId }));
    setFavoritesOnlyView(false);
    setViewMode('products');
  };

  const currentCategoryName = CATEGORIES.find(c => c.id === filters.category)?.name || 'Todos los productos';

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans transition-colors duration-200">
      
      {/* Top Sticky Header */}
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        selectedCity={selectedCity}
        setSelectedCity={setSelectedCity}
        basketCount={basket.reduce((acc, i) => acc + i.quantity, 0)}
        onOpenBasket={() => setBasketOpen(true)}
        favoritesCount={favorites.length}
        onOpenFavorites={() => {
          setFavoritesOnlyView(!favoritesOnlyView);
          setViewMode('products');
        }}
        onResetView={resetFilters}
      />

      {/* PHASE 1: Category Selection Menu (Pantalla Inicial) */}
      {viewMode === 'categories' ? (
        <CategoryMenuScreen
          categories={CATEGORIES}
          onSelectCategory={handleSelectCategory}
        />
      ) : (
        /* PHASE 2: Products List, Filters & Search */
        <main id="products-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          
          {/* Phase 2 Navigation Bar (Back to Category Menu + Quick Category Pills) */}
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
                <span className="px-3 py-1 rounded-full bg-sky-600 text-white font-extrabold text-xs">
                  {favoritesOnlyView ? '❤️ Favoritos' : currentCategoryName}
                </span>
              </div>
            </div>

            {/* Quick Category Selector Pills */}
            <div className="pt-2 border-t border-stone-100 dark:border-stone-700/50 flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              <span className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider shrink-0 mr-1">
                Cambiar:
              </span>
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

              {CATEGORIES.map((cat) => (
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

          {/* Breadcrumb Navigation & Results Count */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-stone-800 p-4 rounded-2xl border border-stone-200/80 dark:border-stone-700/80 shadow-xs">
            
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-stone-500 dark:text-stone-400">
              <button 
                onClick={resetFilters} 
                className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                Inicio
              </button>
              <ChevronRight className="w-4 h-4 text-stone-400" />
              <span className="text-stone-900 dark:text-white font-bold">
                {favoritesOnlyView ? '❤️ Mis Favoritos' : currentCategoryName}
              </span>
              {filters.searchQuery && (
                <>
                  <ChevronRight className="w-4 h-4 text-stone-400" />
                  <span className="text-sky-600 dark:text-sky-400 italic">
                    "{filters.searchQuery}"
                  </span>
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

          {/* Interactive Filter Toolbar */}
          <div className="bg-white dark:bg-stone-800 p-4 sm:p-5 rounded-3xl border border-stone-200/80 dark:border-stone-700/80 shadow-xs space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-700/60">
              <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>Panel de Búsqueda y Filtros</span>
              </h3>

              <div className="text-xs font-semibold text-stone-400">
                Ubicación: {selectedCity}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Search Input Filter */}
              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
                  Buscar Producto o Marca
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={filters.searchQuery}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                    placeholder="Ej: Leche, Playadito, TV..."
                    className="w-full pl-9 pr-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                  />
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                </div>
              </div>

              {/* Store / Comercio Filter */}
              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
                  Filtrar por Comercio
                </label>
                <select
                  value={filters.store}
                  onChange={(e) => setFilters(prev => ({ ...prev, store: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                >
                  <option value="todos">Todos los comercios</option>
                  {STORES_LIST.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Status Filter (Key requirement buttons / dropdown) */}
              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
                  Estado del Precio
                </label>
                <select
                  value={filters.priceStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, priceStatus: e.target.value as any }))}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                >
                  <option value="todos">Todos los estados</option>
                  <option value="EN_PRECIO">👍 Solo ¡En Precio!</option>
                  <option value="INFLADO">⚠️ Solo Ojo, Inflados</option>
                </select>
              </div>

              {/* Sort Order Selector */}
              <div>
                <label className="block text-[11px] font-extrabold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
                  Ordenar Lista Por
                </label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
                  className="w-full px-3 py-2.5 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold"
                >
                  <option value="discount-desc">🔥 Mayor Descuento primero</option>
                  <option value="price-asc">💵 Menor Precio primero</option>
                  <option value="price-desc">💰 Mayor Precio primero</option>
                  <option value="name-asc">🔤 Orden Alfabético (A-Z)</option>
                </select>
              </div>

            </div>

            {/* Quick Price Status Filter Chips */}
            <div className="flex items-center gap-2 pt-2 border-t border-stone-100 dark:border-stone-700/50">
              <span className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider">Filtro Rápido:</span>
              <button
                onClick={() => setFilters(prev => ({ ...prev, priceStatus: 'todos' }))}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filters.priceStatus === 'todos'
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-100 dark:bg-stone-700/60 text-stone-600 dark:text-stone-300'
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, priceStatus: 'EN_PRECIO' }))}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filters.priceStatus === 'EN_PRECIO'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                }`}
              >
                ¡En Precio! 👍
              </button>
              <button
                onClick={() => setFilters(prev => ({ ...prev, priceStatus: 'INFLADO' }))}
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

          {/* Product Cards Grid Section */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-stone-800 rounded-3xl p-12 text-center border border-stone-200/80 dark:border-stone-700/80 space-y-4">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
                <Search className="w-8 h-8" />
              </div>

              <h3 className="text-xl font-bold text-stone-900 dark:text-white">
                No encontramos productos con los filtros seleccionados
              </h3>

              <p className="text-sm text-stone-500 dark:text-stone-400 max-w-md mx-auto">
                Intenta cambiar los términos de búsqueda o restablecer los filtros para ver todos los productos.
              </p>

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
                  isInBasket={basket.some(i => i.product.id === product.id)}
                />
              ))}
            </div>
          )}

        </main>
      )}

      {/* Footer */}
      <footer className="mt-16 bg-white dark:bg-stone-900 border-t border-stone-200/80 dark:border-stone-800 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-stone-100 dark:border-stone-800 pb-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 via-blue-600 to-emerald-500 flex items-center justify-center text-white">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <span className="text-xl font-black bg-gradient-to-r from-sky-600 to-emerald-600 bg-clip-text text-transparent">
                  ARPrice
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-md">
                Plataforma colaborativa e independiente para la comparación de precios en tiempo real.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setBasketOpen(true)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
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

      {/* Interactive Modals */}
      {selectedProductForComparison && (
        <ComparisonModal
          product={selectedProductForComparison}
          onClose={() => setSelectedProductForComparison(null)}
          onAddToBasket={addToBasket}
          isInBasket={basket.some(i => i.product.id === selectedProductForComparison.id)}
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

    </div>
  );
}

