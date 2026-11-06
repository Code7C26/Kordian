import { useMemo, useState } from 'react'
import { Check, FileUp, RefreshCw, X } from 'lucide-react'
import { adminFetch, readApiResponse } from '../config/api.js'
import { formatCurrency } from '../utils/formatters.js'

const MAX_REPORT_BYTES = 15 * 1024 * 1024
const DECISION_BATCH_SIZE = 500
const IMPORT_BATCH_SIZE = 5
const IMPORTABLE_STATUSES = new Set(['ready_new_product', 'ready_add_offer'])
const HARD_CONFLICTS = new Set([
  'GTIN_CONTRADICTORIO',
  'PRESENTACION_INCOMPATIBLE',
  'VARIANTE_INCOMPATIBLE',
  'MARCA_DIFERENTE',
])

function decisionKey(sourceProductId, localProductId) {
  return `${sourceProductId}:${localProductId ?? 'no-comparable'}`
}

function formatDifferenceValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function hasExpectedReportShape(report) {
  return report?.mode === 'read_only_preflight'
    && Array.isArray(report.items)
    && report.items.length > 0
    && report.items.every((item) => (
      typeof item.sourceProductId === 'string'
      && (!item.candidateReport || Array.isArray(item.candidateReport.candidates))
    ))
}

function isDecisionCurrent(item, candidate, decision, verifiedDecisionIds) {
  if (!decision) return false
  if (verifiedDecisionIds.has(decision.id)) return true
  if (item.candidateReport.reusedDecision === decision.id) return true
  if (candidate?.priorDecision?.reused === true) return true
  return false
}

function getVisibleItems(report, decisions, verifiedDecisionIds) {
  const pending = []
  const approved = []
  const completed = []
  let noCandidateCount = 0

  for (const item of report?.items || []) {
    if (item.status !== 'manual_review_price_no_reference' || !item.candidateReport) continue
    const reportCandidates = item.candidateReport.candidates
    if (!reportCandidates.length) {
      noCandidateCount += 1
      const sourceDecision = decisions.get(decisionKey(item.sourceProductId, null))
      if (sourceDecision
        && isDecisionCurrent(item, null, sourceDecision, verifiedDecisionIds)
        && sourceDecision.decision_type === 'no_comparable'
        && sourceDecision.status === 'approved') {
        completed.push(item)
      }
      continue
    }

    const availableCandidates = []
    let itemApproved = null
    let itemCompleted = false
    let staleDecision = false
    for (const candidate of reportCandidates) {
      const decision = decisions.get(decisionKey(item.sourceProductId, candidate.localProductId))
      if (!decision) {
        availableCandidates.push(candidate)
      } else if (!isDecisionCurrent(item, candidate, decision, verifiedDecisionIds)) {
        staleDecision = true
        availableCandidates.push(candidate)
      } else if (decision.decision_type === 'match' && decision.status === 'approved') {
        itemApproved ||= { candidate, decision }
      } else if (decision.decision_type === 'no_comparable' && decision.status === 'approved') {
        itemCompleted = true
      } else if (decision.decision_type === 'no_match' && decision.status === 'rejected') {
        continue
      } else {
        availableCandidates.push(candidate)
      }
    }

    const sourceDecision = decisions.get(decisionKey(item.sourceProductId, null))
    if (sourceDecision) {
      if (!isDecisionCurrent(item, null, sourceDecision, verifiedDecisionIds)) staleDecision = true
      else if (sourceDecision.decision_type === 'no_comparable' && sourceDecision.status === 'approved') {
        itemCompleted = true
      }
    }

    if (itemApproved) {
      approved.push({ ...item, approvedCandidate: itemApproved.candidate })
      continue
    }
    if (itemCompleted) {
      completed.push(item)
      continue
    }
    if (availableCandidates.length) {
      pending.push({
        ...item,
        pendingCandidates: availableCandidates,
        ambiguous: availableCandidates.length > 1
          || (item.candidateReport.ambiguous && availableCandidates.length > 1),
        staleDecision,
      })
    }
  }

  return { pending, approved, completed, noCandidateCount }
}

