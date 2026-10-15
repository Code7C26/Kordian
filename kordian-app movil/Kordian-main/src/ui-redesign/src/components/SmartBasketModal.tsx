import React from 'react';
import { 
  X, 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  Store 
} from 'lucide-react';
import { BasketItem } from '../types';
import { formatCurrency } from '../utils/formatters';

interface SmartBasketModalProps {
  basket: BasketItem[];
  onClose: () => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearBasket: () => void;
}

export const SmartBasketModal: React.FC<SmartBasketModalProps> = ({
  basket,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClearBasket,
}) => {
  if (basket.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full max-w-lg bg-white dark:bg-stone-800 rounded-3xl shadow-2xl p-6 text-center space-y-4 border border-stone-200 dark:border-stone-700">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
            <ShoppingBag className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-bold text-stone-900 dark:text-white">
            Tu Canasta de Compras está vacía
          </h3>

          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mx-auto">
            Agrega productos usando el botón "+ Canasta" para comparar cuál supermercado o tienda te ofrece el menor precio total por toda tu compra.
          </p>

          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
          >
            Explorar Productos
          </button>
        </div>
      </div>
    );
  }

  // Calculate total costs per store across all basket items
  const allStoresMap: Record<string, { name: string; total: number; missingItems: number }> = {};

  basket.forEach((item) => {
    item.product.otherStores.forEach((store) => {
      if (!allStoresMap[store.storeId]) {
        allStoresMap[store.storeId] = {
          name: store.storeName,
          total: 0,
          missingItems: 0,
        };
      }
      allStoresMap[store.storeId].total += store.price * item.quantity;
    });
  });

  const storesRanking = Object.entries(allStoresMap)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => a.total - b.total);

  const bestStore = storesRanking[0];
  const worstStore = storesRanking[storesRanking.length - 1];
  const totalSavings = worstStore ? worstStore.total - bestStore.total : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      
      <div 
        className="relative w-full max-w-3xl bg-white dark:bg-stone-800 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200/80 dark:border-stone-700/80 bg-stone-50/50 dark:bg-stone-900/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-600 text-white rounded-2xl shadow-md">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <span>Mi Canasta Ahorro</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-extrabold">
                  {basket.reduce((acc, i) => acc + i.quantity, 0)} ítems
                </span>
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Calculamos automáticamente qué comercio te conviene para comprar la lista entera
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          
          {/* Optimal Store Recommendation Banner */}
          {bestStore && worstStore && totalSavings > 0 && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-emerald-600 text-white shadow-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                  💡 Mejor Elección de Compra
                </span>
                <span className="text-xs font-semibold text-sky-100">
                  Ahorro estimado del {((totalSavings / worstStore.total) * 100).toFixed(1)}%
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <div>
                  <h3 className="text-2xl font-black tracking-tight">
                    Comprar en {bestStore.name}: {formatCurrency(bestStore.total)}
                  </h3>
                  <p className="text-xs text-sky-100">
                    Ahorras {formatCurrency(totalSavings)} en comparación con comprar en {worstStore.name} ({formatCurrency(worstStore.total)}).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* List of Items in Cart */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-stone-400 uppercase tracking-wider px-1">
              <span>Productos en tu canasta</span>
              <button 
                onClick={onClearBasket}
                className="text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar Canasta</span>
              </button>
            </div>

            <div className="space-y-2">
              {basket.map((item) => (
                <div
                  key={item.product.id}
                  className="p-3.5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-12 h-12 rounded-xl object-cover border border-stone-200 dark:border-stone-700"
                    />
                    <div>
                      <h4 className="font-bold text-stone-900 dark:text-white text-sm line-clamp-1">
                        {item.product.name}
                      </h4>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {formatCurrency(item.product.currentPrice)} c/u • {item.product.primaryStore.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-1">
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, -1)}
                        className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-stone-600 dark:text-stone-300 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-bold text-xs text-stone-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onUpdateQuantity(item.product.id, 1)}
                        className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-stone-600 dark:text-stone-300 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => onRemoveItem(item.product.id)}
                      className="p-1.5 text-stone-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                      title="Eliminar de la lista"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ranking of Total Basket Cost Across All Stores */}
          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <Store className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Comparativa Total de la Canasta por Comercio</span>
            </h3>

            <div className="space-y-2">
              {storesRanking.map((store, idx) => {
                const isWinner = idx === 0;
                return (
                  <div
                    key={store.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                      isWinner
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                        : 'bg-stone-50/60 dark:bg-stone-900/60 border-stone-200/80 dark:border-stone-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full font-black text-xs flex items-center justify-center ${
                        isWinner ? 'bg-emerald-600 text-white' : 'bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300'
                      }`}>
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-sm text-stone-900 dark:text-white">
                        {store.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`text-base font-black ${
                        isWinner ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-900 dark:text-white'
                      }`}>
                        {formatCurrency(store.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-100 dark:bg-stone-900 border-t border-stone-200 dark:border-stone-700 flex items-center justify-between">
          <span className="text-xs text-stone-500 dark:text-stone-400">
            * Precios actualizados en tiempo real
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Volver a la tienda
          </button>
        </div>

      </div>
    </div>
  );
};

