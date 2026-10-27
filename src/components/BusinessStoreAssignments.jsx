import { useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, LoaderCircle, Save } from 'lucide-react'
import { adminFetch, apiFetch, readApiResponse } from '../config/api.js'
import ClearableSearchInput from './ClearableSearchInput.jsx'
import { matchesSearchTerms } from '../utils/searchTerms.js'

export default function BusinessStoreAssignments() {
  const [accounts, setAccounts] = useState([])
  const [supermarkets, setSupermarkets] = useState([])
  const [drafts, setDrafts] = useState({})
  const [search, setSearch] = useState('')
  const [busyUserId, setBusyUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [accountsResponse, supermarketsResponse] = await Promise.all([
        adminFetch('/admin/business-accounts'),
        apiFetch('/supermarkets'),
      ])
      const [accountData, supermarketData] = await Promise.all([
        readApiResponse(accountsResponse, 'No se pudieron cargar las cuentas comerciales.'),
        readApiResponse(supermarketsResponse, 'No se pudieron cargar los supermercados.'),
      ])
      setAccounts(accountData)
      setSupermarkets(supermarketData)
      setDrafts(Object.fromEntries(accountData.map((account) => [account.user_id, {
        role: account.role,
        supermarketId: account.supermarket_id || '',
      }])))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts
    return accounts.filter((account) => (
      matchesSearchTerms([account.username, account.email], search)
    ))
  }, [accounts, search])

  const updateDraft = (userId, updates) => {
    setDrafts((current) => ({
      ...current,
      [userId]: { ...current[userId], ...updates },
    }))
  }

  const saveAssignment = async (account) => {
    const draft = drafts[account.user_id]
    if (!draft) return

    setBusyUserId(account.user_id)
    setError('')
    setNotice('')
    try {
      const response = await adminFetch(`/admin/business-accounts/${encodeURIComponent(account.user_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: draft.role,
          supermarketId: draft.role === 'business' ? draft.supermarketId || null : null,
        }),
      })
      const updatedAccount = await readApiResponse(response, 'No se pudo guardar la asignación.')
      setAccounts((current) => current.map((item) => item.user_id === account.user_id ? updatedAccount : item))
      setDrafts((current) => ({
        ...current,
        [account.user_id]: {
          role: updatedAccount.role,
          supermarketId: updatedAccount.supermarket_id || '',
        },
      }))
      setNotice(`Se actualizó la cuenta de ${updatedAccount.username}.`)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusyUserId('')
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-stone-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            <BriefcaseBusiness className="h-5 w-5 text-sky-600" aria-hidden="true" />
            Cuentas comerciales
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
            Habilitá cuentas comerciales y asignales el supermercado cuyo catálogo podrán gestionar.
          </p>
        </div>
        <ClearableSearchInput
          aria-label="Buscar cuentas por usuario o correo"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="Buscar cuenta"
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900"
        />
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-stone-500" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando cuentas…
        </div>
      ) : filteredAccounts.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">No hay cuentas que coincidan con la búsqueda.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {filteredAccounts.map((account) => {
            const draft = drafts[account.user_id] || { role: account.role, supermarketId: account.supermarket_id || '' }
            const busy = busyUserId === account.user_id
            return (
              <article key={account.user_id} className="grid gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-700 md:grid-cols-[minmax(0,1fr)_10rem_minmax(12rem,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-bold text-stone-900 dark:text-white">{account.username}</p>
                  <p className="truncate text-xs text-stone-500 dark:text-stone-400">{account.email}</p>
                </div>
                <label className="space-y-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
                  Tipo de cuenta
                  <select value={draft.role} onChange={(event) => updateDraft(account.user_id, { role: event.target.value, supermarketId: event.target.value === 'business' ? draft.supermarketId : '' })} className="block w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-white">
                    <option value="customer">Cliente</option>
                    <option value="business">Comercio</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
                  Supermercado asignado
                  <select disabled={draft.role !== 'business'} value={draft.supermarketId} onChange={(event) => updateDraft(account.user_id, { supermarketId: event.target.value })} className="block w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900 dark:text-white">
                    <option value="">Sin asignar</option>
                    {supermarkets.map((supermarket) => <option key={supermarket.id} value={supermarket.id}>{supermarket.name}</option>)}
                  </select>
                </label>
                <button type="button" disabled={busy} onClick={() => saveAssignment(account)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50">
                  {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  Guardar
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
