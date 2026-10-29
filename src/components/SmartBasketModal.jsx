import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  X, 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  Store,
  ListPlus,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatters';
import { ProductImage } from './ProductImage';
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx';
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx';
import { apiUrl } from '../config/api.js';
import { SupermarketLogo } from './SupermarketLogo.jsx'

export function SmartBasketModal({ basket, onClose, onUpdateQuantity, onRemoveItem, onClearBasket }) {
  const { t } = useLanguage();
  const { loading: authLoading, user, accessToken } = useCustomerAuth()
  const [sharedLists, setSharedLists] = useState([])
  const [selectedSharedListId, setSelectedSharedListId] = useState('')
  const [sharedListsLoading, setSharedListsLoading] = useState(false)
  const [addingToSharedList, setAddingToSharedList] = useState(false)
  const [sharedListError, setSharedListError] = useState('')
  const [sharedListNotice, setSharedListNotice] = useState('')
  const [addedBasketSignature, setAddedBasketSignature] = useState('')
  const [pendingBasketDuplicate, setPendingBasketDuplicate] = useState(null)
  const [basketProductsQueue, setBasketProductsQueue] = useState(null)
  const completedSharedListItems = useRef(new Set())
  const selectedBasketProducts = useMemo(() => {
    const productsById = new Map()
    basket.forEach((item) => {
      const productId = item.product?.id
      const key = productId === undefined || productId === null
        ? `name:${String(item.product?.name || '').trim().toLowerCase()}`
        : `id:${productId}`
      const existing = productsById.get(key)
      if (existing) {
        existing.quantity += Number(item.quantity || 0)
      } else {
        productsById.set(key, {
          productId,
          name: item.product?.name || '',
          quantity: Number(item.quantity || 0),
        })
      }
    })
    return [...productsById.values()]
  }, [basket])
  const basketSignature = JSON.stringify(selectedBasketProducts)
  const translateProductName = useProductNameTranslator(basket.map((item) => item.product.name));

  const normalizeListProductName = (name) => String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

  const getBasketProductKey = (product) => product.productId === undefined || product.productId === null
    ? `name:${normalizeListProductName(product.name)}`
    : `id:${product.productId}`

  const findExistingListItem = (items, product) => items.find((item) => {
    if (product.productId !== undefined && product.productId !== null
      && item.product_id !== undefined && item.product_id !== null) {
      return String(product.productId) === String(item.product_id)
    }

    return normalizeListProductName(item.product?.name || item.item_name)
      === normalizeListProductName(product.name)
  })

  const postBasketProduct = async (listId, product) => {
    const response = await fetch(apiUrl(`/shared-lists/${encodeURIComponent(listId)}/items`), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        itemName: product.name,
        productId: product.productId === undefined || product.productId === null ? undefined : String(product.productId),
        quantity: product.quantity,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error || 'No se pudieron agregar los productos a la lista.')
    return payload
  }

  const continueAddingBasketProducts = async (listId, products, existingItems, counts) => {
    const currentItems = [...existingItems]
    let addedCount = counts.added || 0
    let mergedCount = counts.merged || 0
    let skippedCount = counts.skipped || 0
    let firstError = counts.error || ''

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index]
      const existingItem = findExistingListItem(currentItems, product)
      if (existingItem) {
        setPendingBasketDuplicate({ product, existingItem })
        setBasketProductsQueue({
          listId,
          remaining: products.slice(index + 1),
          existingItems: currentItems,
          counts: { added: addedCount, merged: mergedCount, skipped: skippedCount, error: firstError },
        })
        return
      }

      try {
        const createdItem = await postBasketProduct(listId, product)
        currentItems.push(createdItem)
        addedCount += 1
        completedSharedListItems.current.add(`${listId}:${getBasketProductKey(product)}:${product.quantity}`)
      } catch (error) {
        firstError ||= error.message || 'No se pudieron agregar algunos productos.'
      }
    }

    const selectedList = sharedLists.find((list) => list.id === listId)
    if (!firstError) setAddedBasketSignature(`${listId}:${basketSignature}`)
    setBasketProductsQueue(null)
    setPendingBasketDuplicate(null)
    setAddingToSharedList(false)
    setSharedListNotice(
      `${t('Proceso de agregar a la lista completado.')}`
      + ` ${addedCount} ${t('productos agregados')}, ${mergedCount} ${t('productos sumados a existentes')} y ${skippedCount} ${t('productos omitidos')}.`
      + (selectedList?.name ? ` ${t('Lista:')} “${selectedList.name}”.` : ''),
    )
    setSharedListError(firstError)
  }

  useEffect(() => {
    if (authLoading || !accessToken || basket.length === 0) {
      setSharedLists([])
      setSelectedSharedListId('')
      setSharedListsLoading(false)
      return undefined
    }

    const controller = new AbortController()
    let active = true
    setSharedListsLoading(true)
    setSharedListError('')
    fetch(apiUrl('/shared-lists'), {
      headers: { Authorization: 'Bearer ' + accessToken },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las listas compartidas.')
        return payload
      })
      .then((lists) => {
        if (!active) return
        const nextLists = Array.isArray(lists) ? lists : []
        setSharedLists(nextLists)
        setSelectedSharedListId((current) => (
          nextLists.some((list) => list.id === current)
            ? current
            : nextLists.length === 1 ? nextLists[0].id : ''
        ))
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return
        console.error('Could not load shared lists for basket', error)
        setSharedListError(error.message || 'No se pudieron cargar las listas compartidas.')
      })
      .finally(() => {
        if (active) setSharedListsLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, authLoading, basket.length])

  const addBasketToSharedList = async () => {
    if (!selectedSharedListId || !accessToken || !selectedBasketProducts.length) return
    setAddingToSharedList(true)
    setSharedListError('')
    setSharedListNotice('')
    try {
      const productsToAdd = selectedBasketProducts.filter((product) => {
        const productKey = getBasketProductKey(product)
        return !completedSharedListItems.current.has(`${selectedSharedListId}:${productKey}:${product.quantity}`)
      })
      if (!productsToAdd.length) {
        const selectedList = sharedLists.find((list) => list.id === selectedSharedListId)
        setAddedBasketSignature(`${selectedSharedListId}:${basketSignature}`)
        setSharedListNotice(`${t('Se agregaron los productos a')} “${selectedList?.name || ''}”.`)
        setAddingToSharedList(false)
        return
      }

      const listResponse = await fetch(apiUrl(`/shared-lists/${encodeURIComponent(selectedSharedListId)}`), {
        headers: { Authorization: 'Bearer ' + accessToken },
      })
      const listPayload = await listResponse.json().catch(() => ({}))
      if (!listResponse.ok) throw new Error(listPayload?.error || 'No se pudo leer la lista compartida.')
      await continueAddingBasketProducts(
        selectedSharedListId,
        productsToAdd,
        Array.isArray(listPayload.items) ? listPayload.items : [],
        { added: 0, merged: 0, skipped: 0, error: '' },
      )
    } catch (error) {
      setSharedListError(error.message || 'No se pudieron agregar los productos a la lista.')
      setAddingToSharedList(false)
    }
  }

  const resolveBasketDuplicate = async (shouldMerge) => {
    if (!pendingBasketDuplicate || !basketProductsQueue) return
    const { product, existingItem } = pendingBasketDuplicate
    const { listId, remaining, existingItems, counts } = basketProductsQueue
    const nextCounts = { ...counts }

    setSharedListError('')
    if (shouldMerge) {
      const combinedQuantity = Number(existingItem.quantity || 0) + Number(product.quantity || 0)
      if (!Number.isFinite(combinedQuantity) || combinedQuantity > 999) {
        setSharedListError(t('La cantidad total no puede superar 999.'))
        return
      }

      setAddingToSharedList(true)
      try {
        const response = await fetch(apiUrl(`/shared-lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(existingItem.id)}`), {
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ quantity: combinedQuantity }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error || 'No se pudo sumar la cantidad al producto existente.')
        const updatedItems = existingItems.map((item) => (
          item.id === existingItem.id ? { ...item, ...payload } : item
        ))
        nextCounts.merged += 1
        completedSharedListItems.current.add(`${listId}:${getBasketProductKey(product)}:${product.quantity}`)
        setPendingBasketDuplicate(null)
        setBasketProductsQueue(null)
        await continueAddingBasketProducts(listId, remaining, updatedItems, nextCounts)
      } catch (error) {
        setSharedListError(error.message || 'No se pudo sumar la cantidad al producto existente.')
        setAddingToSharedList(false)
      }
      return
    }

    nextCounts.skipped += 1
    completedSharedListItems.current.add(`${listId}:${getBasketProductKey(product)}:${product.quantity}`)
    setPendingBasketDuplicate(null)
    setBasketProductsQueue(null)
    await continueAddingBasketProducts(listId, remaining, existingItems, nextCounts)
  }

  if (basket.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in">
        <div className="relative w-full max-w-lg bg-white dark:bg-stone-800 rounded-3xl shadow-2xl p-6 text-center space-y-4 border border-stone-200 dark:border-stone-700">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <div className="w-16 h-16 bg-sky-100 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 rounded-2xl flex items-center justify-center mx-auto">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-stone-900 dark:text-white">{t('Tu Canasta de Compras está vacía')}</h3>
          <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mx-auto">{t('Agrega productos usando el botón "+ Canasta" para comparar cuál supermercado o tienda te ofrece el menor precio total por toda tu compra.')}</p>
          <button onClick={onClose} className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-sm transition-colors cursor-pointer">{t('Explorar Productos')}</button>
        </div>
      </div>
    );
  }

  const basketTotal = basket.reduce((acc, item) => {
    const price = Number(item.selectedOffer?.price || item.product.currentPrice || 0) || 0;
    return acc + price * Number(item.quantity || 0);
  }, 0);

  const worstAlternativeTotal = basket.reduce((acc, item) => {
    const stores = Array.isArray(item.product.otherStores) ? item.product.otherStores : [];
    const worstPrice = stores.reduce((max, store) => {
      const price = Number(store.price || store.cash_price || 0) || 0;
      return max === null || price > max ? price : max;
    }, null);
    const mostExpensive = worstPrice !== null ? worstPrice : Number(item.product.currentPrice || 0);
    return acc + mostExpensive * Number(item.quantity || 0);
  }, 0);

  const totalSavings = Math.max(0, worstAlternativeTotal - basketTotal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-stone-800 rounded-3xl shadow-2xl border border-stone-200 dark:border-stone-700 overflow-hidden my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-stone-200/80 dark:border-stone-700/80 bg-stone-50/50 dark:bg-stone-900/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sky-600 text-white rounded-2xl shadow-md">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-white flex items-center gap-2">
                <span>{t('Mi Canasta Ahorro')}</span>
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">{t('Calculamos automáticamente qué comercio te conviene para comprar la lista entera')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-stone-400 hover:text-stone-600 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-stone-400 uppercase tracking-wider px-1">
              <span>{t('Productos en tu canasta')}</span>
              <button onClick={onClearBasket} className="text-rose-500 hover:underline flex items-center gap-1 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('Vaciar Canasta')}</span>
              </button>
            </div>
              <div className="space-y-4">
              {Object.entries(
                basket.reduce((groups, item) => {
                  const storeName = item.selectedOffer?.supermarket || item.selectedOffer?.storeName || item.product.primaryStore?.name || 'Precio actual';
                  if (!groups[storeName]) {
                    groups[storeName] = {
                      image: item.selectedOffer?.image || item.product.primaryStore?.image || '',
                      items: [],
                    };
                  } else if (!groups[storeName].image) {
                    groups[storeName].image = item.selectedOffer?.image || item.product.primaryStore?.image || '';
                  }
                  groups[storeName].items.push(item);
                  return groups;
                }, {})
              ).map(([storeName, group]) => {
                const { image, items } = group
                const groupTotal = items.reduce((acc, item) => {
                  const price = Number(item.selectedOffer?.price || item.product.currentPrice || 0) || 0;
                  return acc + price * Number(item.quantity || 0);
                }, 0);

                return (
                  <div key={storeName} className="space-y-3">
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-700">
                      <div className="flex min-w-0 items-center gap-3">
                        <SupermarketLogo name={storeName} image={image} className="h-8 max-w-24" />
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {items.length} {t(items.length === 1 ? 'producto' : 'productos')} • {t('Subtotal')}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-stone-900 dark:text-white">{formatCurrency(groupTotal)}</p>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => {
                        const displayName = translateProductName(item.product.name);
                        return (
                          <div key={item.id} className="p-3.5 rounded-2xl bg-stone-50/80 dark:bg-stone-900/60 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <ProductImage src={item.product.image} alt={displayName} productName={displayName} productCategory={item.product.categories?.name || item.product.category?.name || item.product.category || item.product.subcategory} className="w-12 h-12 rounded-xl border border-stone-200 dark:border-stone-700" />
                              <div>
                                <h4 className="font-bold text-stone-900 dark:text-white text-sm line-clamp-1">{displayName}</h4>
                                <p className="text-xs text-stone-500 dark:text-stone-400">
                                  {formatCurrency(item.selectedOffer?.price || item.product.currentPrice)} c/u
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-1">
                                <button onClick={() => onUpdateQuantity(item.id, -1)} className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-stone-600 dark:text-stone-300 cursor-pointer">
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="w-6 text-center font-bold text-xs text-stone-900 dark:text-white">{item.quantity}</span>
                                <button onClick={() => onUpdateQuantity(item.id, 1)} className="p-1 hover:bg-stone-100 dark:hover:bg-stone-700 rounded text-stone-600 dark:text-stone-300 cursor-pointer">
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <button onClick={() => onRemoveItem(item.id)} className="p-1.5 text-stone-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer" title={t('Eliminar de la lista')}>
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <section className="space-y-3 border-t border-stone-200 pt-5 dark:border-stone-700" aria-labelledby="basket-shared-list-heading">
            <h3 id="basket-shared-list-heading" className="flex items-center gap-2 text-sm font-bold text-stone-900 dark:text-white">
              <ListPlus className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              {t('Agregar productos a una lista compartida')}
            </h3>
            {authLoading ? (
              <p className="text-sm text-stone-500 dark:text-stone-400" role="status">{t('Cargando cuenta…')}</p>
            ) : !user ? (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {t('Inicia sesión para agregar productos a una lista compartida.')} {' '}
                <Link to="/ingresar?next=%2Flistas-compartidas" className="font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                  {t('Iniciar sesión')}
                </Link>
              </p>
            ) : sharedListsLoading ? (
              <p className="text-sm text-stone-500 dark:text-stone-400" role="status">{t('Cargando listas compartidas…')}</p>
            ) : sharedLists.length ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="sr-only" htmlFor="basket-shared-list-select">{t('Selecciona una lista compartida')}</label>
                <select
                  id="basket-shared-list-select"
                  value={selectedSharedListId}
                  onChange={(event) => {
                    setSelectedSharedListId(event.target.value)
                    setAddedBasketSignature('')
                    setSharedListNotice('')
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:ring-sky-950"
                  disabled={sharedLists.length === 1}
                >
                  {sharedLists.length > 1 && <option value="">{t('Selecciona una lista compartida')}</option>}
                  {sharedLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={addBasketToSharedList}
                  disabled={!selectedSharedListId || addingToSharedList || addedBasketSignature === `${selectedSharedListId}:${basketSignature}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingToSharedList
                    ? t('Agregando productos…')
                    : addedBasketSignature === `${selectedSharedListId}:${basketSignature}`
                      ? t('Productos agregados')
                      : `${t('Agregar')} ${selectedBasketProducts.length} ${t(selectedBasketProducts.length === 1 ? 'producto a la lista' : 'productos a la lista')}`}
                </button>
              </div>
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                {t('Todavía no tienes listas compartidas.')} {' '}
                <Link to="/listas-compartidas" className="font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                  {t('Crear o unirme a una lista')}
                </Link>
              </p>
            )}
            {sharedListError && <p className="text-sm text-rose-700 dark:text-rose-300" role="alert">{sharedListError}</p>}
            {sharedListNotice && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300" role="status">{sharedListNotice}</p>}
          </section>

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2"><Store className="w-4 h-4 text-sky-600 dark:text-sky-400" /> <span>{t('Comparativa Total de la Canasta')}</span></h3>
            <div className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-900/70 border border-stone-200/80 dark:border-stone-800">
                  <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{t('Total actual de la canasta')}</p>
                  <p className="text-2xl font-black text-stone-900 dark:text-white">{formatCurrency(basketTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-stone-500 dark:text-stone-400">{t('Costo si eliges el peor precio disponible')}</p>
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{formatCurrency(worstAlternativeTotal)}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-emerald-600/10 dark:bg-emerald-900/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{t('Ahorro frente al peor precio')}</p>
                <p className="text-xl font-black text-emerald-900 dark:text-white">{formatCurrency(totalSavings)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      {pendingBasketDuplicate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="basket-duplicate-title"
            aria-describedby="basket-duplicate-description"
          >
            <h2 id="basket-duplicate-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {t('Este producto ya está en la lista')}
            </h2>
            <p id="basket-duplicate-description" className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              {translateProductName(pendingBasketDuplicate.product.name)} · {t('Cantidad actual')}: {pendingBasketDuplicate.existingItem.quantity} + {pendingBasketDuplicate.product.quantity}
            </p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
              {t('¿Querés sumar la cantidad al producto existente o continuar sin agregar este producto?')}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => resolveBasketDuplicate(false)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                {t('No agregar')}
              </button>
              <button
                type="button"
                onClick={() => resolveBasketDuplicate(true)}
                className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800"
              >
                {t('Agregar igual')}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
