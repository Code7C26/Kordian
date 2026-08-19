import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  Heart, 
  ShoppingBag, 
  Store 
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export function ProductCard({
  product,
  onCompare,
  onToggleFavorite,
  isFavorite,
  onAddToBasket,
  isInBasket,
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const isInflated = product.status === 'INFLADO' || product.status === 'SOBREPRECIO';

  const sortedStores = Array.isArray(product.otherStores)
    ? [...product.otherStores].sort((a, b) => (a.price || 0) - (b.price || 0))
    : [];

  const defaultOfferId = sortedStores[0]?.id || null;

  useEffect(() => {
    if (defaultOfferId !== null) {
      setSelectedOfferId(defaultOfferId);
    }
  }, [defaultOfferId]);

  const selectedOffer = sortedStores.find((store) => store.id === selectedOfferId) || sortedStores[0] || null;

  const handleAddToBasket = () => {
    // Always add the best (cheapest) available offer when clicking +Canasta
    const best = sortedStores.length ? sortedStores[0] : null;
    const offerToAdd = best ? { id: best.id, price: best.price, supermarket: best.supermarket || best.storeName } : selectedOffer || undefined;
    onAddToBasket(product, offerToAdd);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  return (
    <div className="group relative bg-white dark:bg-stone-800/90 rounded-2xl border border-stone-200/90 dark:border-stone-700/80 hover:border-sky-400 dark:hover:border-sky-500 transition-all duration-200 hover:shadow-md flex flex-col justify-between h-full overflow-hidden">
      <div className="relative aspect-square w-full bg-stone-50 dark:bg-stone-900/60 p-4 flex items-center justify-center overflow-hidden border-b border-stone-100 dark:border-stone-800 shrink-0">
        <img
          src={product.image}
          alt={product.name}
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />

        <button
          onClick={() => onToggleFavorite(product)}
          className={`absolute top-2.5 right-2.5 p-2 rounded-full backdrop-blur-md transition-all shadow-xs z-10 cursor-pointer ${
            isFavorite
              ? 'bg-rose-500 text-white'
              : 'bg-stone-100/90 dark:bg-stone-800/90 text-stone-600 dark:text-stone-300 hover:text-rose-500 hover:bg-white'
          }`}
          title={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
        >
          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>

        <div className="absolute top-2.5 left-2.5 z-10">
          {isInflated ? (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800 font-extrabold text-[11px] shadow-xs">
              <span>Ojo, Inflado ⚠️</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800 font-extrabold text-[11px] shadow-xs">
              <span>¡En Precio! 👍</span>
            </div>
          )}
        </div>

        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-900/80 text-white backdrop-blur-sm text-[10px] font-medium">
          <Store className="w-3 h-3 text-sky-400" />
          <span>{product.primaryStore.name}</span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1">
          <div className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider flex items-center justify-between">
            <span>{product.brand || 'N/A'}</span>
            <span>{product.unit}</span>
          </div>

          {product.subcategory && (
            <div className="text-[9px] text-stone-500 dark:text-stone-400 capitalize">
              Categoría: {product.subcategory}
            </div>
          )}

          <h3 className="text-sm font-bold text-stone-900 dark:text-white line-clamp-2 h-10 leading-snug group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
            {product.name}
          </h3>
        </div>

        <div className="bg-stone-50 dark:bg-stone-900/60 p-3 rounded-xl border border-stone-200/50 dark:border-stone-800/80 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-stone-900 dark:text-white tracking-tight">
              {formatCurrency(product.currentPrice)}
            </span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
              isInflated 
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300' 
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
            }`}>
              {isInflated ? 'Inflado' : 'En Precio'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60 dark:border-stone-800 text-stone-500 dark:text-stone-400">
            <span>Promedio mercado:</span>
            <span className="font-bold text-stone-700 dark:text-stone-300">
              {formatCurrency(product.avgMarketPrice)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
          <span>Comparado en {(product.otherStores || []).length} tiendas</span>
          <span className="text-sky-600 dark:text-sky-400 font-bold">
            Mín: {formatCurrency((product.otherStores || []).length ? Math.min(...product.otherStores.map((s) => s.price || 0)) : 0)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={() => onCompare(product)}
            className="flex items-center justify-center gap-1 px-2.5 py-2.5 bg-stone-100 dark:bg-stone-700/80 hover:bg-sky-50 dark:hover:bg-sky-950/60 text-stone-800 dark:text-stone-200 hover:text-sky-700 dark:hover:text-sky-300 rounded-xl text-xs font-bold transition-colors border border-stone-200/80 dark:border-stone-600 cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Comparar</span>
          </button>

          <div className="relative">
            <button
              onClick={handleAddToBasket}
              className={`flex items-center justify-center gap-1 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isInBasket
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{isInBasket ? 'Agregado ✓' : '+ Canasta'}</span>
            </button>
            {justAdded && (
              <div className="absolute top-3 left-1/2 transform -translate-x-1/2 bg-emerald-600 text-white px-3 py-1 rounded-md text-xs shadow">Agregado</div>
            )}
          </div>
          {justAdded && (
            <div className="absolute top-3 left-1/2 transform -translate-x-1/2 bg-emerald-600 text-white px-3 py-1 rounded-md text-xs shadow">Agregado</div>
          )}
        </div>
      </div>
    </div>
  );
}
