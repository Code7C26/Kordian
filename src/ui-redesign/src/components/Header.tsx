import React, { useState } from 'react';
import { 
  TrendingDown, 
  MapPin, 
  Sun, 
  Moon, 
  ShoppingBag, 
  Heart, 
  ChevronDown, 
  Check, 
  Sparkles
} from 'lucide-react';
import { CITIES_LIST } from '../data/mockProducts';

interface HeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  basketCount: number;
  onOpenBasket: () => void;
  favoritesCount: number;
  onOpenFavorites: () => void;
  onResetView: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  darkMode,
  setDarkMode,
  selectedCity,
  setSelectedCity,
  basketCount,
  onOpenBasket,
  favoritesCount,
  onOpenFavorites,
  onResetView,
}) => {
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onResetView}
            className="flex items-center gap-2.5 group text-left focus:outline-none cursor-pointer"
            title="Ir al inicio de ARPrice"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 via-blue-600 to-emerald-500 flex items-center justify-center text-white shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform duration-200">
              <TrendingDown className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-black tracking-tight bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-600 dark:from-sky-400 dark:via-blue-400 dark:to-emerald-400 bg-clip-text text-transparent">
                  ARPrice
                </span>
                <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800">
                  AR
                </span>
              </div>
              <p className="hidden md:block text-[10px] font-medium text-stone-500 dark:text-stone-400 leading-none mt-0.5">
                Precios Justos & Transparente
              </p>
            </div>
          </button>
        </div>

        {/* Location Dropdown */}
        <div className="relative">
          <button
            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800/80 hover:bg-stone-200/70 dark:hover:bg-stone-700/80 rounded-lg transition-colors border border-stone-200/60 dark:border-stone-700/60 cursor-pointer"
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

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Favorites Button */}
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

          {/* Smart Basket Button */}
          <button
            onClick={onOpenBasket}
            className="relative flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-lg text-xs sm:text-sm font-semibold shadow-sm transition-all hover:shadow-md cursor-pointer"
            title="Canasta Ahorro"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden md:inline">Canasta</span>
            {basketCount > 0 && (
              <span className="px-1.5 py-0.2 bg-white text-sky-700 text-xs font-black rounded-full min-w-[20px] text-center">
                {basketCount}
              </span>
            )}
          </button>

          {/* Dark Mode Toggle */}
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
};

