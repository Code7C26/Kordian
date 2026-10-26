import { X, Info, Database, BarChart3 } from 'lucide-react'
import { useState } from 'react'
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx'
import { formatCurrency } from '../utils/formatters'
import {
  formatOptionalNumber,
  formatOptionalPercentage,
  getAnalysisLoadMessage,
} from '../utils/priceExplanationPresentation.js'

const statusLabels = {
  OFERTA: 'En oferta',
  PRECIO_NORMAL: 'Precio normal',
  EN_PRECIO: 'En precio',
  AUMENTO_ATIPICO: 'Aumento atípico',
  INFLADO: 'Precio potencialmente inflado',
  INFORMACION_INSUFICIENTE: 'Información insuficiente',
}

const getRiskLevel = (value, t) => {
  if (formatOptionalNumber(value) === 'No disponible') return { label: t('No disponible'), className: 'text-stone-900 dark:text-white' }
  const score = Number(value)
  if (score >= 60) return { label: t('Alto'), className: 'text-rose-700 dark:text-rose-300' }
  if (score >= 30) return { label: t('Medio'), className: 'text-amber-700 dark:text-amber-300' }
  return { label: t('Bajo'), className: 'text-emerald-700 dark:text-emerald-300' }
}

export default function PriceExplanationModal({ product, analysisLoadState = 'idle', onClose }) {
  const { t } = useLanguage()
  const [showRiskScale, setShowRiskScale] = useState(false)
  const translateProductName = useProductNameTranslator([product?.name])
  if (!product) return null
  const displayName = translateProductName(product.name)

  const analysis = product.analysis
  const indicators = analysis?.indicators || {}
  const references = Array.isArray(analysis?.references?.references)
    ? analysis.references.references
    : null
  const dataQuality = analysis?.dataQuality
  const status = t(statusLabels[analysis?.classification || product.status] || 'Estado no disponible')
  const riskLevel = getRiskLevel(analysis?.score, t)
  const confidenceLabel = formatOptionalNumber(analysis?.confidencePercentage) !== 'No disponible'
    ? `${t(analysis.confidence || 'No disponible')} (${formatOptionalPercentage(analysis.confidencePercentage)})`
    : t('No disponible')
  const scoreLabel = formatOptionalNumber(analysis?.score) !== 'No disponible'
    ? `${riskLevel.label} (${formatOptionalNumber(analysis.score)}/100)`
    : t('No disponible')
  const signals = Array.isArray(analysis?.indicators?.signals)
    ? analysis.indicators.signals
    : Array.isArray(analysis?.indicators?.reasons)
      ? analysis.indicators.reasons
      : null
  const analysisLoadMessage = t(getAnalysisLoadMessage(product, analysisLoadState))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4" role="presentation" onClick={onClose}>
      <section className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900" role="dialog" aria-modal="true" aria-labelledby="price-explanation-title" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-700">
          <div>
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <Info className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">{t('Explicación del análisis')}</span>
            </div>
            <h2 id="price-explanation-title" className="mt-2 text-xl font-black text-stone-900 dark:text-white">{displayName}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white" aria-label={t('Cerrar explicación')} title={t('Cerrar explicación')}>
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">{t('Clasificación')}</p>
            <p className="mt-1 font-black text-sky-700 dark:text-sky-300">{status}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">{t('Confianza')}</p>
            <p className="mt-1 font-black text-stone-900 dark:text-white">{confidenceLabel}</p>
          </div>
          <div className="relative rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">{t('Puntaje')}</p>
              <button type="button" onClick={() => setShowRiskScale((visible) => !visible)} className="rounded-full p-1 text-stone-500 hover:bg-stone-200 hover:text-sky-600 dark:hover:bg-stone-700 dark:hover:text-sky-300" aria-label={t('Ver escala del nivel de riesgo')} title={t('Ver escala del nivel de riesgo')}>
                <Info className="h-4 w-4" />
              </button>
            </div>
            <p className={`mt-1 font-black ${riskLevel.className}`}>{scoreLabel}</p>
            {showRiskScale && (
              <div className="absolute right-3 top-12 z-10 w-64 rounded-xl border border-stone-300 bg-white p-3 text-xs shadow-xl dark:border-stone-600 dark:bg-stone-900">
                <p className="font-bold text-stone-900 dark:text-white">{t('Escala del nivel de riesgo')}</p>
                <div className="mt-2 space-y-1.5 text-stone-600 dark:text-stone-300">
                  <p><strong className="text-emerald-700 dark:text-emerald-300">0-29: {t('Bajo')}</strong> · {t('Señales débiles o aisladas.')}</p>
                  <p><strong className="text-amber-700 dark:text-amber-300">30-59: {t('Medio')}</strong> · {t('Requiere revisar el contexto.')}</p>
                  <p><strong className="text-rose-700 dark:text-rose-300">60-100: {t('Alto')}</strong> · {t('Posible anomalía.')}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700">
            <h3 className="flex items-center gap-2 font-bold text-stone-900 dark:text-white"><BarChart3 className="h-4 w-4 text-sky-600" /> {t('Indicadores')}</h3>
            <dl className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-300">
              <div className="flex justify-between gap-3"><dt>{t('Variación histórica')}</dt><dd className="font-bold">{t(formatOptionalPercentage(indicators.percentageVariation))}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t('Desvío de inflación')}</dt><dd className="font-bold">{t(formatOptionalPercentage(indicators.inflationDeviation))}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t('Registros históricos')}</dt><dd className="font-bold">{t(formatOptionalNumber(dataQuality?.historyPoints, 0))}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t('Supermercados')}</dt><dd className="font-bold">{t(formatOptionalNumber(dataQuality?.supermarkets, 0))}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t('Comparables')}</dt><dd className="font-bold">{t(formatOptionalNumber(dataQuality?.comparables, 0))}</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700">
            <h3 className="flex items-center gap-2 font-bold text-stone-900 dark:text-white"><Database className="h-4 w-4 text-sky-600" /> {t('Evidencia')}</h3>
            {signals?.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">{signals.map((signal, index) => <li key={signal.id || index}>{typeof signal === 'string' ? t(signal) : `${t(signal.label)} (${signal.score} ${t('puntos')})`}</li>)}</ul> : <p className="mt-3 text-sm text-stone-500">{t(signals ? 'No se detectaron señales adicionales.' : 'Sin datos de evidencia disponibles.')}</p>}
            <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">{t('Calidad de datos:')} <strong>{t(dataQuality?.quality || 'No disponible')}</strong></p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 p-4 dark:border-stone-700">
          <h3 className="font-bold text-stone-900 dark:text-white">{t('Referencias comparables')}</h3>
          {references?.length ? <div className="mt-3 space-y-2 text-sm">{references.map((reference) => <div key={reference.id} className="flex justify-between gap-3 text-stone-600 dark:text-stone-300"><span>{reference.name}</span><strong>{formatCurrency(reference.price || 0)}</strong></div>)}</div> : <p className="mt-2 text-sm text-stone-500">{t(references ? 'No hay referencias comparables suficientes.' : 'Referencias comparables no disponibles.')}</p>}
          {analysisLoadMessage && <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">{analysisLoadMessage}</p>}
        </div>
      </section>
    </div>
  )
}
