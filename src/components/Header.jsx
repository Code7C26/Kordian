import React, { useState } from 'react';
import { 
  TrendingDown, 
  MapPin, 
  Sun, 
  Moon, 
  ShoppingBag, 
  Heart, 
  ChevronDown, 
  Check
} from 'lucide-react';
import { CITIES_LIST } from '../data/mockProducts';

export function Header({
  darkMode,
  setDarkMode,
  selectedCity,
  setSelectedCity,
  basketCount,
  onOpenBasket,
  favoritesCount,
  onOpenFavorites,
  onResetView,
}) {
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-800 bg-gradient-to-r from-stone-900/95 to-stone-900/95 dark:bg-gradient-to-r dark:from-stone-950 dark:to-stone-900 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 md:h-20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onResetView}
            className="flex items-center gap-2.5 group text-left focus:outline-none cursor-pointer"
            title="Ir al inicio de ARPrice"
          >
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-sky-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-black/30 group-hover:scale-105 transition-transform duration-200">
              <TrendingDown className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-600 dark:from-sky-400 dark:via-blue-400 dark:to-emerald-400 bg-clip-text text-transparent">
                  ARPrice
                </span>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-sky-700/10 dark:bg-sky-900/60 text-sky-300 border border-sky-700/30">
                  AR
                </span>
              </div>
              <p className="hidden md:block text-[10px] font-medium text-stone-500 dark:text-stone-400 leading-none mt-0.5">
                Precios Justos & Transparente
              </p>
            </div>
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-200 bg-stone-800/40 hover:bg-stone-800/60 dark:bg-stone-900/40 rounded-xl transition-colors border border-stone-700/40 cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="max-w-[120px] sm:max-w-[180px] truncate">{selectedCity}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform duration-200 ${cityDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {cityDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setCityDropdownOpen(false)}
              />
              <div className="absolute left-0 mt-2 w-64 z-20 bg-white dark:bg-stone-800 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700 py-1.5 overflow-hidden text-sm">
                <div className="px-3 py-2 text-xs font-semibold text-stone-400 uppercase tracking-wider border-b border-stone-100 dark:border-stone-700/50">
                  Seleccionar Ubicación
                </div>
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                  {CITIES_LIST.map((city) => (
                    <button
                      key={city}
                      onClick={() => {
                        setSelectedCity(city);
                        setCityDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 flex items-center justify-between hover:bg-sky-50 dark:hover:bg-sky-950/40 text-stone-700 dark:text-stone-200 transition-colors cursor-pointer"
                    >
                      <span className={city === selectedCity ? 'font-semibold text-sky-600 dark:text-sky-400' : ''}>
                        {city}
                      </span>
                      {city === selectedCity && (
                        <Check className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onOpenFavorites}
            className="relative p-2 rounded-lg text-stone-600 dark:text-stone-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title="Ver Favoritos"
          >
            <Heart className="w-5 h-5" />
            {favoritesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {favoritesCount}
              </span>
            )}
          </button>

          <button
            onClick={onOpenBasket}
            className="relative flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-500 text-white rounded-2xl text-sm font-bold shadow-lg transition-transform hover:scale-105 cursor-pointer"
            title="Canasta Ahorro"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden md:inline">Canasta</span>
            {basketCount > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-white text-indigo-700 text-xs font-black rounded-full min-w-[20px] text-center">
                {basketCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-stone-600" />
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
