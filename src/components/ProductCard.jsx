import { useEffect, useState } from 'react';
import { 
  BarChart3, 
  Heart, 
  ShoppingBag, 
  Store,
  PackageOpen,
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
  const [failedImage, setFailedImage] = useState(null);
  const isInflated = product.status === 'INFLADO' || product.status === 'AUMENTO_ATIPICO';
  const statusLabel = product.status === 'OFERTA'
    ? 'En oferta'
    : isInflated
      ? 'Inflado'
      : 'En precio';

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
  const displayProductName = (product.name || 'Producto')
    .replace(/\s+\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|mg|cm|mm|unidades?|uds?|u)\s*$/i, '')
    .trim();

  const handleAddToBasket = () => {
    // Always add the best (cheapest) available offer when clicking +Canasta
    const best = sortedStores.length ? sortedStores[0] : null;
    const offerToAdd = best ? { id: best.id, price: best.price, supermarket: best.supermarket || best.storeName } : selectedOffer || undefined;
    onAddToBasket(product, offerToAdd);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 250);
  };

  return (
    <div className="group relative bg-white dark:bg-stone-800/90 rounded-2xl border border-stone-200/90 dark:border-stone-700/80 hover:border-sky-400 dark:hover:border-sky-500 transition-all duration-200 hover:shadow-md flex flex-col justify-between h-full overflow-hidden">
      <div className="relative aspect-square w-full bg-stone-50 dark:bg-stone-900/60 p-4 flex items-center justify-center overflow-hidden border-b border-stone-100 dark:border-stone-800 shrink-0">
        {product.image && failedImage !== product.image ? (
          <img
            src={product.image}
            alt={product.name}
            onError={() => setFailedImage(product.image)}
            className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full min-h-44 flex flex-col items-center justify-center gap-3 rounded-xl bg-gradient-to-br from-sky-100 via-white to-emerald-100 dark:from-sky-950/70 dark:via-stone-800 dark:to-emerald-950/60 text-sky-700 dark:text-sky-300">
            <div className="w-16 h-16 rounded-2xl bg-white/80 dark:bg-stone-900/70 border border-sky-200 dark:border-sky-800 flex items-center justify-center shadow-sm">
              <PackageOpen className="w-8 h-8" />
            </div>
            <div className="text-center px-4">
              <div className="text-lg font-black tracking-wide leading-tight bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-500 dark:from-indigo-300 dark:via-sky-300 dark:to-emerald-300 bg-clip-text text-transparent line-clamp-2">{displayProductName}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">{product.subcategory || 'Producto'}</div>
            </div>
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 z-10">
          <div className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-extrabold text-[11px] shadow-xs ${
            product.status === 'OFERTA'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
              : isInflated
                ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800'
                : 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800'
          }`}>
            <span>{statusLabel}</span>
          </div>
        </div>

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

        <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-900/80 text-white backdrop-blur-sm text-[10px] font-medium">
          <Store className="w-3 h-3 text-sky-400" />
          <span>{product.primaryStore.name}</span>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1">
          <div className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>{product.unit}</span>
              <span className="text-sky-600 dark:text-sky-400">{(product.otherStores || []).length} {(product.otherStores || []).length === 1 ? 'Opción' : 'Opciones'}</span>
            </div>
          </div>

          <h3 className="text-sm font-bold text-stone-900 dark:text-white line-clamp-2 h-10 leading-snug group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
            {product.name}
          </h3>
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 truncate">
            {product.brand || 'Marca no disponible'}
          </p>
        </div>

        <div className="bg-stone-50 dark:bg-stone-900/60 p-3 rounded-xl border border-stone-200/50 dark:border-stone-800/80 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-stone-900 dark:text-white tracking-tight">
              {formatCurrency(product.currentPrice)}
            </span>
            <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300 dark:border-sky-700 shadow-xs max-w-[52%] truncate">
              {product.primaryStore?.name || 'Sin supermercado'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => onCompare(product)}
            className="w-full h-11 min-w-0 flex items-center justify-center gap-1 px-2 bg-stone-100 dark:bg-stone-700/80 hover:bg-sky-50 dark:hover:bg-sky-950/60 text-stone-800 dark:text-stone-200 hover:text-sky-700 dark:hover:text-sky-300 rounded-xl text-xs font-bold transition-colors border border-stone-200/80 dark:border-stone-600 cursor-pointer whitespace-nowrap"
          >
            <BarChart3 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>Comparar</span>
          </button>

          <div className="relative min-w-0">
            <button
              onClick={handleAddToBasket}
              className={`w-full h-11 min-w-0 flex items-center justify-center gap-1 px-2 rounded-xl text-xs font-bold transition-[background-color,box-shadow,transform] duration-200 ease-out cursor-pointer whitespace-nowrap active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-stone-800 ${
                justAdded
                  ? 'bg-white text-sky-700 border border-sky-300 shadow-md dark:bg-stone-100 dark:text-sky-800'
                  : isInBasket
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs hover:shadow-md'
                  : 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs hover:shadow-md'
              }`}
            >
              <ShoppingBag className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isInBasket ? 'scale-105' : ''}`} />
              <span>{isInBasket ? 'Agregado ✓' : '+ Canasta'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
