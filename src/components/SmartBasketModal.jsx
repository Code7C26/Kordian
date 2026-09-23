import { 
  X, 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  Store 
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export function SmartBasketModal({ basket, onClose, onUpdateQuantity, onRemoveItem, onClearBasket }) {
  if (basket.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full max-w-lg bg-white dark:bg-stone-800 rounded-3xl shadow-2xl p-6 text-center space-y-4 border border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-900 dark:text-white">Tu Canasta de Compras está vacía</h3>
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mx-auto">Agrega productos usando el botón "+ Canasta" para comparar cuál supermercado o tienda te ofrece el menor precio total por toda tu compra.</p>
          <button onClick={onClose} className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer">Explorar Productos</button>
        </div>
      </div>
    );
  }

  const basketTotal = basket.reduce((acc, item) => {
    const price = Number(item.selectedOffer?.price || item.product.currentPrice || 0) || 0;
    return acc + price * Number(item.quantity || 0);
  }, 0);

  const worstAlternativeTotal = basket.reduce((acc, item) => {
    const stores = Array.isArray(item.product.otherStores) ? item.product.otherStores : [];
    const worstPrice = stores.reduce((max, store) => {
      const price = Number(store.price || store.cash_price || 0) || 0;
      return max === null || price > max ? price : max;
    }, null);
    const mostExpensive = worstPrice !== null ? worstPrice : Number(item.product.currentPrice || 0);
    return acc + mostExpensive * Number(item.quantity || 0);
  }, 0);

  const totalSavings = Math.max(0, worstAlternativeTotal - basketTotal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-stone-800 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden my-8" onClick={(e) => e.stopPropagation()}>
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
              <p className="text-xs text-stone-500 dark:text-stone-400">Calculamos automáticamente qué comercio te conviene para comprar la lista entera</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-stone-400 uppercase tracking-wider px-1">
              <span>Productos en tu canasta</span>
              <button onClick={onClearBasket} className="text-rose-500 hover:underline flex items-center gap-1 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vaciar Canasta</span>
              </button>
            </div>
              <div className="space-y-4">
              {Object.entries(
                basket.reduce((groups, item) => {
                  const storeName = item.selectedOffer?.storeName || item.product.primaryStore?.name || 'Precio actual';
                  if (!groups[storeName]) {
                    groups[storeName] = [];
                  }
                  groups[storeName].push(item);
                  return groups;
                }, {})
              ).map(([storeName, items]) => {
                const groupTotal = items.reduce((acc, item) => {
                  const price = Number(item.selectedOffer?.price || item.product.currentPrice || 0) || 0;
                  return acc + price * Number(item.quantity || 0);
                }, 0);

                return (
                  <div key={storeName} className="space-y-3">
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-700">
                      <div>
                        <p className="text-sm font-semibold text-sky-700 dark:text-sky-200">{storeName}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {items.length} producto{items.length === 1 ? '' : 's'} • Subtotal
                        </p>
                      </div>
                      <p className="text-sm font-bold text-stone-900 dark:text-white">{formatCurrency(groupTotal)}</p>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="p-3.5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img src={item.product.image} alt={item.product.name} className="w-12 h-12 rounded-xl object-cover border border-stone-200 dark:border-stone-700" />
                            <div>
                              <h4 className="font-bold text-stone-900 dark:text-white text-sm line-clamp-1">{item.product.name}</h4>
                              <p className="text-xs text-stone-500 dark:text-stone-400">
                                {formatCurrency(item.selectedOffer?.price || item.product.currentPrice)} c/u
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-1">
                              <button onClick={() => onUpdateQuantity(item.id, -1)} className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-stone-600 dark:text-stone-300 cursor-pointer">
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center font-bold text-xs text-stone-900 dark:text-white">{item.quantity}</span>
                              <button onClick={() => onUpdateQuantity(item.id, 1)} className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-stone-600 dark:text-stone-300 cursor-pointer">
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button onClick={() => onRemoveItem(item.id)} className="p-1.5 text-stone-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer" title="Eliminar de la lista">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2"><Store className="w-4 h-4 text-sky-600 dark:text-sky-400" /> <span>Comparativa Total de la Canasta</span></h3>
            <div className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200/80 dark:border-stone-800">
                  <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Total actual de la canasta</p>
                  <p className="text-2xl font-black text-stone-900 dark:text-white">{formatCurrency(basketTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Costo si eliges el peor precio disponible</p>
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(worstAlternativeTotal)}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-emerald-600/10 dark:bg-emerald-900/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Ahorro frente al peor precio</p>
                <p className="text-xl font-black text-emerald-900 dark:text-white">{formatCurrency(totalSavings)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
