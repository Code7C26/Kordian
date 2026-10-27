import { useEffect, useState } from 'react'
import { LoaderCircle, Save, Search, Trash2, Users } from 'lucide-react'
import { adminFetch, readApiResponse } from '../config/api.js'
import ClearableSearchInput from './ClearableSearchInput.jsx'

const ACCOUNT_TYPES = [
  { value: 'customer', label: 'Cliente' },
  { value: 'administrator', label: 'Administrador' },
  { value: 'business', label: 'Comercio' },
]

export default function RegisteredUserAccounts() {
  const [accounts, setAccounts] = useState([])
  const [draftRoles, setDraftRoles] = useState({})
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [busyUserId, setBusyUserId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    async function loadAccounts() {
      try {
        const query = new URLSearchParams({ page: String(page) })
        if (search.trim()) query.set('search', search.trim())
        const response = await adminFetch(`/admin/customer-accounts?${query}`, {
          signal: controller.signal,
        })
        const payload = await readApiResponse(response, 'No se pudieron cargar las cuentas registradas.')
        if (!active) return
        if (!Array.isArray(payload.accounts) || !Number.isFinite(payload.total)) {
          throw new Error('El servidor devolvió un listado de cuentas con formato inválido.')
        }
        setAccounts(payload.accounts)
        setTotal(payload.total)
        setDraftRoles((current) => ({
          ...current,
          ...Object.fromEntries(payload.accounts.map((account) => [account.user_id, account.role])),
        }))
      } catch (loadError) {
        if (active && loadError.name !== 'AbortError') setError(loadError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    const timeout = window.setTimeout(loadAccounts, search === '' ? 0 : 250)
    return () => {
      active = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [page, search])

  const totalPages = Math.max(1, Math.ceil(total / 50))

  const saveRole = async (account) => {
    const role = draftRoles[account.user_id]
    if (!ACCOUNT_TYPES.some((type) => type.value === role)) return

    setBusyUserId(account.user_id)
    setBusyAction('save')
    setError('')
    setNotice('')
    try {
      const response = await adminFetch(`/admin/customer-accounts/${encodeURIComponent(account.user_id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const updatedAccount = await readApiResponse(response, 'No se pudo actualizar el tipo de cuenta.')
      setAccounts((current) => current.map((item) =>
        item.user_id === updatedAccount.user_id ? updatedAccount : item
      ))
      setDraftRoles((current) => ({ ...current, [updatedAccount.user_id]: updatedAccount.role }))
      setNotice(`Se actualizó el tipo de cuenta de ${updatedAccount.username}.`)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setBusyUserId('')
      setBusyAction('')
    }
  }

  const deleteAccount = async (account) => {
    const confirmed = window.confirm(
      `¿Eliminar permanentemente la cuenta de ${account.username} (${account.email}) y todos sus datos? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return

    setBusyUserId(account.user_id)
    setBusyAction('delete')
    setError('')
    setNotice('')
    try {
      const response = await adminFetch(`/admin/customer-accounts/${encodeURIComponent(account.user_id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) await readApiResponse(response, 'No se pudo eliminar la cuenta.')
      setAccounts((current) => current.filter((item) => item.user_id !== account.user_id))
      setDraftRoles((current) => {
        const next = { ...current }
        delete next[account.user_id]
        return next
      })
      setTotal((current) => Math.max(0, current - 1))
      setNotice(`Se eliminó la cuenta de ${account.username} y sus datos asociados.`)
      if (accounts.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1))
        setLoading(true)
      }
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setBusyUserId('')
      setBusyAction('')
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm dark:bg-stone-800">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            <Users className="h-5 w-5 text-sky-600" aria-hidden="true" />
            Cuentas registradas
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600 dark:text-stone-400">
            Busca por nombre de usuario o correo y asigna un tipo de cuenta.
          </p>
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar cuentas</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
          <ClearableSearchInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
              setLoading(true)
              setError('')
            }}
            onClear={() => {
              setSearch('')
              setPage(1)
              setLoading(true)
              setError('')
            }}
            placeholder="Buscar usuario o correo"
            className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-stone-600 dark:bg-stone-900 sm:w-72"
          />
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-stone-500" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando cuentas…
        </div>
      ) : accounts.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">
          {search.trim() ? 'No hay cuentas que coincidan con la búsqueda.' : 'Todavía no hay cuentas registradas.'}
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {accounts.map((account) => {
            const role = draftRoles[account.user_id] || account.role
            const busy = busyUserId === account.user_id
            const savedRole = role === account.role
            return (
              <article key={account.user_id} className="grid gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-700 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-bold text-stone-900 dark:text-white">{account.username}</p>
                  <p className="truncate text-xs text-stone-500 dark:text-stone-400">{account.email}</p>
                </div>
                <label className="space-y-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
                  Tipo de cuenta
                  <select
                    value={role}
                    onChange={(event) => setDraftRoles((current) => ({
                      ...current,
                      [account.user_id]: event.target.value,
                    }))}
                    className="block w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-900 dark:text-white"
                  >
                    {ACCOUNT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || savedRole}
                  onClick={() => saveRole(account)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && busyAction === 'save' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                  Guardar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => deleteAccount(account)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  aria-label={`Eliminar cuenta de ${account.username}`}
                >
                  {busy && busyAction === 'delete' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  Eliminar
                </button>
              </article>
            )
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2 text-sm">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => {
                  setPage((current) => Math.max(1, current - 1))
                  setLoading(true)
                }}
                className="rounded-lg border border-stone-300 px-3 py-2 font-semibold disabled:opacity-50 dark:border-stone-600"
              >
                Anterior
              </button>
              <span className="text-stone-500 dark:text-stone-400">
                Página {page} de {totalPages} · {total} cuentas
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => {
                  setPage((current) => Math.min(totalPages, current + 1))
                  setLoading(true)
                }}
                className="rounded-lg border border-stone-300 px-3 py-2 font-semibold disabled:opacity-50 dark:border-stone-600"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
