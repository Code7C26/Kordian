import { useCallback, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, X } from 'lucide-react'
import { adminFetch, readApiResponse } from '../config/api.js'

const PAGE_SIZE = 20

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'resolved', label: 'Corregidos' },
  { value: 'dismissed', label: 'Descartados' },
  { value: 'all', label: 'Todos' },
]

export default function CatalogTaxonomyReviewPanel({ categories, taxonomy }) {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [generatedAt, setGeneratedAt] = useState(null)
  const [selections, setSelections] = useState({})
  const [loading, setLoading] = useState(false)
  const [activeProductId, setActiveProductId] = useState(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const loadReview = useCallback(async (nextPage = 1, nextStatus = status, refresh = false) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(PAGE_SIZE),
        status: nextStatus,
      })
      if (refresh) params.set('refresh', 'true')

      const response = await adminFetch(`/analysis/catalog-taxonomy-review?${params}`)
      const data = await readApiResponse(response, 'No se pudo cargar el relevamiento de categorías')
      setItems(Array.isArray(data.items) ? data.items : [])
      setSummary(data.summary || null)
      setStatus(data.status || nextStatus)
      setPage(data.page || 1)
      setTotal(Number(data.total || 0))
      setTotalPages(Math.max(1, Number(data.totalPages || 1)))
      setGeneratedAt(data.generatedAt || null)
      setLoaded(true)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo cargar el relevamiento de categorías')
    } finally {
      setLoading(false)
    }
  }, [status])

  const saveDecision = async (item, nextStatus, subcategoryId = null) => {
    setActiveProductId(String(item.id))
    setError('')
    try {
      const response = await adminFetch('/review/catalog-taxonomy-decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.id,
          status: nextStatus,
          ...(subcategoryId ? { subcategoryId } : {}),
        }),
      })
      await readApiResponse(response, 'No se pudo guardar la decisión de revisión')
      await loadReview(page, status, true)
    } catch (requestError) {
      setError(requestError.message || 'No se pudo guardar la decisión de revisión')
    } finally {
      setActiveProductId(null)
    }
  }

  const getSelection = (item) => selections[item.id] || {
    categoryId: String(item.suggestedCategoryId || ''),
    subcategoryId: String(item.suggestedSubcategoryId || ''),
  }

  const updateSelection = (item, nextSelection) => {
    setSelections((previous) => ({
      ...previous,
      [item.id]: nextSelection,
    }))
  }

  return (
    <section className="rounded-3xl border border-amber-200/80 bg-white p-6 shadow-sm dark:border-amber-900/70 dark:bg-stone-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Posibles errores de categorías</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-500 dark:text-stone-400">
            Revisa sugerencias basadas en reglas antes de aplicar cambios. El relevamiento se ejecuta solo al solicitarlo y no altera el catálogo hasta que confirmes una clasificación.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadReview(1, status, true)}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Revisando...' : loaded ? 'Actualizar relevamiento' : 'Cargar relevamiento'}
        </button>
      </div>

      {summary && (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Pendientes', summary.pending, 'border-amber-200 bg-amber-50 text-amber-800'],
            ['Corregidos', summary.resolved, 'border-emerald-200 bg-emerald-50 text-emerald-800'],
            ['Descartados', summary.dismissed, 'border-stone-200 bg-stone-50 text-stone-700'],
            ['Detectados', summary.total, 'border-sky-200 bg-sky-50 text-sky-800'],
          ].map(([label, count, classes]) => (
            <div key={label} className={`rounded-xl border p-3 ${classes}`}>
              <div className="text-[11px] uppercase tracking-wide">{label}</div>
              <div className="mt-1 text-2xl font-black">{count}</div>
            </div>
          ))}
        </div>
      )}

      {loaded && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-stone-200 py-4 dark:border-stone-700">
          <label className="flex items-center gap-2 text-sm font-semibold">
            Mostrar
            <select
              value={status}
              onChange={(event) => loadReview(1, event.target.value)}
              disabled={loading}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-600 dark:bg-stone-900"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400">
            {generatedAt && <span>Generado: {new Date(generatedAt).toLocaleString()}</span>}
            <span>{total ? `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} de ${total}` : 'Sin resultados'}</span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {!loaded && !loading && (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-600 dark:text-stone-400">
          El relevamiento no se ejecuta automáticamente. Pulsa “Cargar relevamiento” para analizar las clasificaciones.
        </div>
      )}

      {loaded && items.length === 0 && !loading && (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-600 dark:text-stone-400">
          No hay productos en este estado.
        </div>
      )}

      <div className="mt-4 space-y-4">
        {items.map((item) => {
          const selection = getSelection(item)
          const category = taxonomy.find((entry) => String(entry.id) === selection.categoryId)
          const subcategories = category?.subcategories || []
          const busy = activeProductId === String(item.id)
          const isPending = item.decision === 'pending'

          return (
            <article key={item.id} className="rounded-2xl border border-stone-200 p-4 dark:border-stone-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-stone-900 dark:text-white">{item.name || `Producto ${item.id}`}</h3>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    ID {item.id} · {item.brand || 'Sin marca'} · {item.source || 'Origen desconocido'}
                    {item.classificationSource ? ` · Clasificación ${item.classificationSource}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  item.decision === 'resolved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : item.decision === 'dismissed'
                      ? 'bg-stone-100 text-stone-700'
                      : 'bg-amber-100 text-amber-800'
                }`}>
                  {item.decision === 'resolved' ? 'Corregido' : item.decision === 'dismissed' ? 'Descartado' : 'Pendiente'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p className="rounded-lg bg-stone-50 p-3 dark:bg-stone-900">
                  <strong>Actual:</strong> {item.actualCategory || 'Sin categoría'} / {item.actualSubcategory || 'Sin subcategoría'}
                </p>
                <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <strong>Sugerencia automática:</strong> {item.suggestedCategory} / {item.suggestedSubcategory}
                </p>
              </div>

              {(item.sourceCategory || item.sourceSubcategory) && (
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  Clasificación de origen: {[item.sourceCategory, item.sourceSubcategory].filter(Boolean).join(' / ')}
                </p>
              )}

              {isPending ? (
                <>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
                      Categoría correcta
                      <select
                        value={selection.categoryId}
                        onChange={(event) => {
                          const nextCategoryId = event.target.value
                          const nextSubcategories = taxonomy.find((entry) => String(entry.id) === nextCategoryId)?.subcategories || []
                          updateSelection(item, {
                            categoryId: nextCategoryId,
                            subcategoryId: String(nextSubcategories[0]?.id || ''),
                          })
                        }}
                        className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-white"
                      >
                        <option value="">Seleccionar categoría</option>
                        {categories.map((option) => (
                          <option key={option.id} value={String(option.id)}>{option.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
                      Subcategoría correcta
                      <select
                        value={selection.subcategoryId}
                        onChange={(event) => updateSelection(item, {
                          ...selection,
                          subcategoryId: event.target.value,
                        })}
                        disabled={!selection.categoryId || subcategories.length === 0}
                        className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900 dark:text-white"
                      >
                        <option value="">Seleccionar subcategoría</option>
                        {subcategories.map((option) => (
                          <option key={option.id} value={String(option.id)}>{option.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => saveDecision(item, 'resolved', selection.subcategoryId)}
                      disabled={busy || !selection.subcategoryId}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                      Aplicar clasificación
                    </button>
                    <button
                      type="button"
                      onClick={() => saveDecision(item, 'dismissed')}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200"
                    >
                      <X className="h-4 w-4" />
                      Descartar sugerencia
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => saveDecision(item, 'pending')}
                  disabled={busy}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-sky-300 px-3 py-2 text-xs font-bold text-sky-700 disabled:opacity-50 dark:text-sky-300"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reabrir revisión
                </button>
              )}
            </article>
          )
        })}
      </div>

      {loaded && totalPages > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-4" aria-label="Páginas de revisión de categorías">
          <button
            type="button"
            onClick={() => loadReview(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded-full border border-stone-300 p-2 disabled:opacity-30 dark:border-stone-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold">Página {page} de {totalPages}</span>
          <button
            type="button"
            onClick={() => loadReview(page + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-full border border-stone-300 p-2 disabled:opacity-30 dark:border-stone-600"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </nav>
      )}
    </section>
  )
}