function CandidateCard({ item, candidate, busy, onDecision }) {
  const hardConflict = candidate.reasons?.some((reason) => HARD_CONFLICTS.has(reason))

  return (
    <article className="rounded-2xl border border-stone-200 p-4 dark:border-stone-700">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl bg-stone-50 p-4 dark:bg-stone-900">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Carrefour</p>
          <h4 className="mt-1 font-bold">{item.name}</h4>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-stone-500">Marca</dt><dd>{item.brand || 'Sin marca'}</dd>
            <dt className="text-stone-500">SKU</dt><dd>{item.sourceSku || '—'}</dd>
            <dt className="text-stone-500">GTIN</dt><dd>{item.ean || '—'}</dd>
            <dt className="text-stone-500">Presentación</dt><dd>{item.netContent || '—'}</dd>
            <dt className="text-stone-500">Precio</dt><dd>{formatCurrency(item.capturedPrice)}</dd>
          </dl>
        </div>

        <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-950/30">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                {candidate.source || 'Catálogo local'} · ID {candidate.localProductId}
              </p>
              <h4 className="mt-1 font-bold">{candidate.name}</h4>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-sky-800 dark:bg-stone-800 dark:text-sky-200">
              {candidate.score}/100 · {candidate.status}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-stone-500">Marca</dt><dd>{candidate.brand || 'Sin marca'}</dd>
            <dt className="text-stone-500">ID de origen</dt><dd>{candidate.sourceProductId || '—'}</dd>
            <dt className="text-stone-500">SKU de origen</dt><dd>{candidate.sourceSku || '—'}</dd>
            <dt className="text-stone-500">GTIN</dt><dd>{candidate.gtin || '—'}</dd>
            <dt className="text-stone-500">Presentación</dt><dd>{candidate.presentation || '—'}</dd>
            <dt className="text-stone-500">Ofertas comparables</dt>
            <dd>{candidate.prices?.length
              ? candidate.prices.map((offer) => `${offer.supermarket}: ${formatCurrency(offer.price)}`).join(' · ')
              : 'No tiene'}</dd>
          </dl>
        </div>
      </div>

      {(candidate.differences?.length > 0 || candidate.reasons?.length > 0) && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Para revisar:</strong>{' '}
          {[...(candidate.reasons || []), ...(candidate.differences || []).map((difference) => (
            `${difference.field}: ${formatDifferenceValue(difference.source)} → ${formatDifferenceValue(difference.candidate)}`
          ))].join(' · ')}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDecision(item, candidate, 'match')}
          disabled={busy || hardConflict}
          title={hardConflict ? 'Hay una contradicción de identidad; no se puede aprobar este candidato.' : ''}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Check className="h-4 w-4" />
          Aprobar equivalencia
        </button>
        <button
          type="button"
          onClick={() => onDecision(item, candidate, 'no_match')}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-45 dark:text-rose-300"
        >
          <X className="h-4 w-4" />
          Rechazar candidato
        </button>
      </div>
    </article>
  )
}

