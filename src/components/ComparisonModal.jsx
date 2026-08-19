import React, { useState } from 'react';
import { X, TrendingDown, Store, Calendar } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export function ComparisonModal({ product, onClose, onAddToBasket, isInBasket }) {
  if (!product) return null;
  const [added, setAdded] = useState(false);
  const sortedStores = Array.isArray(product.otherStores) ? [...product.otherStores].sort((a, b) => (a.price || 0) - (b.price || 0)) : [];
  const cheapestStore = sortedStores[0] || { price: 0, supermarket: '' };
  const mostExpensiveStore = sortedStores[sortedStores.length - 1] || { price: 0, supermarket: '' };
  const maxSavings = (mostExpensiveStore.price || 0) - (cheapestStore.price || 0);
  const savingsPercentage = mostExpensiveStore.price ? (((maxSavings / mostExpensiveStore.price) * 100).toFixed(1)) : '0.0';
  const history = Array.isArray(product.priceHistory) ? product.priceHistory : [];
  const maxHistPrice = history.length ? Math.max(...history.map((h) => h.avgPrice || 0)) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-stone-800 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-stone-200/80 dark:border-stone-700/80 bg-stone-50/50 dark:bg-stone-900/40">
          <div className="flex items-center gap-4">
            <img src={product.image} alt={product.name} className="w-16 h-16 rounded-2xl object-cover border border-stone-200 dark:border-stone-700 shrink-0" />
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                <span>{product.brand}</span>
                <span>•</span>
                <span>{product.subcategory}</span>
              </div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-white leading-tight">{product.name}</h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Comparativa de precios en tiempo real entre {sortedStores.length} comercios</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Brecha Máxima de Ahorro</p>
                <p className="text-lg font-black text-stone-900 dark:text-white">Ahorra {formatCurrency(maxSavings)} ({savingsPercentage}%) comprando en {cheapestStore.supermarket || cheapestStore.storeName || '—'}</p>
              </div>
            </div>

            <button
              onClick={() => {
                try {
                  onAddToBasket(product, cheapestStore);
                } catch (e) {
                  // ignore handler errors
                }
                setAdded(true);
                setTimeout(() => setAdded(false), 2500);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-colors shrink-0"
            >
              {isInBasket ? 'Agregado a Canasta ✓' : 'Agregar a Canasta Ahorro'}
            </button>
            {added && (
              <div className="absolute top-6 right-6 bg-emerald-600 text-white px-3 py-1.5 rounded-md shadow-md text-sm">Agregado a la canasta</div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-3 flex items-center gap-2">
              <Store className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Comparador de Precios por Tienda</span>
            </h3>
            <div className="space-y-2.5">
              {sortedStores.map((store, index) => {
                const isCheapest = index === 0;
                const isMostExpensive = index === sortedStores.length - 1;
                const diffFromCheapest = (store.price || 0) - (cheapestStore.price || 0);
                return (
                  <div
                    key={store.id || index}
                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isCheapest
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 shadow-xs'
                        : isMostExpensive
                        ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900'
                        : 'bg-stone-50/60 dark:bg-stone-900/60 border-stone-200/80 dark:border-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl font-black text-xs flex items-center justify-center shrink-0 bg-stone-200 dark:bg-stone-700`}>{(store.supermarket || '').slice(0, 1).toUpperCase()}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900 dark:text-white text-sm">{store.supermarket || store.storeName || 'Sin nombre'}</span>
                          {isCheapest && <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px]">MÁS BARATO</span>}
                          {isMostExpensive && <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-extrabold text-[10px]">MÁS CARO</span>}
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400">Actualizado {store.lastUpdated || '—'}</p>
                      </div>
                    </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-0 border-stone-200/60 dark:border-stone-800 pt-2 sm:pt-0">
                      {!isCheapest && <span className="text-xs text-rose-600 dark:text-rose-400 font-semibold">+{formatCurrency(diffFromCheapest)}</span>}
                      <div className="text-right flex items-center gap-3">
                        <span className={`text-xl font-black ${isCheapest ? 'text-emerald-700 dark:text-emerald-400' : isMostExpensive ? 'text-rose-600 dark:text-rose-400' : 'text-stone-900 dark:text-white'}`}>
                          {formatCurrency(store.price || 0)}
                        </span>
                        <button
                          onClick={() => {
                            try {
                              onAddToBasket(product, store);
                            } catch (e) {}
                          }}
                          className="ml-2 px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-sm font-bold"
                          title="Agregar esta oferta a la canasta"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-stone-50 dark:bg-stone-900/70 p-5 rounded-2xl border border-stone-200/80 dark:border-stone-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-stone-900 dark:text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" /> <span>Historial de Precios (Últimos 30 días)</span></h4>
                <p className="text-xs text-stone-500 dark:text-stone-400">Evolución del precio promedio y mejor precio encontrado</p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 rounded-lg">Ref. Promedio: {formatCurrency(product.avgMarketPrice || 0)}</span>
            </div>
            <div className="grid grid-cols-4 gap-3 pt-2">
              {history.length ? history.map((point, idx) => {
                const heightAvg = Math.max(20, Math.min(100, ((point.avgPrice || 0) / maxHistPrice) * 100));
                const heightMin = Math.max(20, Math.min(100, ((point.minPrice || 0) / maxHistPrice) * 100));
                return (
                  <div key={idx} className="flex flex-col items-center space-y-2">
                    <div className="text-[11px] font-bold text-stone-600 dark:text-stone-300">{formatCurrency(point.minPrice || 0)}</div>
                    <div className="w-full bg-stone-200 dark:bg-stone-800 h-28 rounded-xl flex items-end justify-center p-1 relative overflow-hidden group">
                      <div style={{ height: `${heightAvg}%` }} className="w-full bg-sky-200 dark:bg-sky-950/80 rounded-lg absolute bottom-1 left-1 right-1" />
                      <div style={{ height: `${heightMin}%` }} className="w-full bg-emerald-500 dark:bg-emerald-600 rounded-lg relative z-10 transition-all group-hover:bg-emerald-400" />
                    </div>
                    <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">{point.date || '—'}</div>
                  </div>
                );
              }) : (
                <div className="text-sm text-stone-500">No hay historial disponible</div>
              )}
            </div>
            <div className="flex items-center justify-center gap-6 text-xs text-stone-500 dark:text-stone-400 pt-2 border-t border-stone-200/60 dark:border-stone-800">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500" /> <span>Precio Mínimo Encontrado</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-sky-200 dark:bg-sky-950" /> <span>Precio Promedio General</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
