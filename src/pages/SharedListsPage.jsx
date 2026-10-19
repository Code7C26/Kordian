import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, ListPlus, LoaderCircle, Plus, Share2, Trash2, Users } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { apiUrl } from '../config/api.js'

export default function SharedListsPage() {
  const { loading: authLoading, user, accessToken } = useCustomerAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteFromUrl = searchParams.get('invite') || ''
  const handledInvite = useRef('')
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState('')
  const [selectedList, setSelectedList] = useState(null)
  const [newListName, setNewListName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'No se pudo completar la operación.')
    return payload
  }, [accessToken])

  const loadLists = useCallback(async () => {
    const data = await request('/shared-lists')
    setLists(data)
    return data
  }, [request])

  const loadList = useCallback(async (listId) => {
    if (!listId) {
      setSelectedList(null)
      return null
    }
    const data = await request(`/shared-lists/${encodeURIComponent(listId)}`)
    setSelectedList(data)
    return data
  }, [request])

  useEffect(() => {
    if (authLoading || !accessToken) return undefined
    let active = true
    setLoading(true)
    request('/shared-lists')
      .then((data) => {
        if (!active) return
        setLists(data)
        setSelectedListId((current) => current || data[0]?.id || '')
        setError('')
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accessToken, authLoading, request])

  useEffect(() => {
    if (!accessToken || !inviteFromUrl || handledInvite.current === inviteFromUrl) return
    let active = true
    setBusy(true)
    request('/shared-lists/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: inviteFromUrl }),
    })
      .then(async (joinedList) => {
        if (!active) return
        handledInvite.current = inviteFromUrl
        await loadLists()
        setSelectedListId(joinedList.id)
        setNotice(`Te uniste a “${joinedList.name}”.`)
        navigate('/listas-compartidas', { replace: true })
      })
      .catch((joinError) => {
        if (active) setError(joinError.message)
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [accessToken, inviteFromUrl, loadLists, navigate, request])

  useEffect(() => {
    if (!selectedListId || !accessToken) {
      setSelectedList(null)
      return undefined
    }
    let active = true
    const refresh = () => request(`/shared-lists/${encodeURIComponent(selectedListId)}`)
      .then((data) => {
        if (active) setSelectedList(data)
      })
      .catch((loadError) => {
        if (active) setError(loadError.message)
      })
    refresh()
    const timer = window.setInterval(refresh, 10000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [accessToken, request, selectedListId])

  if (authLoading) {
    return <main className="flex min-h-screen items-center justify-center text-stone-600 dark:bg-stone-950 dark:text-stone-300" role="status">Cargando sesión…</main>
  }
  if (!user) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/ingresar?next=${encodeURIComponent(next)}`} replace />
  }

  const createList = async (event) => {
    event.preventDefault()
    if (!newListName.trim()) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const list = await request('/shared-lists', {
        method: 'POST',
        body: JSON.stringify({ name: newListName }),
      })
      await loadLists()
      setNewListName('')
      setSelectedListId(list.id)
      setNotice(`Se creó “${list.name}”.`)
    } catch (createError) {
      setError(createError.message)
    } finally {
      setBusy(false)
    }
  }

  const joinList = async (event) => {
    event.preventDefault()
    if (!inviteCode.trim()) return
    let normalizedInviteCode = inviteCode.trim()
    try {
      normalizedInviteCode = new URL(normalizedInviteCode).searchParams.get('invite') || normalizedInviteCode
    } catch {
      normalizedInviteCode = normalizedInviteCode.replace(/^invite=/, '')
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const list = await request('/shared-lists/join', {
        method: 'POST',
        body: JSON.stringify({ inviteCode: normalizedInviteCode }),
      })
      await loadLists()
      setInviteCode('')
      setSelectedListId(list.id)
      setNotice(`Te uniste a “${list.name}”.`)
    } catch (joinError) {
      setError(joinError.message)
    } finally {
      setBusy(false)
    }
  }

  const addItem = async (event) => {
    event.preventDefault()
    if (!selectedListId || !itemName.trim()) return
    setBusy(true)
    setError('')
    try {
      await request(`/shared-lists/${encodeURIComponent(selectedListId)}/items`, {
        method: 'POST',
        body: JSON.stringify({ itemName, quantity }),
      })
      setItemName('')
      setQuantity(1)
      await loadList(selectedListId)
      await loadLists()
    } catch (addError) {
      setError(addError.message)
    } finally {
      setBusy(false)
    }
  }

  const updateItem = async (item, changes) => {
    setError('')
    try {
      await request(`/shared-lists/${encodeURIComponent(selectedListId)}/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      })
      await loadList(selectedListId)
      await loadLists()
    } catch (updateError) {
      setError(updateError.message)
    }
  }

  const removeItem = async (itemId) => {
    setError('')
    try {
      await request(`/shared-lists/${encodeURIComponent(selectedListId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      })
      await loadList(selectedListId)
      await loadLists()
    } catch (removeError) {
      setError(removeError.message)
    }
  }

  const shareList = async () => {
    if (!selectedList) return
    const inviteUrl = new URL(`/listas-compartidas?invite=${encodeURIComponent(selectedList.invite_code)}`, window.location.origin).toString()
    try {
      if (navigator.share) {
        await navigator.share({ title: `Lista compartida: ${selectedList.name}`, text: 'Únete a mi lista de compras de AR-PRICE', url: inviteUrl })
      } else {
        await navigator.clipboard.writeText(inviteUrl)
      }
      setNotice('Enlace privado copiado o compartido. Solo pueden unirse usuarios con cuenta.')
      setError('')
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError('No se pudo compartir el enlace. Copia el código de invitación manualmente.')
    }
  }

  const pageClass = 'min-h-screen bg-stone-50 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6'
  const inputClass = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:ring-sky-950'

  return (
    <main className={pageClass}>
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
          <Link to="/" className="font-black text-sky-700 dark:text-sky-300">AR-PRICE</Link>
          <Link to="/buscar" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-sky-700 dark:text-stone-300 dark:hover:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a productos
          </Link>
        </header>

        <section className="py-7">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Users className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-sky-700 dark:text-sky-300">Compras colaborativas</p>
              <h1 className="text-2xl font-black sm:text-3xl">Listas compartidas</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-stone-600 dark:text-stone-400">Crea una lista, invita a otras personas con un enlace privado y editen juntos los artículos y cantidades. Los cambios se sincronizan automáticamente.</p>
        </section>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</div>}

        <div className="grid gap-6 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
          <aside className="space-y-4">
            <form onSubmit={createList} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <h2 className="font-bold">Crear una lista</h2>
              <label className="sr-only" htmlFor="new-shared-list-name">Nombre de la lista</label>
              <input id="new-shared-list-name" className={inputClass} maxLength={80} value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Ej.: Compra del fin de semana" />
              <button disabled={busy || !newListName.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />} Crear lista
              </button>
            </form>

            <form onSubmit={joinList} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <h2 className="font-bold">Unirme con invitación</h2>
              <label className="sr-only" htmlFor="shared-list-invite-code">Código de invitación</label>
              <input id="shared-list-invite-code" className={inputClass} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="Pega el enlace o código" />
              <button disabled={busy || !inviteCode.trim()} className="w-full rounded-xl border border-sky-700 px-4 py-2.5 text-sm font-bold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-950/40">Unirme</button>
            </form>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <h2 className="mb-3 font-bold">Mis listas</h2>
              {loading ? (
                <p className="text-sm text-stone-500">Cargando listas…</p>
              ) : lists.length ? (
                <div className="space-y-2">
                  {lists.map((list) => (
                    <button key={list.id} type="button" onClick={() => setSelectedListId(list.id)} className={`w-full rounded-xl border px-3 py-3 text-left ${list.id === selectedListId ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40' : 'border-stone-200 hover:border-sky-300 dark:border-stone-700'}`}>
                      <span className="block truncate text-sm font-bold">{list.name}</span>
                      <span className="mt-1 block text-xs text-stone-500">{list.role === 'owner' ? 'Propietario' : 'Compartida'}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500 dark:text-stone-400">Todavía no tienes listas compartidas.</p>
              )}
            </section>
          </aside>

          <section className="min-h-80 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
            {selectedList ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4 dark:border-stone-800">
                  <div>
                    <h2 className="text-xl font-black">{selectedList.name}</h2>
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{selectedList.memberCount} participante{selectedList.memberCount === 1 ? '' : 's'} · Sincroniza automáticamente</p>
                  </div>
                  <button type="button" onClick={shareList} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-800">
                    <Share2 className="h-4 w-4" aria-hidden="true" /> Invitar
                  </button>
                </div>
                <form onSubmit={addItem} className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto]">
                  <label className="sr-only" htmlFor="shared-list-item-name">Artículo</label>
                  <input id="shared-list-item-name" className={inputClass} maxLength={160} value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Agregar artículo" />
                  <label className="sr-only" htmlFor="shared-list-item-quantity">Cantidad</label>
                  <input id="shared-list-item-quantity" className={inputClass} type="number" min="0.01" max="999" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                  <button disabled={busy || !itemName.trim()} className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Agregar</button>
                </form>
                <ul className="mt-5 divide-y divide-stone-200 dark:divide-stone-800">
                  {selectedList.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-3">
                      <input type="checkbox" checked={item.is_checked} onChange={(event) => updateItem(item, { isChecked: event.target.checked })} aria-label={`Marcar ${item.item_name} como ${item.is_checked ? 'pendiente' : 'comprado'}`} className="h-4 w-4 accent-sky-700" />
                      <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${item.is_checked ? 'text-stone-400 line-through' : ''}`}>{item.item_name}</span>
                      <label className="sr-only" htmlFor={`quantity-${item.id}`}>Cantidad de {item.item_name}</label>
                      <input id={`quantity-${item.id}`} type="number" min="0.01" max="999" step="any" defaultValue={item.quantity} onBlur={(event) => { if (Number(event.target.value) !== Number(item.quantity)) updateItem(item, { quantity: event.target.value }) }} className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-right text-sm dark:border-stone-700 dark:bg-stone-950" />
                      <button type="button" onClick={() => removeItem(item.id)} aria-label={`Quitar ${item.item_name}`} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
                {!selectedList.items.length && <p className="py-8 text-center text-sm text-stone-500 dark:text-stone-400">La lista está vacía. Agrega el primer artículo.</p>}
                <div className="mt-5 border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
                  Invitación privada · Código: <span className="select-all font-mono">{selectedList.invite_code}</span>
                  <button type="button" onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selectedList.invite_code)
                      setNotice('Código copiado.')
                      setError('')
                    } catch {
                      setError('No se pudo copiar el código. Selecciónalo y cópialo manualmente.')
                    }
                  }} className="ml-2 inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300"><Copy className="h-3 w-3" /> Copiar código</button>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 dark:bg-stone-800"><Check className="h-6 w-6" /></span>
                <h2 className="mt-3 font-bold">{loading ? 'Cargando listas…' : 'Selecciona o crea una lista'}</h2>
                <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">Invita a otras personas para que puedan agregar, marcar y actualizar artículos junto a ti.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