export default function CarrefourMatchReviewPanel() {
  const [report, setReport] = useState(null)
  const [decisions, setDecisions] = useState(new Map())
  const [verifiedDecisionIds, setVerifiedDecisionIds] = useState(new Set())
  const [busyKey, setBusyKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [integrating, setIntegrating] = useState(false)
  const [integratedIds, setIntegratedIds] = useState(new Set())
  const [integrationSummary, setIntegrationSummary] = useState(null)
  const [integrationSkipped, setIntegrationSkipped] = useState([])
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  const visible = useMemo(
    () => getVisibleItems(report, decisions, verifiedDecisionIds),
    [report, decisions, verifiedDecisionIds],
  )
  const reportDate = report?.generatedAt || report?.items[0]?.capturedAt
  const uniquePending = visible.pending.filter((item) => !item.ambiguous)
  const ambiguousPending = visible.pending.filter((item) => item.ambiguous)

  const loadDecisions = async (sourceProductIds) => {
    const uniqueIds = [...new Set(sourceProductIds)]
    const loaded = []
    for (let offset = 0; offset < uniqueIds.length; offset += DECISION_BATCH_SIZE) {
      const params = new URLSearchParams({
        source: 'carrefour',
        sourceProductIds: uniqueIds.slice(offset, offset + DECISION_BATCH_SIZE).join(','),
      })
      const response = await adminFetch(`/review/product-match-decisions?${params}`)
      const payload = await readApiResponse(response, 'No se pudieron cargar las decisiones guardadas')
      loaded.push(...(payload.decisions || []))
    }
    return new Map(loaded.map((decision) => [
      decisionKey(decision.source_product_id, decision.local_product_id),
      decision,
    ]))
  }

  const readReport = async (file) => {
    setError('')
    if (!file) return
    if (file.size > MAX_REPORT_BYTES) {
      setError('El reporte supera el límite de 15 MB.')
      return
    }

    setLoading(true)
    try {
      const parsed = JSON.parse(await file.text())
      if (!hasExpectedReportShape(parsed)) {
        throw new Error('El archivo no tiene el formato esperado del preflight de Carrefour.')
      }
      const sourceProductIds = parsed.items
        .filter((item) => item.status === 'manual_review_price_no_reference')
        .map((item) => item.sourceProductId)
      const savedDecisions = await loadDecisions(sourceProductIds)
      setReport(parsed)
      setDecisions(savedDecisions)
      setVerifiedDecisionIds(new Set())
      setIntegratedIds(new Set())
      setIntegrationSummary(null)
      setIntegrationSkipped([])
      setFileName(file.name)
    } catch (loadError) {
      setError(loadError.message || 'No se pudo leer el reporte de Carrefour.')
      setReport(null)
      setDecisions(new Map())
      setFileName('')
    } finally {
      setLoading(false)
    }
  }

  const saveDecision = async (item, candidate, type) => {
    const key = decisionKey(item.sourceProductId, candidate?.localProductId)
    setBusyKey(key)
    setError('')
    try {
      const isMatch = type === 'match'
      const payload = {
        source: 'carrefour',
        sourceProductId: item.sourceProductId,
        sourceSku: item.sourceSku || '',
        localProductId: candidate?.localProductId ?? null,
        decisionType: isMatch ? 'match' : 'no_match',
        status: isMatch ? 'approved' : 'rejected',
        sourceProduct: {
          source: 'carrefour',
          sourceProductId: item.sourceProductId,
          sourceSku: item.sourceSku || '',
          ean: item.ean || '',
          name: item.name || '',
          brand: item.brand || '',
          presentation: item.netContent || '',
        },
        evidence: {
          reason: isMatch ? 'Aprobado manualmente en Administración > Agrupación.' : 'Candidato rechazado en Administración > Agrupación.',
          candidateScore: candidate?.score ?? null,
          candidateStatus: candidate?.status || null,
          differences: candidate?.differences || [],
          reasons: candidate?.reasons || [],
        },
      }
      const response = await adminFetch('/review/product-match-decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await readApiResponse(response, 'No se pudo guardar la decisión')
      const saved = result.decision
      setDecisions((previous) => new Map(previous).set(key, saved))
      setVerifiedDecisionIds((previous) => new Set(previous).add(saved.id))
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la decisión.')
    } finally {
      setBusyKey('')
    }
  }

  const markNoComparable = async (item) => {
    const key = decisionKey(item.sourceProductId, null)
    if (!window.confirm(`¿Dejar ${item.name} registrado como sin comparable disponible?`)) return
    setBusyKey(key)
    setError('')
    try {
      const response = await adminFetch('/review/product-match-decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'carrefour',
          sourceProductId: item.sourceProductId,
          sourceSku: item.sourceSku || '',
          localProductId: null,
          decisionType: 'no_comparable',
          status: 'approved',
          sourceProduct: {
            source: 'carrefour',
            sourceProductId: item.sourceProductId,
            sourceSku: item.sourceSku || '',
            ean: item.ean || '',
            name: item.name || '',
            brand: item.brand || '',
            presentation: item.netContent || '',
          },
          evidence: { reason: 'Confirmado manualmente en Administración > Agrupación.' },
        }),
      })
      const result = await readApiResponse(response, 'No se pudo guardar la decisión')
      setDecisions((previous) => new Map(previous).set(key, result.decision))
      setVerifiedDecisionIds((previous) => new Set(previous).add(result.decision.id))
    } catch (saveError) {
      setError(saveError.message || 'No se pudo guardar la decisión.')
    } finally {
      setBusyKey('')
    }
  }

  const renderQueue = (title, items, isAmbiguous) => (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{title}</h3>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700 dark:bg-stone-700 dark:text-stone-200">
          {items.length} producto(s)
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-600">
          No hay productos en esta sección.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article key={item.sourceProductId} className="rounded-2xl border border-stone-200 p-4 dark:border-stone-700">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-bold">{item.name}</h4>
                  <p className="text-xs text-stone-500">
                    Carrefour ID {item.sourceProductId} · SKU {item.sourceSku || '—'} · {item.pendingCandidates.length} candidato(s)
                  </p>
                </div>
                {item.staleDecision && (
                  <p role="status" className="max-w-md rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-900">
                    Hay una decisión guardada cuya vigencia no está confirmada por este reporte. Generá y cargá un preflight actualizado antes de reutilizarla.
                  </p>
                )}
              </div>
              <div className="space-y-3">
                {item.pendingCandidates.map((candidate) => {
                  const key = decisionKey(item.sourceProductId, candidate.localProductId)
                  return (
                    <CandidateCard
                      key={key}
                      item={item}
                      candidate={candidate}
                      busy={busyKey === key}
                      onDecision={saveDecision}
                    />
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => markNoComparable(item)}
                disabled={Boolean(busyKey)}
                className="mt-3 rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700 disabled:opacity-45 dark:border-stone-600 dark:text-stone-200"
              >
                Dejar como sin comparable
              </button>
            </article>
          ))}
        </div>
      )}
      {isAmbiguous && items.length > 0 && (
        <p className="mt-2 text-xs text-stone-500">
          No se sugiere una asociación automática en esta sección. Compará GTIN, presentación y variante antes de decidir.
        </p>
      )}
    </section>
  )

  const approved = visible.approved.filter((item) => (
    item.candidateReport.candidates.some((candidate) => {
      const decision = decisions.get(decisionKey(item.sourceProductId, candidate.localProductId))
      return decision?.decision_type === 'match'
        && decision.status === 'approved'
        && isDecisionCurrent(item, candidate, decision, verifiedDecisionIds)
    })
  ))
  const integrationSkippedIds = new Set(integrationSkipped.map((entry) => String(entry.sourceProductId)))
  const readyItems = (report?.items || []).filter((item) => (
    IMPORTABLE_STATUSES.has(item.status)
    && !integratedIds.has(item.sourceProductId)
    && !integrationSkippedIds.has(String(item.sourceProductId))
  ))
  const approvedItems = approved
    .filter((item) => (
      !integratedIds.has(item.sourceProductId)
      && !integrationSkippedIds.has(String(item.sourceProductId))
    ))
    .map((item) => {
      const decision = decisions.get(decisionKey(
        item.sourceProductId,
        item.approvedCandidate.localProductId,
      ))
      return { item, decision }
    })
    .filter(({ decision }) => decision?.id)
  const noComparableItems = visible.completed
    .map((item) => ({
      item,
      decision: decisions.get(decisionKey(item.sourceProductId, null)),
    }))
    .filter(({ decision }) => (
      decision?.decision_type === 'no_comparable'
      && decision.status === 'approved'
    ))
  const completedNoComparableIds = new Set(noComparableItems.map(({ item }) => item.sourceProductId))
  const noCandidateReviewItems = (report?.items || []).filter((item) => (
    item.status === 'manual_review_price_no_reference'
    && item.candidateReport
    && item.candidateReport.candidates.length === 0
    && !completedNoComparableIds.has(item.sourceProductId)
  ))
  const integrationTargets = [
    ...readyItems.map((item) => ({ item, decision: null })),
    ...approvedItems,
    ...noComparableItems,
  ]
  const displayedCandidateIds = new Set([
    ...uniquePending,
    ...ambiguousPending,
    ...noCandidateReviewItems,
    ...visible.completed,
  ].map((item) => item.sourceProductId))
  const pendingReviewItems = (report?.items || []).filter((item) => (
    (item.status.startsWith('manual_review')
      || item.status === 'blocked_invalid_row'
      || item.status === 'ready_update_offer')
    && !displayedCandidateIds.has(item.sourceProductId)
    && !visible.approved.some((approvedItem) => approvedItem.sourceProductId === item.sourceProductId)
  ))
  const runEligibleIntegration = async () => {
    if (!integrationTargets.length || integrating) return
    const invalidPostalCode = integrationTargets.find(({ item }) => !/^[A-Z0-9]{4,8}$/i.test(String(item.postalCode || '').trim()))
    if (invalidPostalCode) {
      setError(`No se puede revalidar ${invalidPostalCode.item.name}: el reporte no contiene un código postal válido.`)
      return
    }
    const newProductCount = readyItems.filter((item) => item.status === 'ready_new_product').length
    const newOfferCount = readyItems.filter((item) => item.status === 'ready_add_offer').length
    const confirmed = window.confirm(
      `Se volverán a consultar los productos en Carrefour. Se procesarán ${newProductCount} alta(s) ya listas, ${noComparableItems.length} producto(s) confirmado(s) sin comparable, ${newOfferCount} oferta(s) listas y ${approvedItems.length} equivalencia(s) aprobada(s). Los productos nuevos solo se crearán si no hay una identidad existente y pasan los controles de taxonomía y precio. No se actualizarán ofertas con precio o identidad diferente. La ejecución se divide en lotes de cinco; si un lote falla, los anteriores permanecen aplicados. ¿Continuar?`,
    )
    if (!confirmed) return

    setIntegrating(true)
    setError('')
    setIntegrationSummary(null)
    const summary = { createdProducts: 0, addedOffers: 0, unchanged: 0, skipped: [] }
    const completedIds = new Set()
    let activeBatch = []
    try {
      const byPostalCode = new Map()
      for (const target of integrationTargets) {
        const postalCode = String(target.item.postalCode).trim().toUpperCase()
        const group = byPostalCode.get(postalCode) || []
        group.push(target)
        byPostalCode.set(postalCode, group)
      }

      for (const [postalCode, targets] of byPostalCode) {
        for (let offset = 0; offset < targets.length; offset += IMPORT_BATCH_SIZE) {
          const batch = targets.slice(offset, offset + IMPORT_BATCH_SIZE)
          activeBatch = batch
          const response = await adminFetch('/admin/import/carrefour/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postalCode,
              batchId: `carrefour-review-${Date.now()}-${postalCode}-${offset}`,
              productIds: batch.map(({ item }) => item.sourceProductId),
              approvedMatches: batch
                .filter(({ decision }) => decision?.decision_type === 'match')
                .map(({ item, decision }) => ({
                  sourceProductId: item.sourceProductId,
                  decisionId: decision.id,
                })),
              approvedNoComparables: batch
                .filter(({ decision }) => decision?.decision_type === 'no_comparable')
                .map(({ item, decision }) => ({
                  sourceProductId: item.sourceProductId,
                  decisionId: decision.id,
                })),
              newProductIds: batch
                .filter(({ item }) => item.status === 'ready_new_product')
                .map(({ item }) => item.sourceProductId),
              addOfferIds: batch
                .filter(({ item }) => item.status === 'ready_add_offer')
                .map(({ item }) => item.sourceProductId),
              bulkRun: true,
              reviewSafeRun: true,
            }),
          })
          const result = await readApiResponse(response, 'No se pudo incorporar el lote Carrefour')
          summary.createdProducts += (result.imported || []).length
          summary.addedOffers += (result.updated || []).length
          summary.unchanged += (result.unchanged || []).length
          summary.skipped.push(...(result.skipped || []))
          for (const entry of [
            ...(result.imported || []),
            ...(result.updated || []),
            ...(result.unchanged || []),
          ]) {
            completedIds.add(String(entry.sourceProductId))
          }
          activeBatch = []
        }
      }
      setIntegratedIds((previous) => new Set([...previous, ...completedIds]))
      setIntegrationSkipped((previous) => [...previous, ...summary.skipped])
      setIntegrationSummary(summary)
    } catch (integrationError) {
      summary.skipped.push(...activeBatch.map(({ item }) => ({
        sourceProductId: item.sourceProductId,
        reason: integrationError.message || 'No se pudo revalidar; requiere revisión manual.',
      })))
      setIntegratedIds((previous) => new Set([...previous, ...completedIds]))
      setIntegrationSkipped((previous) => [...previous, ...summary.skipped])
      setIntegrationSummary(summary)
      setError(integrationError.message || 'La integración se interrumpió. Los lotes completados permanecen aplicados.')
    } finally {
      setIntegrating(false)
    }
  }

  return (
    <section className="rounded-3xl border border-sky-200/80 bg-white p-6 shadow-sm dark:border-sky-900/70 dark:bg-stone-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Revisión de candidatos Carrefour</h2>
          <p className="mt-1 max-w-3xl text-sm text-stone-500 dark:text-stone-400">
            Carga el JSON del preflight para separar candidatos únicos de productos ambiguos. Solo se incorporan equivalencias aprobadas y filas listas por el preflight; Carrefour y el catálogo se revalidan antes de escribir.
          </p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white">
          {loading
            ? <RefreshCw className="h-4 w-4 animate-spin" />
            : <FileUp className="h-4 w-4" />}
          {loading ? 'Cargando...' : 'Cargar reporte JSON'}
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={loading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              readReport(file)
            }}
          />
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {report && (
        <>
          <p className="mt-4 text-xs text-stone-500">
            Reporte: {fileName} · {report.rowCount} filas
            {reportDate && ` · fecha ${new Date(reportDate).toLocaleString()}`}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Pendientes únicos', uniquePending.length, 'border-sky-200 bg-sky-50 text-sky-800'],
              ['Pendientes ambiguos', ambiguousPending.length, 'border-amber-200 bg-amber-50 text-amber-800'],
              ['Aprobados para siguiente etapa', approved.length, 'border-emerald-200 bg-emerald-50 text-emerald-800'],
              ['Sin candidatos en el reporte', visible.noCandidateCount, 'border-stone-200 bg-stone-50 text-stone-700'],
            ].map(([label, count, classes]) => (
              <div key={label} className={`rounded-xl border p-3 ${classes}`}>
                <div className="text-[11px] uppercase tracking-wide">{label}</div>
                <div className="mt-1 text-2xl font-black">{count}</div>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sky-950 dark:text-sky-100">Integración controlada</h3>
                <p className="mt-1 text-sm text-sky-900 dark:text-sky-200">
                  {integrationTargets.length} seleccionable(s): {readyItems.filter((item) => item.status === 'ready_new_product').length} producto(s) nuevo(s),{' '}
                  {readyItems.filter((item) => item.status === 'ready_add_offer').length} oferta(s) de coincidencias del preflight y{' '}
                  {approvedItems.length} equivalencia(s) aprobada(s), {noComparableItems.length} caso(s) confirmado(s) sin comparable.
                </p>
                <p className="mt-1 text-xs text-sky-800 dark:text-sky-300">
                  No se actualizan ofertas existentes con cambios de precio o identidad. Los casos con precio, presentación, identidad o taxonomía dudosos siguen en revisión manual.
                </p>
              </div>
              <button
                type="button"
                onClick={runEligibleIntegration}
                disabled={integrating || integrationTargets.length === 0 || busyKey !== ''}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-800 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {integrating && <RefreshCw className="h-4 w-4 animate-spin" />}
                {integrating ? 'Revalidando e integrando...' : `Integrar ${integrationTargets.length} caso(s) elegible(s)`}
              </button>
            </div>
            {noComparableItems.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-sky-900 dark:text-sky-200">
                {noComparableItems.map(({ item }) => (
                  <li key={item.sourceProductId}>
                    Alta independiente si no existe referencia exacta: {item.name} · Carrefour ID {item.sourceProductId}
                  </li>
                ))}
              </ul>
            )}
            {integrationSummary && (
              <p role="status" className="mt-3 rounded-xl bg-white/80 p-3 text-sm text-sky-950 dark:bg-stone-900 dark:text-sky-100">
                Integración parcial/completa: {integrationSummary.createdProducts} producto(s) creado(s),{' '}
                {integrationSummary.addedOffers} oferta(s) agregada(s), {integrationSummary.unchanged} sin cambios y{' '}
                {integrationSummary.skipped.length} pendiente(s) de revisión.
              </p>
            )}
          </section>

          {renderQueue('Candidatos únicos', uniquePending, false)}
          {renderQueue('Casos ambiguos', ambiguousPending, true)}

          {noCandidateReviewItems.length > 0 && (
            <section className="mt-6 rounded-2xl border border-stone-200 p-4 dark:border-stone-700">
              <h3 className="font-bold">Sin candidatos: revisión manual ({noCandidateReviewItems.length})</h3>
              <p className="mt-1 text-sm text-stone-500">
                No se encontró una referencia local en el catálogo consultado. Confirmar “sin comparable” permite crear un producto Carrefour independiente si pasa las validaciones en vivo y tiene taxonomía.
              </p>
              <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto">
                {noCandidateReviewItems.map((item) => (
                  <li key={item.sourceProductId} className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 py-2 first:border-0 dark:border-stone-700">
                    <span className="min-w-0 text-sm">
                      <strong>{item.name}</strong>
                      <span className="ml-2 text-xs text-stone-500">
                        ID {item.sourceProductId} · {item.ean || 'sin GTIN'} · {formatCurrency(item.capturedPrice)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => markNoComparable(item)}
                      disabled={Boolean(busyKey) || integrating}
                      className="shrink-0 rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:opacity-45 dark:border-stone-600 dark:text-stone-200"
                    >
                      Confirmar sin comparable
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {approved.length > 0 && (
            <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <h3 className="font-bold text-emerald-900 dark:text-emerald-200">Aprobados, pendientes de incorporación</h3>
              <ul className="mt-2 space-y-1 text-sm text-emerald-900 dark:text-emerald-100">
                {approved.map((item) => (
                  <li key={item.sourceProductId}>
                    {item.name} → {item.approvedCandidate.name} ({item.approvedCandidate.source})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-300">
                La aprobación registra la decisión, pero no agrega todavía la oferta ni modifica el producto local.
              </p>
            </section>
          )}

          {(pendingReviewItems.length > 0 || integrationSkipped.length > 0) && (
            <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <h3 className="font-bold text-amber-950 dark:text-amber-100">
                Pendientes de revisión manual ({pendingReviewItems.length + integrationSkipped.length})
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-amber-950 dark:text-amber-100">
                {pendingReviewItems.map((item) => (
                  <li key={`${item.sourceProductId}:${item.status}`} className="border-t border-amber-200 pt-2 first:border-0 first:pt-0 dark:border-amber-900">
                    <strong>{item.name}</strong> · {item.status} · Carrefour ID {item.sourceProductId}
                    <p className="text-xs">{(item.reasons || []).join(' · ')
                      || (item.status === 'ready_update_offer'
                        ? 'La oferta ya existe con otro precio; se conserva sin actualizar.'
                        : 'No se integró automáticamente; requiere revisión.')}</p>
                  </li>
                ))}
                {integrationSkipped.map((entry, index) => (
                  <li key={`${entry.sourceProductId}:${index}`} className="border-t border-amber-200 pt-2 first:border-0 first:pt-0 dark:border-amber-900">
                    <strong>Carrefour ID {entry.sourceProductId}</strong> · {entry.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {!report && !loading && (
        <p className="mt-5 rounded-xl border border-dashed border-stone-300 p-5 text-center text-sm text-stone-500 dark:border-stone-600">
          Cargá el JSON generado por <code>preflight_carrefour_manifest.js</code> para abrir la cola de revisión.
        </p>
      )}
    </section>
  )
}
