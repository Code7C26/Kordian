// Component for hero category grid
import { useState } from 'react';
import {
  Search,
  ArrowRight,
  Clock3,
  X,
} from 'lucide-react';
import { CategoryIconImage, getCategoryIconAsset } from '../utils/categoryIconAssets.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';

const QUICK_SEARCH_TAGS = [
  'Chocolate',        // Alimentos Frescos y Refrigerados
  'Licor',            // Almacén y Alimentos
  'Smart TV',         // Electrónica y Electrodomésticos
  'Cocina',           // Hogar y Otros
  'Desodorante',      // Limpieza e Higiene
  'Zapatillas',       // Ropa y Calzado
];

export function HeroCategoryGrid({
  categories,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  setSearchQuery,
  onSearchSubmit,
  onQuickSearch,
  searchHistory = [],
  registeredMerchantCount,
  onSelectSearch,
  onRemoveSearch,
  onClearSearch,
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const { t } = useLanguage();

  return (
    <div className="relative overflow-hidden bg-stone-50 pb-12 pt-8 sm:pt-12 border-b border-stone-200 dark:bg-stone-950 dark:border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-5xl mx-auto space-y-5">
          <h1 className="hero-title-font mx-auto max-w-5xl text-balance text-4xl font-black leading-[1.08] tracking-[-0.04em] text-stone-950 dark:text-white sm:text-5xl md:text-6xl">
            {t('Encontrá el ')}<span className="animated-price-gradient bg-gradient-to-r from-sky-500 via-blue-600 to-cyan-500 bg-clip-text text-transparent">{t('precio justo')}</span>{t(' para cada compra')}
          </h1>

          <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300 leading-relaxed font-normal max-w-2xl mx-auto">
            {t('Explorá productos, compará precios y encontrá ofertas en comercios de tu zona.')}
          </p>

          <div className="pt-2 max-w-2xl mx-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSearchSubmit();
                setSearchFocused(false);
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
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder={t('Busca por producto, marca o categoría (ej: Yerba, TV, Leche)...')}
                className="w-full px-3 py-2.5 text-stone-900 dark:text-white placeholder-stone-400 bg-transparent text-sm sm:text-base focus:outline-none"
              />
              {searchFocused && searchHistory.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-sky-200 bg-white text-left shadow-xl dark:border-sky-900 dark:bg-stone-800">
                  <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2 dark:border-stone-700">
                    <span className="flex items-center gap-2 text-xs font-bold text-stone-500 dark:text-stone-300"><Clock3 className="h-3.5 w-3.5 text-sky-500" /> {t('Búsquedas recientes')}</span>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClearSearch} className="text-[11px] font-semibold text-sky-600 hover:text-sky-800 dark:text-sky-300">{t('Borrar historial')}</button>
                  </div>
                  {searchHistory.map((query) => (
                    <div key={query} className="flex items-center gap-2 px-3 py-2 hover:bg-sky-50 dark:hover:bg-sky-950/40">
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelectSearch(query); setSearchFocused(false) }} className="flex min-w-0 flex-1 items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
                        <Clock3 className="h-4 w-4 shrink-0 text-sky-500" /><span className="truncate">{query}</span>
                      </button>
                      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onRemoveSearch(query)} className="rounded p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 dark:hover:bg-stone-700" aria-label={`${t('Eliminar búsqueda')} ${query}`}><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm rounded-xl flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
              >
                <span>{t('Buscar')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div aria-label={t('Búsquedas populares')} className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="mr-1 font-semibold text-stone-500 dark:text-stone-400">{t('Búsquedas populares')}</span>
              {QUICK_SEARCH_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    if (onQuickSearch) {
                      onQuickSearch(tag);
                    } else {
                      setSearchQuery(tag);
                      onSearchSubmit();
                    }
                  }}
                  className="rounded-full border border-sky-600 bg-sky-600 px-3 py-1.5 font-semibold text-white transition-colors hover:border-sky-700 hover:bg-sky-700 dark:border-sky-500 dark:bg-sky-600 dark:hover:border-sky-400 dark:hover:bg-sky-500"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <span>{t('Categorías Principales')}</span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">{t('Selecciona una categoría para explorar productos y ofertas')}</p>
          </div>
        </div>

        <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const categoryIcon = getCategoryIconAsset(cat);
            return (
              <button
                type="button"
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`group relative min-w-[180px] sm:min-w-[190px] flex-1 snap-start text-left p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between h-36 ${
                  isSelected
                    ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/20 ring-2 ring-sky-400'
                    : 'bg-white dark:bg-stone-800/90 hover:bg-stone-50 dark:hover:bg-stone-800 border-stone-200/80 dark:border-stone-700/80 text-stone-800 dark:text-stone-100 hover:border-sky-300 dark:hover:border-sky-700 shadow-xs hover:shadow-md'
                }`}
              >
                <div className="flex w-full items-start justify-between">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 group-hover:bg-sky-100 dark:group-hover:bg-sky-900/60'
                  }`}>
                    <CategoryIconImage src={categoryIcon} className="h-9 w-9" />
                  </div>
                </div>
                <div>
                  <h3 className={`font-bold text-sm leading-tight ${
                    isSelected ? 'text-white' : 'text-stone-900 dark:text-white'
                  }`}>
                    {cat.name}
                  </h3>
                  <p className={`text-[11px] line-clamp-1 mt-0.5 ${
                    isSelected ? 'text-sky-100' : 'text-stone-400 dark:text-stone-400'
                  }`}>
                    {cat.description}
                  </p>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onSelectCategory('todos')}
            className={`group relative order-first min-w-[180px] sm:min-w-[190px] flex-1 snap-start text-left p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between h-36 ${
              selectedCategory === 'todos'
                ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/20 ring-2 ring-sky-400'
                : 'bg-white dark:bg-stone-800/90 hover:bg-stone-50 dark:hover:bg-stone-800 border-stone-200/80 dark:border-stone-700/80 text-stone-800 dark:text-stone-100 hover:border-sky-300 dark:hover:border-sky-700 shadow-xs hover:shadow-md'
            }`}
          >
            <div className="flex w-full items-start justify-between">
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${selectedCategory === 'todos' ? 'bg-white/20 text-white' : 'bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400'}`}>
                <CategoryIconImage src={getCategoryIconAsset({ id: 'todos' })} className="h-9 w-9" />
              </div>
            </div>
            <div>
              <h3 className={`font-bold text-sm leading-tight ${selectedCategory === 'todos' ? 'text-white' : 'text-stone-900 dark:text-white'}`}>
                Todos
              </h3>
              <p className={`text-[11px] line-clamp-1 mt-0.5 ${selectedCategory === 'todos' ? 'text-sky-100' : 'text-stone-400 dark:text-stone-400'}`}>
                Todos los productos
              </p>
            </div>
          </button>
        </div>

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
              <p className="text-xs font-extrabold text-stone-900 dark:text-white">
                {Number.isInteger(registeredMerchantCount)
                  ? `${registeredMerchantCount} ${registeredMerchantCount === 1 ? 'Comercio registrado' : 'Comercios registrados'}`
                  : 'Comercios registrados'}
              </p>
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
        <p className="mt-3 text-right text-[10px] text-stone-400 dark:text-stone-500">
          Íconos por <a className="underline underline-offset-2 hover:text-sky-600 dark:hover:text-sky-400" href="https://www.flaticon.es/autores/magnific" target="_blank" rel="noreferrer">Magnific</a> en <a className="underline underline-offset-2 hover:text-sky-600 dark:hover:text-sky-400" href="https://www.flaticon.es" target="_blank" rel="noreferrer">Flaticon</a>
        </p>
      </div>
    </div>
  );
}
