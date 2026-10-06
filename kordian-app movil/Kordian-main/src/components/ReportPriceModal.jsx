import { useState } from 'react';
import { X, Send, AlertTriangle, CheckCircle } from 'lucide-react';
import { STORES_LIST } from '../data/mockProducts.js';

export function ReportPriceModal({ onClose, selectedCity }) {
  const [productName, setProductName] = useState('');
  const [storeName, setStoreName] = useState(STORES_LIST[0]?.name || '');
  const [reportedPrice, setReportedPrice] = useState('');
  const [reportType, setReportType] = useState('oferta');
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!productName || !reportedPrice) return;
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg bg-white dark:bg-stone-800 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-stone-200/80 dark:border-stone-700/80 bg-stone-50/50 dark:bg-stone-900/40">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-emerald-500" />
              <span>Aportar o Reportar un Precio</span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Ayuda a la comunidad a mantener la transparencia de precios en {selectedCity}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-900 dark:text-white">¡Gracias por tu aporte!</h3>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Tu reporte será registrado y auditado para actualizar el comparador.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setReportType('oferta')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                  reportType === 'oferta'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-stone-100 dark:bg-stone-700/60 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-600'
                }`}
              >
                🟢 Oferta Real
              </button>
              <button
                type="button"
                onClick={() => setReportType('sobreprecio')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                  reportType === 'sobreprecio'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-stone-100 dark:bg-stone-700/60 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-600'
                }`}
              >
                🔴 Sobreprecio
              </button>
              <button
                type="button"
                onClick={() => setReportType('actualizacion')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                  reportType === 'actualizacion'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-stone-100 dark:bg-stone-700/60 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-600'
                }`}
              >
                🔵 Actualización
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">Nombre del producto / Marca</label>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Ej: Yerba Playadito 1kg o Aceite de Oliva 500ml"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">Comercio / Tienda</label>
                <select
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {STORES_LIST.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">Precio observado ($ ARS)</label>
                <input
                  type="number"
                  required
                  value={reportedPrice}
                  onChange={(e) => setReportedPrice(e.target.value)}
                  placeholder="Ej: 3850"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">Detalles adicionales (opcional)</label>
              <textarea
                rows={2}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Ej: Promo de 2x1 en caja de cobro o sucursal específica..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Enviar Reporte</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
