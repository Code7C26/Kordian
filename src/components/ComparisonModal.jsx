import { useState } from 'react';
import { X, TrendingDown, Store, Calendar, Info } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

export function ComparisonModal({ product, onClose, onAddToBasket, isInBasket, onExplain }) {
  const [added, setAdded] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  if (!product) return null;
  const sortedStores = Array.isArray(product.otherStores) ? [...product.otherStores].sort((a, b) => (a.price || 0) - (b.price || 0)) : [];
  const cheapestStore = sortedStores[0] || { price: 0, supermarket: '' };
  const mostExpensiveStore = sortedStores[sortedStores.length - 1] || { price: 0, supermarket: '' };
  const maxSavings = (mostExpensiveStore.price || 0) - (cheapestStore.price || 0);
  const savingsPercentage = mostExpensiveStore.price ? (((maxSavings / mostExpensiveStore.price) * 100).toFixed(1)) : '0.0';
  const history = Array.isArray(product.priceHistory) ? product.priceHistory : [];
  const serverPeriods = Array.isArray(product.analysis?.pricePeriods) ? product.analysis.pricePeriods : [];
  const datedHistory = history
    .map((point) => ({ ...point, timestamp: new Date(point.date).getTime() }))
    .filter((point) => Number.isFinite(point.timestamp) && (Number(point.avgPrice || 0) > 0 || Number(point.minPrice || 0) > 0));
  const latestHistoryTime = datedHistory.length ? Math.max(...datedHistory.map((point) => point.timestamp)) : 0;
  const threeMonthsAgo = latestHistoryTime ? new Date(latestHistoryTime) : null;
  threeMonthsAgo?.setMonth(threeMonthsAgo.getMonth() - 3);
  const recentHistory = datedHistory.filter((point) => !threeMonthsAgo || point.timestamp >= threeMonthsAgo.getTime());
  const firstHistoryTime = recentHistory.length ? Math.min(...recentHistory.map((point) => point.timestamp)) : 0;
  const periodDuration = recentHistory.length ? Math.max(24 * 60 * 60 * 1000, latestHistoryTime - firstHistoryTime) : 0;
  const blockDuration = periodDuration / 4 || 1;
  const historyBlocks = Array.from({ length: 4 }, (_, blockIndex) => {
    const periodStart = firstHistoryTime + blockIndex * blockDuration;
    const periodEnd = blockIndex === 3 ? latestHistoryTime : firstHistoryTime + (blockIndex + 1) * blockDuration;
    const points = recentHistory.filter((point) => point.timestamp >= periodStart && (blockIndex === 3 ? point.timestamp <= periodEnd : point.timestamp < periodEnd));
    const averagePrice = points.length ? points.reduce((sum, point) => sum + Number(point.avgPrice || point.minPrice || 0), 0) / points.length : 0;
    const minimumPrice = points.length ? Math.min(...points.map((point) => Number(point.minPrice || point.avgPrice || 0))) : 0;
    const previousPeriodStart = firstHistoryTime + (blockIndex - 1) * blockDuration;
    const previousPeriodEnd = firstHistoryTime + blockIndex * blockDuration;
    const previousPoints = blockIndex > 0
      ? recentHistory.filter((point) => point.timestamp >= previousPeriodStart && point.timestamp < previousPeriodEnd)
      : [];
    const previousAverage = previousPoints.length
      ? previousPoints.reduce((sum, point) => sum + Number(point.avgPrice || point.minPrice || 0), 0) / previousPoints.length
      : 0;
    const changePercent = previousAverage && averagePrice ? ((averagePrice - previousAverage) / previousAverage) * 100 : null;
    return { avgPrice: averagePrice, minPrice: minimumPrice, periodStart, periodEnd, changePercent };
  });
  const fallbackVisiblePeriods = historyBlocks
    .filter((period) => period.avgPrice > 0 || period.minPrice > 0)
    .map((period, index, periods) => ({
      ...period,
      changePercent: index > 0 && periods[index - 1].avgPrice > 0 && period.avgPrice > 0
        ? ((period.avgPrice - periods[index - 1].avgPrice) / periods[index - 1].avgPrice) * 100
        : null,
    }));
  const displayPeriods = serverPeriods.length === 4 ? serverPeriods.map((period) => ({
    ...period,
    avgPrice: period.averagePrice || 0,
    minPrice: period.minimumPrice || 0,
  })) : fallbackVisiblePeriods;
  const visiblePeriods = displayPeriods.filter((period) => period.recordCount > 0 || period.avgPrice > 0 || period.minPrice > 0);
  const hasHistoryReferences = visiblePeriods.length > 0;
  const evolutionAvailable = visiblePeriods.length >= 2;
  const maxHistPrice = hasHistoryReferences ? Math.max(...visiblePeriods.map((point) => point.avgPrice || 0)) : 1;
  const isInflated = product.status === 'INFLADO' || product.status === 'AUMENTO_ATIPICO';
  const statusLabel = product.status === 'OFERTA' ? 'En oferta' : isInflated ? 'Inflado' : 'En precio';
  const selectedPeriodRecords = selectedPeriod
    ? history
      .map((record) => ({ ...record, timestamp: new Date(record.date).getTime(), price: Number(record.avgPrice || record.minPrice || 0) }))
      .filter((record) => Number.isFinite(record.timestamp) && record.price > 0)
      .sort((first, second) => {
        const firstStore = sortedStores.find((store) => String(store.id) === String(first.offerId));
        const secondStore = sortedStores.find((store) => String(store.id) === String(second.offerId));
        return (firstStore?.supermarket || 'Supermercado').localeCompare(secondStore?.supermarket || 'Supermercado', 'es')
          || first.timestamp - second.timestamp;
      })
      .filter((record) => record.timestamp >= new Date(selectedPeriod.periodStart).getTime()
        && record.timestamp <= new Date(selectedPeriod.periodEnd).getTime())
      .map((record) => {
        const previousRecord = history
          .map((candidate) => ({ ...candidate, timestamp: new Date(candidate.date).getTime(), price: Number(candidate.avgPrice || candidate.minPrice || 0) }))
          .filter((candidate) => Number.isFinite(candidate.timestamp) && candidate.price > 0 && candidate.timestamp < record.timestamp && candidate.offerId === record.offerId)
          .sort((first, second) => second.timestamp - first.timestamp)[0];
        return {
          ...record,
          isNewPrice: !previousRecord,
          changePercent: previousRecord?.price ? ((record.price - previousRecord.price) / previousRecord.price) * 100 : null,
        };
      })
    : [];

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
                } catch {
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
                const hasComparison = sortedStores.length > 1;
                const isCheapest = hasComparison && index === 0;
                const isMostExpensive = sortedStores.length > 1 && index === sortedStores.length - 1;
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
                      {store.image ? (
                        <img src={store.image} alt="" className="w-10 h-10 rounded-xl object-contain shrink-0 bg-white" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl font-black text-xs flex items-center justify-center shrink-0 bg-stone-200 dark:bg-stone-700">{(store.supermarket || '').slice(0, 1).toUpperCase()}</div>
                      )}
                      <div className="flex-1 text-center">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <span className="font-bold text-stone-900 dark:text-white text-sm">{store.supermarket || store.storeName || 'Sin nombre'}</span>
                          {isCheapest && <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px]">MÁS BARATO</span>}
                          {isMostExpensive && <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-extrabold text-[10px]">MÁS CARO</span>}
                        </div>
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
                            } catch { /* Optional basket handler. */ }
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
                <h4 className="font-bold text-sm text-stone-900 dark:text-white flex items-center gap-2"><Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" /> <span>Historial de Precios (Hasta 90 días)</span></h4>
                <p className="text-xs text-stone-500 dark:text-stone-400">Evolución del precio promedio y mejor precio encontrado</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs font-semibold px-2.5 py-1 bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 rounded-lg">Ref. Promedio: {formatCurrency(product.avgMarketPrice || 0)}</span>
                <div className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-extrabold ${
                  product.status === 'OFERTA'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800'
                    : isInflated
                      ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800'
                      : 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-800'
                }`}>
                  <span>{statusLabel}</span>
                  {onExplain && (
                    <button type="button" onClick={() => onExplain(product)} className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10" aria-label={`Ver explicación de ${statusLabel}`} title="Ver explicación del análisis">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className={hasHistoryReferences ? 'grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2' : 'pt-2'}>
              {hasHistoryReferences ? visiblePeriods.map((point, idx) => {
                const heightAvg = Math.max(20, Math.min(100, ((point.avgPrice || 0) / maxHistPrice) * 100));
                const heightMin = Math.max(20, Math.min(100, ((point.minPrice || 0) / maxHistPrice) * 100));
                return (
                  <div key={idx} className="flex min-w-0 flex-col items-center space-y-2 cursor-pointer" onClick={() => setSelectedPeriod(point)} title="Ver registros de este período" role="button" tabIndex="0" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedPeriod(point); }}>
                    <div className="flex min-h-10 w-full flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-center text-xs font-extrabold leading-snug text-stone-800 dark:text-stone-100">
                      <span>{formatCurrency(point.avgPrice || point.minPrice)}</span>
                      {point.changePercent !== null && point.avgPrice > 0 && evolutionAvailable && (
                        <span className={`rounded-md px-2 py-1 text-[11px] font-black ${point.changePercent > 0 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : point.changePercent < 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'}`}>
                          {point.changePercent > 0 ? '+' : ''}{point.changePercent.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-stone-200 dark:bg-stone-800 h-28 rounded-xl flex items-end justify-center p-1 relative overflow-hidden group">
                      {point.avgPrice > 0 && <div style={{ height: `${heightAvg}%` }} className="w-full bg-sky-200 dark:bg-sky-950/80 rounded-lg absolute bottom-1 left-1 right-1" />}
                      {point.minPrice > 0 && <div style={{ height: `${heightMin}%` }} className="w-full bg-emerald-500 dark:bg-emerald-600 rounded-lg relative z-10 transition-all group-hover:bg-emerald-400" />}
                      <div className="pointer-events-none absolute inset-x-0 top-1 z-20 flex justify-center opacity-0 transition-opacity group-hover:opacity-100"><span className="rounded-md bg-emerald-700 px-2 py-1 text-[11px] font-black text-white shadow-md">{formatCurrency(point.minPrice)}</span></div>
                    </div>
                    <div className="text-center text-[10px] font-semibold text-stone-500 dark:text-stone-400">
                      {new Date(point.periodStart).toLocaleDateString('es-AR')} - {new Date(point.periodEnd).toLocaleDateString('es-AR')}
                    </div>
                  </div>
                );
              }) : (
                <div className="text-sm text-stone-500">No hay referencias</div>
              )}
            </div>
            {hasHistoryReferences && (
              <div className="flex items-center justify-center gap-6 text-xs text-stone-500 dark:text-stone-400 pt-2 border-t border-stone-200/60 dark:border-stone-800">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500" /> <span>Precio Mínimo Encontrado</span></div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-sky-200 dark:bg-sky-950" /> <span>Precio Promedio General</span></div>
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedPeriod && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/60 p-4" onClick={() => setSelectedPeriod(null)}>
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-stone-800" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-4"><div><h3 className="text-base font-bold text-stone-900 dark:text-white">Registros del período</h3><p className="text-xs text-stone-500 dark:text-stone-400">{new Date(selectedPeriod.periodStart).toLocaleDateString('es-AR')} - {new Date(selectedPeriod.periodEnd).toLocaleDateString('es-AR')}</p></div><button type="button" onClick={() => setSelectedPeriod(null)} aria-label="Cerrar registros" className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"><X className="h-5 w-5" /></button></div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{selectedPeriodRecords.map((record, index) => { const store = sortedStores.find((candidate) => String(candidate.id) === String(record.offerId)); return <div key={`${record.timestamp}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-900/70"><div className="flex min-w-0 items-center gap-2">{store?.image && <img src={store.image} alt="" className="h-7 w-7 shrink-0 rounded-lg bg-white object-contain" />}<div className="min-w-0"><span className="block truncate text-xs font-bold text-stone-700 dark:text-stone-200">{store?.supermarket || 'Supermercado'}</span><span className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400">{new Date(record.timestamp).toLocaleDateString('es-AR')}</span></div></div><span className="font-bold text-stone-900 dark:text-white">{formatCurrency(record.price)}</span><span className={`min-w-16 text-right text-xs font-bold ${record.isNewPrice ? 'text-sky-600 dark:text-sky-400' : record.changePercent > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{record.isNewPrice ? 'Nuevo precio' : `${record.changePercent > 0 ? '+' : ''}${record.changePercent.toFixed(1)}%`}</span></div> })}</div>
          </div>
        </div>
      )}
    </div>
  );
}
