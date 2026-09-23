import { X, Info, Database, BarChart3 } from 'lucide-react'
import { useState } from 'react'
import { formatCurrency } from '../utils/formatters'

const statusLabels = {
  OFERTA: 'En oferta',
  PRECIO_NORMAL: 'Precio normal',
  EN_PRECIO: 'En precio',
  AUMENTO_ATIPICO: 'Aumento atípico',
  INFLADO: 'Precio potencialmente inflado',
  INFORMACION_INSUFICIENTE: 'Información insuficiente',
}

const formatValue = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(1) : 'No disponible'

const getRiskLevel = (value) => {
  const score = Number(value)
  if (!Number.isFinite(score)) return { label: 'No disponible', className: 'text-stone-900 dark:text-white' }
  if (score >= 60) return { label: 'Alto', className: 'text-rose-700 dark:text-rose-300' }
  if (score >= 30) return { label: 'Medio', className: 'text-amber-700 dark:text-amber-300' }
  return { label: 'Bajo', className: 'text-emerald-700 dark:text-emerald-300' }
}

export default function PriceExplanationModal({ product, onClose }) {
  const [showRiskScale, setShowRiskScale] = useState(false)
  if (!product) return null

  const analysis = product.analysis || {}
  const indicators = analysis.indicators || {}
  const references = analysis.references?.references || []
  const dataQuality = analysis.dataQuality || {}
  const status = statusLabels[analysis.classification || product.status] || 'Estado no disponible'
  const riskLevel = getRiskLevel(analysis.score)
  const signals = Array.isArray(analysis.indicators?.signals)
    ? analysis.indicators.signals
    : Array.isArray(analysis.indicators?.reasons)
      ? analysis.indicators.reasons
      : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4" role="presentation" onClick={onClose}>
      <section className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900" role="dialog" aria-modal="true" aria-labelledby="price-explanation-title" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-700">
          <div>
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <Info className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Explicación del análisis</span>
            </div>
            <h2 id="price-explanation-title" className="mt-2 text-xl font-black text-stone-900 dark:text-white">{product.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-white" aria-label="Cerrar explicación" title="Cerrar explicación">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/40">
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">Clasificación</p>
            <p className="mt-1 font-black text-sky-700 dark:text-sky-300">{status}</p>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">Confianza</p>
            <p className="mt-1 font-black text-stone-900 dark:text-white">{analysis.confidence || 'baja'} ({formatValue(analysis.confidencePercentage)}%)</p>
          </div>
          <div className="relative rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-800">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">Puntaje</p>
              <button type="button" onClick={() => setShowRiskScale((visible) => !visible)} className="rounded-full p-1 text-stone-500 hover:bg-stone-200 hover:text-sky-600 dark:hover:bg-stone-700 dark:hover:text-sky-300" aria-label="Ver escala del nivel de riesgo" title="Ver escala del nivel de riesgo">
                <Info className="h-4 w-4" />
              </button>
            </div>
            <p className={`mt-1 font-black ${riskLevel.className}`}>{riskLevel.label} ({formatValue(analysis.score)}/100)</p>
            {showRiskScale && (
              <div className="absolute right-3 top-12 z-10 w-64 rounded-xl border border-stone-300 bg-white p-3 text-xs shadow-xl dark:border-stone-600 dark:bg-stone-900">
                <p className="font-bold text-stone-900 dark:text-white">Escala del nivel de riesgo</p>
                <div className="mt-2 space-y-1.5 text-stone-600 dark:text-stone-300">
                  <p><strong className="text-emerald-700 dark:text-emerald-300">0-29: Bajo</strong> · Señales débiles o aisladas.</p>
                  <p><strong className="text-amber-700 dark:text-amber-300">30-59: Medio</strong> · Requiere revisar el contexto.</p>
                  <p><strong className="text-rose-700 dark:text-rose-300">60-100: Alto</strong> · Posible anomalía.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700">
            <h3 className="flex items-center gap-2 font-bold text-stone-900 dark:text-white"><BarChart3 className="h-4 w-4 text-sky-600" /> Indicadores</h3>
            <dl className="mt-3 space-y-2 text-sm text-stone-600 dark:text-stone-300">
              <div className="flex justify-between gap-3"><dt>Variación histórica</dt><dd className="font-bold">{formatValue(indicators.percentageVariation)}%</dd></div>
              <div className="flex justify-between gap-3"><dt>Desvío de inflación</dt><dd className="font-bold">{formatValue(indicators.inflationDeviation)}%</dd></div>
              <div className="flex justify-between gap-3"><dt>Registros históricos</dt><dd className="font-bold">{dataQuality.historyPoints ?? 0}</dd></div>
              <div className="flex justify-between gap-3"><dt>Supermercados</dt><dd className="font-bold">{dataQuality.supermarkets ?? 0}</dd></div>
              <div className="flex justify-between gap-3"><dt>Comparables</dt><dd className="font-bold">{dataQuality.comparables ?? 0}</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border border-stone-200 p-4 dark:border-stone-700">
            <h3 className="flex items-center gap-2 font-bold text-stone-900 dark:text-white"><Database className="h-4 w-4 text-sky-600" /> Evidencia</h3>
            {signals.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-600 dark:text-stone-300">{signals.map((signal, index) => <li key={signal.id || index}>{typeof signal === 'string' ? signal : `${signal.label} (${signal.score} puntos)`}</li>)}</ul> : <p className="mt-3 text-sm text-stone-500">No se detectaron señales adicionales.</p>}
            <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">Calidad de datos: <strong>{dataQuality.quality || 'baja'}</strong></p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 p-4 dark:border-stone-700">
          <h3 className="font-bold text-stone-900 dark:text-white">Referencias comparables</h3>
          {references.length ? <div className="mt-3 space-y-2 text-sm">{references.map((reference) => <div key={reference.id} className="flex justify-between gap-3 text-stone-600 dark:text-stone-300"><span>{reference.name}</span><strong>{formatCurrency(reference.price || 0)}</strong></div>)}</div> : <p className="mt-2 text-sm text-stone-500">No hay referencias comparables suficientes.</p>}
        </div>
      </section>
    </div>
  )
}
