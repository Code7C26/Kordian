import { useState } from 'react';
import { Flame, AlertTriangle } from 'lucide-react';
import { formatCurrency, formatPercentage } from '../utils/formatters';

export function DealsSummaryBanner({ products, onSelectProduct }) {
  const [activeTab, setActiveTab] = useState('ofertas');

  const topDeals = [...products]
    .filter((p) => p.status === 'OFERTA' || p.status === 'EN_PRECIO')
    .sort((a, b) => a.percentageDiff - b.percentageDiff)
    .slice(0, 4);

  const topInflated = [...products]
    .filter((p) => p.status === 'INFLADO' || p.status === 'SOBREPRECIO')
    .sort((a, b) => b.percentageDiff - a.percentageDiff)
    .slice(0, 4);

  const displayedList = activeTab === 'ofertas' ? topDeals : topInflated;

  return (
    <div className="bg-white dark:bg-stone-800 rounded-3xl border border-stone-200/80 dark:border-stone-700/80 p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-100 dark:border-stone-700/60">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ofertas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ofertas'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-100 dark:bg-stone-700/60 text-stone-600 dark:text-stone-300 hover:bg-stone-200'
            }`}
          >
            <Flame className="w-4 h-4" />
            <span>🔥 Mayores Descuentos</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inflados')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'inflados'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'bg-stone-100 dark:bg-stone-700/60 text-stone-600 dark:text-stone-300 hover:bg-stone-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>⚠️ Alertas Infladas</span>
          </button>
        </div>
        <span className="text-xs text-stone-400 font-medium hidden sm:inline">
          Monitoreo en tiempo real de cadenas
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {displayedList.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelectProduct(product)}
            className="group p-3.5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/50 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 border border-stone-200/60 dark:border-stone-700/60 hover:border-sky-300 dark:hover:border-sky-600 transition-all cursor-pointer flex items-center gap-3"
          >
            <img
              src={product.image}
              alt={product.name}
              className="w-14 h-14 rounded-xl object-cover border border-stone-200 dark:border-stone-700 shrink-0 group-hover:scale-105 transition-transform"
            />
            <div className="flex-1 min-w-0">
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-black uppercase mb-1 ${
                  activeTab === 'ofertas'
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                }`}
              >
                {formatPercentage(product.percentageDiff)}
              </span>
              <h4 className="text-xs font-bold text-stone-900 dark:text-white truncate">
                {product.name}
              </h4>
              <div className="flex items-center justify-between text-[11px] mt-1">
                <span className="font-extrabold text-stone-900 dark:text-white">
                  {formatCurrency(product.currentPrice)}
                </span>
                <span className="text-stone-400 truncate max-w-[80px]">
                  {product.primaryStore.name}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
