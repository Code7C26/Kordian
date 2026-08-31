import React from 'react';
import { 
  ShoppingCart, 
  Pill, 
  Tv, 
  Wrench, 
  Shirt, 
  Dog, 
  Search, 
  Sparkles, 
  TrendingDown, 
  ShieldCheck, 
  Store, 
  Zap,
  ArrowRight
} from 'lucide-react';
import { CategoryItem } from '../types';

interface HeroCategoryGridProps {
  categories: CategoryItem[];
  selectedCategory: string;
  onSelectCategory: (catId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSearchSubmit: () => void;
  activeProductsCount: number;
}

export const HeroCategoryGrid: React.FC<HeroCategoryGridProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  activeProductsCount,
}) => {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'ShoppingCart': return <ShoppingCart className="w-6 h-6" />;
      case 'Pill': return <Pill className="w-6 h-6" />;
      case 'Tv': return <Tv className="w-6 h-6" />;
      case 'Wrench': return <Wrench className="w-6 h-6" />;
      case 'Shirt': return <Shirt className="w-6 h-6" />;
      case 'Dog': return <Dog className="w-6 h-6" />;
      default: return <ShoppingCart className="w-6 h-6" />;
    }
  };

  const QUICK_SEARCH_TAGS = [
    'Chocolate', 'Licor', 'Smart TV', 'Cocina', 'Desodorante', 'Zapatillas'
  ];

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-sky-50/80 via-white to-stone-50/50 dark:from-stone-900 dark:via-stone-900 dark:to-stone-950 pb-12 pt-8 sm:pt-12 border-b border-stone-200/60 dark:border-stone-800">
      
      {/* Background Subtle Patterns */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-tr from-sky-400/10 via-blue-400/5 to-purple-400/10 blur-3xl pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Main Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-100/80 dark:bg-sky-950/80 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs font-semibold shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Monitoreo transparente de supermercados y tiendas en Argentina</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-stone-900 dark:text-white tracking-tight leading-tight">
            Encuentra el <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-600 dark:from-sky-400 dark:via-blue-400 dark:to-emerald-400 bg-clip-text text-transparent">precio justo</span> en un solo lugar
          </h1>

          <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300 leading-relaxed font-normal max-w-2xl mx-auto">
            Compara precios en tiempo real entre Becerra, Disco, Mami, Carrefour y más. 
            Detectamos ofertas reales e identificamos sobreprecios al instante.
          </p>

          {/* Integrated Search Bar */}
          <div className="pt-2 max-w-2xl mx-auto">
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                onSearchSubmit();
              }}
              className="relative flex items-center shadow-lg shadow-stone-200/50 dark:shadow-none rounded-2xl border-2 border-sky-500/30 dark:border-sky-500/40 bg-white dark:bg-stone-800 focus-within:border-sky-600 transition-all p-1.5"
            >
              <div className="pl-3 text-stone-400">
                <Search className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Busca por producto, marca o categoría (ej: Yerba, TV, Leche)..."
                className="w-full px-3 py-2.5 text-stone-900 dark:text-white placeholder-stone-400 bg-transparent text-sm sm:text-base focus:outline-none"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-semibold text-sm rounded-xl flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
              >
                <span>Buscar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Suggestions Tags */}
            <div className="flex items-center justify-center flex-wrap gap-1.5 mt-3 text-xs text-stone-500 dark:text-stone-400">
              <span className="font-semibold text-stone-400">Popular:</span>
              {QUICK_SEARCH_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    if (onQuickSearch) {
                      onQuickSearch(tag);
                    } else {
                      setSearchQuery(tag);
                      onSearchSubmit();
                    }
                  }}
                  className="px-2.5 py-1 rounded-md bg-stone-100 dark:bg-stone-800 hover:bg-sky-100 dark:hover:bg-sky-950/60 hover:text-sky-700 dark:hover:text-sky-300 text-stone-600 dark:text-stone-300 transition-colors border border-stone-200/60 dark:border-stone-700/60"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Categories Grid Header */}
        <div className="mt-12 mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <span>Categorías Principales</span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Selecciona una categoría para explorar productos y ofertas
            </p>
          </div>
          {selectedCategory !== 'todos' && (
            <button
              onClick={() => onSelectCategory('todos')}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
            >
              Ver todas las categorías →
            </button>
          )}
        </div>

        {/* Interactive Category Grid */}
        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`group relative min-w-[180px] sm:min-w-[190px] flex-1 snap-start text-left p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between h-36 ${
                  isSelected
                    ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/20 ring-2 ring-sky-400'
                    : 'bg-white dark:bg-stone-800/90 hover:bg-stone-50 dark:hover:bg-stone-800 border-stone-200/80 dark:border-stone-700/80 text-stone-800 dark:text-stone-100 hover:border-sky-300 dark:hover:border-sky-700 shadow-xs hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between w-full">
                  <div className={`p-2.5 rounded-xl transition-colors ${
                    isSelected 
                      ? 'bg-white/20 text-white' 
                      : 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 group-hover:bg-sky-100 dark:group-hover:bg-sky-900/60'
                  }`}>
                    {getIcon(cat.icon)}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isSelected 
                      ? 'bg-white/20 text-white' 
                      : 'bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300'
                  }`}>
                    +{cat.count}
                  </span>
                </div>

                <div>
                  <h3 className={`font-bold text-sm leading-tight ${isSelected ? 'text-white' : 'text-stone-900 dark:text-white'}`}>
                    {cat.name}
                  </h3>
                  <p className={`text-[11px] line-clamp-1 mt-0.5 ${isSelected ? 'text-sky-100' : 'text-stone-400 dark:text-stone-400'}`}>
                    {cat.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Key Feature Stats Banner */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 bg-white dark:bg-stone-800/60 p-3 sm:p-4 rounded-2xl border border-stone-200/80 dark:border-stone-700/80 shadow-xs">
          <div className="flex items-center gap-3 p-2">
            <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-stone-900 dark:text-white">Ahorro Promedio 24%</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">En compras comparadas</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2">
            <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-stone-900 dark:text-white">12+ Cadenas de Comercios</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Supermercados y tiendas</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-stone-900 dark:text-white">Alertas de Inflado</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Notifica sobreprecios</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-stone-900 dark:text-white">Precios Auditados</p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">Actualización diaria</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
