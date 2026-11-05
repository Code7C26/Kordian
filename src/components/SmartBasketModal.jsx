import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  X, 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  Store,
  ListPlus,
  Check,
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
  const [sharedListsLoading, setSharedListsLoading] = useState(false)
  const [addingToSharedList, setAddingToSharedList] = useState(false)
  const [sharedListError, setSharedListError] = useState('')
  const [listPickerItem, setListPickerItem] = useState(null)
  const [addedBasketListItems, setAddedBasketListItems] = useState(() => new Set())
  const [pendingBasketDuplicate, setPendingBasketDuplicate] = useState(null)
  const [basketProductsQueue, setBasketProductsQueue] = useState(null)
  const completedSharedListItems = useRef(new Set())
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
        setListPickerItem(null)
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
        setAddedBasketListItems((current) => new Set(current).add(product.basketItemId))
      } catch (error) {
        firstError ||= error.message || 'No se pudieron agregar algunos productos.'
      }
    }

    setBasketProductsQueue(null)
    setPendingBasketDuplicate(null)
    setAddingToSharedList(false)
    setSharedListError(firstError)
    if (!firstError) setListPickerItem(null)
  }

  useEffect(() => {
    if (authLoading || !accessToken || basket.length === 0) {
      setSharedLists([])
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

  const addBasketItemToSharedList = async (listId) => {
    if (!listPickerItem || !listId || !accessToken) return
    setAddingToSharedList(true)
    setSharedListError('')
    try {
      const product = {
        basketItemId: listPickerItem.id,
        productId: listPickerItem.product?.id,
        name: listPickerItem.product?.name || '',
        quantity: Number(listPickerItem.quantity || 0),
      }
      const productKey = `${listId}:${getBasketProductKey(product)}:${product.quantity}`
      if (completedSharedListItems.current.has(productKey)) {
        setAddingToSharedList(false)
        setListPickerItem(null)
        return
      }

      const listResponse = await fetch(apiUrl(`/shared-lists/${encodeURIComponent(listId)}`), {
        headers: { Authorization: 'Bearer ' + accessToken },
      })
      const listPayload = await listResponse.json().catch(() => ({}))
      if (!listResponse.ok) throw new Error(listPayload?.error || 'No se pudo leer la lista compartida.')
      await continueAddingBasketProducts(
        listId,
        [product],
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
        setAddedBasketListItems((current) => new Set(current).add(product.basketItemId))
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
                              <button
                                type="button"
                                onClick={() => {
                                  setSharedListError('')
                                  setListPickerItem(item)
                                }}
                                disabled={addingToSharedList}
                                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:cursor-wait disabled:opacity-60 ${
                                  addedBasketListItems.has(item.id)
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300'
                                }`}
                                title={t('Agregar este producto a una lista compartida')}
                                aria-label={`${t('Agregar este producto a una lista compartida')}: ${displayName}`}
                              >
                                {addedBasketListItems.has(item.id)
                                  ? <Check className="h-4 w-4" aria-hidden="true" />
                                  : <ListPlus className="h-4 w-4" aria-hidden="true" />}
                              </button>
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
      {listPickerItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!addingToSharedList) setListPickerItem(null)
          }}
        >
          <section
            className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="basket-list-picker-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="basket-list-picker-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">
                  {t('Agregar a una lista')}
                </h2>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                  {translateProductName(listPickerItem.product?.name)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setListPickerItem(null)}
                disabled={addingToSharedList}
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 disabled:opacity-50 dark:hover:bg-stone-800"
                aria-label={t('Cerrar aviso')}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            {authLoading || sharedListsLoading ? (
              <p className="text-sm text-stone-500 dark:text-stone-400" role="status">{t('Cargando listas compartidas…')}</p>
            ) : !user ? (
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {t('Inicia sesión para agregar productos a una lista compartida.')} {' '}
                <Link to="/ingresar?next=%2Flistas-compartidas" className="font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                  {t('Iniciar sesión')}
                </Link>
              </p>
            ) : sharedLists.length ? (
              <div className="space-y-2">
                {sharedLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => addBasketItemToSharedList(list.id)}
                    disabled={addingToSharedList}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left text-sm font-semibold text-stone-800 transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:cursor-wait disabled:opacity-60 dark:border-stone-700 dark:text-stone-100 dark:hover:border-sky-800 dark:hover:bg-sky-950/40"
                  >
                    <span className="truncate">{list.name}</span>
                    <ListPlus className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-600 dark:text-stone-300">
                {t('Todavía no tienes listas compartidas.')} {' '}
                <Link to="/listas-compartidas" className="font-bold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                  {t('Crear o unirme a una lista')}
                </Link>
              </p>
            )}
            {addingToSharedList && <p className="text-sm text-stone-500 dark:text-stone-400" role="status">{t('Agregando producto…')}</p>}
            {sharedListError && <p className="text-sm text-rose-700 dark:text-rose-300" role="alert">{sharedListError}</p>}
          </section>
        </div>
      )}
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
