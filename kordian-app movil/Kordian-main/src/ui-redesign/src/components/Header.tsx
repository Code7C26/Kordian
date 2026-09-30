import React from 'react';
import { 
  MapPin, 
  Sun, 
  Moon, 
  ShoppingBag, 
  Heart,
} from 'lucide-react';
import brandLogo from '../../../../assents/Ar-Price/Logo_final.svg';
import brandLogoDark from '../../../../assents/Ar-Price/Logo_final_Negativo.svg';

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
  return (
    <header className="sticky top-0 z-40 w-full border-b border-sky-400/30 dark:border-stone-800 bg-sky-600 dark:bg-stone-900/90 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3">
          <button 
            onClick={onResetView}
            className="flex items-center gap-2.5 group text-left focus:outline-none cursor-pointer"
            title="Ir al inicio de ARPrice"
          >
            <div className="relative flex items-center gap-3">
              <div className="relative rounded-xl p-1.5 bg-white dark:bg-black shadow-[0_6px_16px_rgba(14,116,144,0.18)] ring-1 ring-sky-300/40 dark:ring-sky-700/60 backdrop-blur-sm">
                <img
                  src={darkMode ? brandLogoDark : brandLogo}
                  alt="ARPrice"
                  className="h-8 sm:h-9 w-auto object-contain drop-shadow-[0_6px_10px_rgba(37,99,235,0.25)] transition-transform duration-200 group-hover:scale-[1.03] filter drop-shadow-lg"
                  style={{
                    filter: 'drop-shadow(0 4px 8px rgba(14, 116, 144, 0.2)) drop-shadow(0 0 1px rgba(37, 99, 235, 0.1))'
                  }}
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-black tracking-tight text-white dark:text-white">
                    <span>AR</span>
                    <span>-</span>
                    <span className="text-cyan-200 dark:text-sky-400">PRICE</span>
                  </span>
                  <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-white/20 dark:bg-sky-950/80 text-white dark:text-sky-300 border border-white/40 dark:border-sky-800 shadow-sm">
                    AR
                  </span>
                </div>
                <p className="hidden md:block text-[11px] font-semibold italic text-white/80 dark:text-white leading-tight tracking-wide">
                  Ahorrar no es suerte, es información
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Location Display */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-white dark:text-stone-200 bg-white/20 dark:bg-stone-800/80 rounded-lg border border-white/30 dark:border-stone-700/60">
          <MapPin className="w-4 h-4 text-white dark:text-sky-400 shrink-0" />
          <span className="max-w-[120px] sm:max-w-[180px] truncate">{selectedCity}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Favorites Button */}
          <button
            onClick={onOpenFavorites}
            className="relative p-2 rounded-lg text-white dark:text-stone-300 hover:text-rose-200 dark:hover:text-rose-400 hover:bg-white/20 dark:hover:bg-stone-800 transition-colors cursor-pointer"
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
            className="relative flex items-center gap-1.5 px-3 py-1.5 bg-white text-sky-600 rounded-lg text-xs sm:text-sm font-semibold shadow-sm transition-all hover:shadow-md cursor-pointer dark:bg-gradient-to-r dark:from-sky-600 dark:to-blue-600 dark:hover:from-sky-500 dark:hover:to-blue-500 dark:text-white"
            title="Canasta Ahorro"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden md:inline">Canasta</span>
            {basketCount > 0 && (
              <span className="px-1.5 py-0.2 bg-sky-600 text-white text-xs font-black rounded-full min-w-[20px] text-center dark:bg-white dark:text-sky-700">
                {basketCount}
              </span>
            )}
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-white dark:text-stone-300 hover:bg-white/20 dark:hover:bg-stone-800 transition-colors cursor-pointer"
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

