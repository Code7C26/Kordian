import { useState } from 'react';
import { Percent, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { ProductImage } from './ProductImage';
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx';
import { SupermarketLogo } from './SupermarketLogo.jsx'

const cleanProductName = (name) => (name || 'Producto')
  .replace(/\s+\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|mg|cm|mm|unidades?|uds?|u)\s*$/i, '')
  .trim();

export function DealsSummaryBanner({ products, onSelectProduct }) {
  const [activeTab, setActiveTab] = useState('ofertas');
  const { t } = useLanguage();

  const topDeals = [...products]
    .filter((p) => p.status === 'OFERTA' || p.status === 'PRECIO_NORMAL')
    .sort((a, b) => a.percentageDiff - b.percentageDiff)
    .slice(0, 4);

  const topInflated = [...products]
    .filter((p) => p.status === 'INFLADO' || p.status === 'AUMENTO_ATIPICO')
    .sort((a, b) => b.percentageDiff - a.percentageDiff)
    .slice(0, 4);

  const displayedList = activeTab === 'ofertas' ? topDeals : topInflated;
  const translateProductName = useProductNameTranslator(displayedList.map((product) => product.name));

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
            <Percent className="w-4 h-4" aria-hidden="true" />
            <span>{t('Mayores Descuentos')}</span>
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
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
            <span>{t('Alertas Infladas')}</span>
          </button>
        </div>
        <span className="text-xs text-stone-400 font-medium hidden sm:inline">
          {t('Monitoreo en tiempo real de cadenas')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {displayedList.map((product) => {
          const displayName = translateProductName(product.name);
          return (
          <button
            key={product.id}
            type="button"
            onClick={() => onSelectProduct(product)}
            className="group p-3.5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/50 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 border border-stone-200/60 dark:border-stone-700/60 hover:border-sky-300 dark:hover:border-sky-600 transition-all cursor-pointer flex items-center gap-3"
          >
            <ProductImage
              src={product.image}
              alt={displayName}
              productName={cleanProductName(displayName)}
              productCategory={product.categories?.name || product.category?.name || product.category || product.subcategory}
              iconSize="medium"
              className="w-14 h-14 rounded-xl border border-stone-200 dark:border-stone-700 shrink-0 group-hover:scale-105 transition-transform"
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-stone-900 dark:text-white truncate">
                {displayName}
              </h4>
              <div className="flex items-center justify-between text-[11px] mt-1">
                <span className="font-extrabold text-stone-900 dark:text-white">
                  {formatCurrency(product.currentPrice)}
                </span>
                <SupermarketLogo
                  name={product.primaryStore?.name || t('Supermercado')}
                  image={product.primaryStore?.image}
                  className="h-6 max-w-[80px]"
                />
              </div>
            </div>
          </button>
          );
        })}
      </div>
    </div>
  );
}
