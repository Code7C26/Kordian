import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Send, AlertTriangle, CheckCircle, LoaderCircle } from 'lucide-react';
import { apiUrl } from '../config/api.js';
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';

export function ReportPriceModal({
  onClose,
  selectedCity,
  stores = [],
  storesLoading = false,
  product = null,
  reportedStoreName = '',
  reportedPrice = null,
}) {
  const { user, accessToken, loading: authLoading } = useCustomerAuth();
  const [storeName, setStoreName] = useState(reportedStoreName || product?.primaryStore?.name || '');
  const { t } = useLanguage();
  const [storeName, setStoreName] = useState('');
  const availableStores = [...new Map(
    stores
      .filter((store) => store?.name?.trim())
      .map((store) => [store.name.trim().toLocaleLowerCase(), { ...store, name: store.name.trim() }]),
  ).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const selectedStoreName = availableStores.some((store) => store.name === storeName)
    ? storeName
    : availableStores[0]?.name || '';
  const [productName, setProductName] = useState(product?.name || '');
  const [observedPrice, setObservedPrice] = useState(reportedPrice ?? (product?.currentPrice ? String(product.currentPrice) : ''));
  const [reportType, setReportType] = useState(product ? 'sobreprecio' : 'oferta');
  const [comments, setComments] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!user || !accessToken) {
      setError(t('Inicia sesión para enviar un reporte vinculado a tu cuenta.'));
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(apiUrl('/customer/price-reports'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ productName, storeName: selectedStoreName, reportedPrice: observedPrice, reportType, comments, city: selectedCity }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 404) {
        throw new Error('El servidor todavía no tiene habilitado el envío de reportes. Debe desplegarse la actualización del backend.');
      }
      if (!response.ok) throw new Error(payload.error || 'No se pudo enviar el reporte.');
      setSubmitted(true);
    } catch (submitError) {
      setError(t(submitError.message || 'No se pudo enviar el reporte.'));
    } finally {
      setIsSubmitting(false);
    }
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
              <span>{t('Aportar o Reportar un Precio')}</span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {t('Ayuda a la comunidad a mantener la transparencia de precios')}
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
            <h3 className="text-xl font-bold text-stone-900 dark:text-white">{t('¡Gracias por tu aporte!')}</h3>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('Tu reporte fue enviado para revisión del equipo.')}
            </p>
            <button type="button" onClick={onClose} className="mt-3 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-500">
              {t('Cerrar')}
            </button>
          </div>
        ) : authLoading ? (
          <div className="p-8 text-center text-sm text-stone-500" role="status">{t('Verificando tu cuenta…')}</div>
        ) : !user ? (
          <div className="space-y-4 p-6 text-center">
            <p className="text-sm text-stone-600 dark:text-stone-300">{t('Inicia sesión para que el equipo pueda identificar quién envió el reporte.')}</p>
            <Link to="/ingresar?next=%2Fbuscar" onClick={onClose} className="inline-flex rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-500">
              {t('Iniciar sesión')}
            </Link>
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
                🟢 {t('Oferta Real')}
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
                🔴 {t('Sobreprecio')}
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
                🔵 {t('Actualización')}
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">{t('Nombre del producto / Marca')}</label>
              <input
                type="text"
                required
                maxLength={160}
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={t('Ej: Yerba Playadito 1kg o Aceite de Oliva 500ml')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">{t('Comercio / Tienda')}</label>
                <select
                  required
                  value={selectedStoreName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  disabled={!availableStores.length}
                >
                  {availableStores.length ? (
                    availableStores.map((store) => (
                      <option key={store.id || store.name} value={store.name}>
                        {store.name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      {storesLoading ? t('Cargando comercios…') : t('No hay comercios integrados disponibles')}
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">{t('Precio observado ($ ARS)')}</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  max="1000000000"
                  value={observedPrice}
                  onChange={(e) => setObservedPrice(e.target.value)}
                  placeholder="Ej: 3850"
                  value={reportedPrice}
                  onChange={(e) => setReportedPrice(e.target.value)}
                  placeholder={t('Ej: 3850')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">{t('Detalles adicionales (opcional)')}</label>
              <textarea
                rows={2}
                maxLength={1000}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={t('Ej: Promo de 2x1 en caja de cobro o sucursal específica...')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900 text-stone-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
              />
            </div>

            {error && <p className="text-sm font-semibold text-rose-600" role="alert">{error}</p>}

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {t('Cancelar')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || storesLoading || !availableStores.length || !selectedStoreName}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>{isSubmitting ? t('Enviando…') : t('Enviar Reporte')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
