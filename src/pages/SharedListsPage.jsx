import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Copy, ListPlus, LoaderCircle, LogOut, Plus, Search, Share2, Trash2, UserPlus, Users, X } from 'lucide-react'
import { useCustomerAuth } from '../contexts/CustomerAuthContext.jsx'
import { apiUrl } from '../config/api.js'
import { useLanguage, useProductNameTranslator } from '../contexts/LanguageContext.jsx'
import BrandHeader from '../components/BrandHeader.jsx'
import { CATALOG_REQUEST_TIMEOUT_MS, fetchCachedCatalogResponse } from '../services/catalogResponseCache.js'
import { isValidCatalogProduct } from '../utils/validCatalogProducts.js'
import { getSearchRelevance, matchesSearchTerms, normalizeSearchText } from '../utils/searchTerms.js'
import { filterProductOffers } from '../utils/productOffers.js'
import { ProductImage } from '../components/ProductImage.jsx'
import { SupermarketLogo } from '../components/SupermarketLogo.jsx'
import { formatCurrency } from '../utils/formatters.js'

const ITEM_SEARCH_LIMIT = 20
const ITEM_SEARCH_MIN_LENGTH = 2
const ITEM_SEARCH_DEBOUNCE_MS = 300

function getProductOffers(product = {}) {
  const offers = Array.isArray(product.offers) ? product.offers : []
  return offers
    .map((offer) => ({
      ...offer,
      price: Number(offer.cash_price ?? offer.cashPrice ?? offer.price ?? offer.currentPrice ?? offer.current_price),
      supermarket: offer.supermarket
        || offer.supermarket_name
        || offer.storeName
        || offer.store_name
        || offer.store?.name
        || '',
    }))
    .filter((offer) => Number.isFinite(offer.price) && offer.price > 0)
    .sort((left, right) => left.price - right.price)
}

function getProductPrice(product = {}) {
  const directPrice = Number(
    product.currentPrice
    ?? product.current_price
    ?? product.price
    ?? product.cash_price
    ?? product.cashPrice,
  )
  if (Number.isFinite(directPrice) && directPrice > 0) return directPrice
  return getProductOffers(product)[0]?.price || 0
}

function getProductSupermarket(product = {}, price = getProductPrice(product)) {
  const directSupermarket = product.supermarket
    || product.supermarket_name
    || product.storeName
    || product.store_name
    || product.primaryStore?.name
    || product.store?.name
  if (directSupermarket) return directSupermarket

  const offers = getProductOffers(product)
  return offers.find((offer) => offer.price === price)?.supermarket
    || offers.find((offer) => offer.supermarket)?.supermarket
    || ''
}

function getProductImage(product = {}) {
  return product.image
    || product.image_url
    || product.imageUrl
    || product.product_image
    || product.thumbnail
    || ''
}

function normalizeCatalogProducts(products) {
  return products
    .map((product) => {
      const currentPrice = getProductPrice(product)
      return { ...product, currentPrice }
    })
    .filter((product) => (
      isValidCatalogProduct(product)
      && Number.isFinite(product.currentPrice)
      && product.currentPrice > 0
    ))
}

function normalizeCatalogLookupText(value) {
    return normalizeSearchText(value)
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
}

function getMatchingListItem(items, productId, itemName) {
    const normalizedName = normalizeCatalogLookupText(itemName)
    return items.find((item) => {
      if (productId && item.product_id) {
        return String(productId) === String(item.product_id)
      }
      return normalizeCatalogLookupText(item.product?.name || item.item_name) === normalizedName
    }) || null
}

export default function SharedListsPage() {
  const { language, t } = useLanguage()
  const { loading: authLoading, user, accessToken } = useCustomerAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteFromUrl = searchParams.get('invite') || ''
  const requestedListId = searchParams.get('list') || ''
  const handledInvite = useRef('')
  const [lists, setLists] = useState([])
  const [selectedListId, setSelectedListId] = useState('')
  const [selectedList, setSelectedList] = useState(null)
  const [newListName, setNewListName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteUsers, setInviteUsers] = useState([])
  const [inviteUsersError, setInviteUsersError] = useState('')
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [itemName, setItemName] = useState('')
  const [duplicateItem, setDuplicateItem] = useState(null)
  const [pendingMembershipAction, setPendingMembershipAction] = useState(null)
  const [itemSuggestions, setItemSuggestions] = useState([])
  const [selectedItemProduct, setSelectedItemProduct] = useState(null)
  const [itemSearchLoading, setItemSearchLoading] = useState(false)
  const [itemSearchError, setItemSearchError] = useState('')
  const [itemMenuOpen, setItemMenuOpen] = useState(false)
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const itemSearchRef = useRef(null)
  const itemOptionRefs = useRef([])
  const [catalogProductsByItemId, setCatalogProductsByItemId] = useState({})
  const [catalogLookupFailures, setCatalogLookupFailures] = useState({})
  const [catalogLookupRetryKey, setCatalogLookupRetryKey] = useState(0)
  const requestedItemLookups = useRef(new Set())
  const itemLookupKey = JSON.stringify((selectedList?.items || []).map((item) => ({
    id: item.id,
    productId: item.product_id,
    productName: item.product?.name || '',
    itemName: item.item_name,
    hasImage: Boolean(getProductImage(item.product || {})),
    hasCurrentPrice: getProductPrice(item.product || {}) > 0,
    hasSupermarket: Boolean(getProductSupermarket(item.product || {})),
    hasSupermarketImage: Boolean(item.product?.supermarketImage),
  })))
  const translateProductName = useProductNameTranslator([
    ...(selectedList?.items || []).map((item) => catalogProductsByItemId[item.id]?.name || item.product?.name || item.item_name),
    ...itemSuggestions.map((product) => product.name),
  ])
  const itemCurrency = new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })

  useEffect(() => {
    const itemsNeedingCatalogData = JSON.parse(itemLookupKey)
      .filter((item) => (
        !item.hasImage
        || !item.hasCurrentPrice
        || !item.hasSupermarket
        || !item.hasSupermarketImage
      ))
    if (!selectedList?.id || !itemsNeedingCatalogData.length) return undefined

    const controller = new AbortController()
    let active = true
    const fetchCatalogDetails = async () => {
      const supermarketsPromise = fetchCachedCatalogResponse(apiUrl('/supermarkets'), {
        signal: controller.signal,
        ttlMs: 300_000,
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Could not load supermarkets for shared-list items', error)
        }
        return []
      })
      const itemLookups = itemsNeedingCatalogData.map((item) => async () => {
        const lookupKey = `${selectedList.id}:${item.id}:${item.productId || ''}:${item.itemName}`
        if (requestedItemLookups.current.has(lookupKey)) return null
        requestedItemLookups.current.add(lookupKey)

        const query = item.productName || item.itemName
        const params = new URLSearchParams({
          page: '1',
          limit: String(ITEM_SEARCH_LIMIT),
          search: query,
          catalogOnly: 'false',
        })
        try {
          let matchedProduct = null
          let lookupError = null
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (attempt > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, attempt * 400))
              if (controller.signal.aborted) return null
            }

            try {
              const payload = await fetchCachedCatalogResponse(
                apiUrl(`/products?${params.toString()}`),
                { signal: controller.signal, timeoutMs: CATALOG_REQUEST_TIMEOUT_MS },
              )
              const results = Array.isArray(payload) ? payload : payload?.data || []
              const candidates = normalizeCatalogProducts(results)
              matchedProduct = (item.productId
                ? candidates.find((product) => String(product.id) === String(item.productId))
                : null) || candidates
                .filter((product) => matchesSearchTerms(
                  normalizeCatalogLookupText(product.name),
                  normalizeCatalogLookupText(query),
                ))
                .sort((left, right) => (
                  getSearchRelevance(left.name, query) - getSearchRelevance(right.name, query)
                  || normalizeSearchText(left.name).localeCompare(normalizeSearchText(right.name))
                ))[0]
              if (!matchedProduct) {
                lookupError = new Error('No se encontró el producto en el catálogo.')
                break
              }
              lookupError = null
              break
            } catch (error) {
              if (error.name === 'AbortError') return null
              lookupError = error
            }
          }
          if (!matchedProduct) {
            requestedItemLookups.current.delete(lookupKey)
            if (lookupError) {
              console.error(`Could not resolve shared-list item "${item.itemName}" from the catalog`, lookupError)
            }
            return { itemId: item.id, error: lookupError }
          }
          return { itemId: item.id, product: matchedProduct }
        } catch (error) {
          requestedItemLookups.current.delete(lookupKey)
          if (error.name !== 'AbortError') {
            console.error(`Could not resolve shared-list item "${item.itemName}" from the catalog`, error)
          }
          return null
        }
      })
      const applyCatalogResult = async (detail) => {
        if (!active || !detail) return
        setCatalogLookupFailures((current) => {
          const next = { ...current }
          if (detail.product) delete next[detail.itemId]
          else next[detail.itemId] = true
          return next
        })
        if (!detail.product) return

        const { itemId, product } = detail
        const offers = getProductOffers(product)
          .filter((offer) => filterProductOffers(product, [offer]).length > 0 && offer.supermarket)
          .sort((left, right) => left.price - right.price)
        const primaryOffer = offers[0]
        const currentPrice = getProductPrice(product) || primaryOffer?.price || 0
        const priceOffer = offers.find((offer) => offer.price === currentPrice) || primaryOffer
        const supermarket = getProductSupermarket(product, currentPrice) || priceOffer?.supermarket || ''
        const productDetails = {
          id: product.id,
          name: product.name,
          image: getProductImage(product),
          currentPrice,
          supermarket,
          supermarketImage: product.supermarketImage || '',
        }
        setCatalogProductsByItemId((current) => ({ ...current, [itemId]: productDetails }))

        if (!supermarket || productDetails.supermarketImage) return
        const supermarkets = await supermarketsPromise
        if (!active) return
        const supermarketImage = (Array.isArray(supermarkets) ? supermarkets : [])
          .find((entry) => normalizeSearchText(entry.name) === normalizeSearchText(supermarket))
          ?.image || ''
        if (supermarketImage) {
          setCatalogProductsByItemId((current) => ({
            ...current,
            [itemId]: { ...current[itemId], supermarketImage },
          }))
        }
      }

      for (let index = 0; index < itemLookups.length; index += 2) {
        if (controller.signal.aborted) return
        await Promise.all(itemLookups
          .slice(index, index + 2)
          .map(async (lookup) => applyCatalogResult(await lookup())))
      }
    }

    fetchCatalogDetails()
    return () => {
      active = false
      controller.abort()
    }
  }, [itemLookupKey, selectedList?.id, catalogLookupRetryKey])

  useEffect(() => {
    const query = itemName.trim()
    setItemSuggestions([])
    setItemMenuOpen(false)
    setHighlightedItemIndex(0)
    setItemSearchError('')

    if (query.length < ITEM_SEARCH_MIN_LENGTH || selectedItemProduct?.name === query) {
      setItemSearchLoading(false)
      return undefined
    }

    const controller = new AbortController()
    let active = true
    setItemSearchLoading(true)
    const debounceId = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          page: '1',
          limit: String(ITEM_SEARCH_LIMIT),
          search: query,
          catalogOnly: 'true',
        })
        const payload = await fetchCachedCatalogResponse(
          apiUrl(`/products?${params.toString()}`),
          { signal: controller.signal, timeoutMs: CATALOG_REQUEST_TIMEOUT_MS },
        )
        if (!active) return

        const results = Array.isArray(payload) ? payload : payload?.data || []
        const matches = normalizeCatalogProducts(results).sort((left, right) => (
          getSearchRelevance(left.name, query) - getSearchRelevance(right.name, query)
        ))
        setItemSuggestions(matches)
        setItemMenuOpen(matches.length > 0)
      } catch (searchError) {
        if (!active || searchError.name === 'AbortError') return
        console.error('Error searching products for shared shopping list', searchError)
        setItemSearchError(searchError.name === 'TimeoutError'
          ? 'La búsqueda tardó demasiado. Intenta nuevamente.'
          : searchError instanceof TypeError
            ? 'No se pudo conectar con el catálogo. Verifica que el servidor esté activo.'
            : 'No se pudieron buscar productos. Intenta nuevamente.')
      } finally {
        if (active) setItemSearchLoading(false)
      }
    }, ITEM_SEARCH_DEBOUNCE_MS)

    return () => {
      active = false
      window.clearTimeout(debounceId)
      controller.abort()
    }
  }, [itemName, selectedItemProduct])

  useEffect(() => {
    if (!itemMenuOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!itemSearchRef.current?.contains(event.target)) setItemMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [itemMenuOpen])

  useEffect(() => {
    itemOptionRefs.current[highlightedItemIndex]?.scrollIntoView({ block: 'nearest' })
  }, [highlightedItemIndex, itemMenuOpen])

  useEffect(() => {
    setLists([])
    setSelectedListId('')
    setSelectedList(null)
    setError('')
    setNotice('')
  }, [user?.id])

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
    if (!response.ok) {
      const errorMessage = response.status === 404 && path === '/customer/users'
        ? 'El servidor no tiene habilitada la búsqueda de clientes. Despliega la actualización del backend para poder invitar usuarios.'
        : payload?.error || 'No se pudo completar la operación.'
      throw new Error(errorMessage)
    }
    return payload
  }, [accessToken])

  useEffect(() => {
    if (!inviteOpen) {
      setInviteUsers([])
      setInviteUsersError('')
      setSearchingUsers(false)
      return undefined
    }

    let active = true
    setInviteUsers([])
    setInviteUsersError('')
    setSearchingUsers(true)
    setError('')
    const timer = window.setTimeout(() => {
      request('/customer/users')
        .then((users) => {
          if (active) setInviteUsers(users)
        })
        .catch((searchError) => {
          if (active) {
            setInviteUsers([])
            setInviteUsersError(searchError.message)
          }
        })
        .finally(() => {
          if (active) setSearchingUsers(false)
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [inviteOpen, request])

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
        setSelectedListId((current) => (
          data.some((list) => list.id === requestedListId)
            ? requestedListId
            : current || data[0]?.id || ''
        ))
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
  }, [accessToken, authLoading, requestedListId, request])

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
    return <main className="flex min-h-screen items-center justify-center text-stone-600 dark:bg-stone-950 dark:text-stone-300" role="status">{t('Cargando sesión…')}</main>
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
      setNotice(`${t('Se creó')} “${list.name}”.`)
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
      setNotice(`${t('Te uniste a')} “${list.name}”.`)
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
      const currentList = await request(`/shared-lists/${encodeURIComponent(selectedListId)}`)
      setSelectedList(currentList)
      const existingItem = getMatchingListItem(
        currentList.items || [],
        selectedItemProduct?.id,
        selectedItemProduct?.name || itemName.trim(),
      )
      if (existingItem) {
        setDuplicateItem(existingItem)
        return
      }

      await request(`/shared-lists/${encodeURIComponent(selectedListId)}/items`, {
        method: 'POST',
        body: JSON.stringify({
          itemName,
          quantity,
          productId: selectedItemProduct?.id ? String(selectedItemProduct.id) : undefined,
        }),
      })
      setItemName('')
      setSelectedItemProduct(null)
      setDuplicateItem(null)
      setItemSuggestions([])
      setItemMenuOpen(false)
      setQuantity(1)
      await loadList(selectedListId)
      await loadLists()
    } catch (addError) {
      setError(addError.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmAddDuplicateItem = async () => {
    if (!duplicateItem || !selectedListId) return
    const combinedQuantity = Number(duplicateItem.quantity) + Number(quantity)
    if (!Number.isFinite(combinedQuantity) || combinedQuantity > 999) {
      setError(t('La cantidad total no puede superar 999.'))
      return
    }

    setBusy(true)
    setError('')
    try {
      await request(`/shared-lists/${encodeURIComponent(selectedListId)}/items/${encodeURIComponent(duplicateItem.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: combinedQuantity }),
      })
      setItemName('')
      setSelectedItemProduct(null)
      setDuplicateItem(null)
      setItemSuggestions([])
      setItemMenuOpen(false)
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

  const deleteList = async (list) => {
    const wasSelected = selectedListId === list.id
    const nextLists = lists.filter((currentList) => currentList.id !== list.id)
    const nextSelectedListId = nextLists[0]?.id || ''

    setLists(nextLists)
    if (wasSelected) {
      setSelectedListId(nextSelectedListId)
      setSelectedList(null)
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(`/shared-lists/${encodeURIComponent(list.id)}`, { method: 'DELETE' })
      setNotice(`${t('Se eliminó')} “${list.name}”.`)
    } catch (deleteError) {
      setLists((currentLists) => currentLists.some((currentList) => currentList.id === list.id)
        ? currentLists
        : [...currentLists, list])
      if (wasSelected) {
        setSelectedListId((currentId) => currentId === nextSelectedListId ? list.id : currentId)
        setSelectedList((currentList) => currentList || selectedList)
      }
      setError(deleteError.message)
    } finally {
      setBusy(false)
    }
  }

  const removeListMember = async (member) => {
    if (!selectedList || member.role === 'owner') return
    setPendingMembershipAction({ type: 'remove-member', member })
  }

  const leaveList = () => {
    if (!selectedList) return
    setPendingMembershipAction({ type: 'leave-list' })
  }

  const confirmMembershipAction = async () => {
    if (!pendingMembershipAction || !selectedList) return
    const action = pendingMembershipAction
    const listId = selectedList.id
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (action.type === 'remove-member') {
        await request(`/shared-lists/${encodeURIComponent(listId)}/members/${encodeURIComponent(action.member.user_id)}`, {
          method: 'DELETE',
        })
        await Promise.all([loadList(listId), loadLists()])
        setNotice(`${t('Se quitó de la lista a')} ${action.member.username}.`)
      } else {
        const result = await request(`/shared-lists/${encodeURIComponent(listId)}/leave`, {
          method: 'POST',
        })
        const remainingLists = await loadLists()
        const nextSelectedListId = remainingLists.some((list) => list.id === selectedListId)
          ? selectedListId
          : remainingLists[0]?.id || ''
        setSelectedListId(nextSelectedListId)
        setSelectedList(null)
        setNotice(result.listDeleted
          ? t('La lista se eliminó porque no quedaban participantes.')
          : result.transferredToUserId
            ? t('Abandonaste la lista y se transfirió la propiedad al participante más antiguo.')
            : t('Abandonaste la lista.'))
      }
    } catch (actionError) {
      setError(actionError.message)
    } finally {
      setBusy(false)
      setPendingMembershipAction(null)
    }
  }

  const shareList = async () => {
    if (!selectedList) return
    const inviteUrl = new URL(`/listas-compartidas?invite=${encodeURIComponent(selectedList.invite_code)}`, window.location.origin).toString()
    try {
      if (navigator.share) {
        await navigator.share({ title: `${t('Lista compartida:')} ${selectedList.name}`, text: t('Unirse a mi lista de compras de AR-PRICE'), url: inviteUrl })
      } else {
        await navigator.clipboard.writeText(inviteUrl)
      }
      setNotice(t('Enlace privado copiado o compartido. Solo pueden unirse usuarios con cuenta.'))
      setError('')
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError(t('No se pudo compartir el enlace. Copia el código de invitación manualmente.'))
    }
  }

  const inviteUser = async (inviteUserProfile) => {
    if (!selectedList) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(`/shared-lists/${encodeURIComponent(selectedList.id)}/invitations`, {
        method: 'POST',
        body: JSON.stringify({
          userId: inviteUserProfile.userId,
          username: inviteUserProfile.username,
        }),
      })
      setNotice(`${t('Invitación enviada a')} ${inviteUserProfile.username}.`)
      setInviteSearch('')
      setInviteUsers([])
    } catch (inviteError) {
      setError(inviteError.message)
    } finally {
      setBusy(false)
    }
  }

  const pageClass = 'min-h-screen bg-stone-50 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6'
  const inputClass = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-stone-700 dark:bg-stone-900 dark:focus:ring-sky-950'
  const matchingInviteUsers = inviteUsers.filter((inviteUserProfile) => (
    inviteUserProfile.username.toLowerCase().includes(inviteSearch.trim().toLowerCase())
  ))
  const pricedItemsTotal = (selectedList?.items || []).reduce((total, item) => {
    const unitPrice = getProductPrice(catalogProductsByItemId[item.id] || item.product || {})
    if (unitPrice <= 0) return total
    return total + unitPrice * Number(item.quantity || 0)
  }, 0)
  const itemsWithoutPrice = (selectedList?.items || []).filter((item) => (
    getProductPrice(catalogProductsByItemId[item.id] || item.product || {}) <= 0
  )).length

  return (
    <main className={pageClass}>
      <div className="mx-auto max-w-5xl">
        <BrandHeader>
          <Link to="/buscar" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-sky-700 dark:text-stone-300 dark:hover:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Volver a productos')}
          </Link>
        </BrandHeader>

        <section className="py-7">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><Users className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h1 className="text-2xl font-black sm:text-3xl">{t('Listas compartidas')}</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-stone-600 dark:text-stone-400">{t('Crea una lista, invita a otras personas con un enlace privado y editen juntos los artículos y cantidades. Los cambios se sincronizan automáticamente.')}</p>
        </section>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{t(error)}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</div>}

        <div className="grid gap-6 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)]">
          <aside className="space-y-4">
            <form onSubmit={createList} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <h2 className="font-bold">{t('Crear una lista')}</h2>
              <label className="sr-only" htmlFor="new-shared-list-name">{t('Nombre de la lista')}</label>
              <input id="new-shared-list-name" className={inputClass} maxLength={80} value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder={t('Ej.: Compra del fin de semana')} />
              <button disabled={busy || !newListName.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />} {t('Crear lista')}
              </button>
            </form>

            <form onSubmit={joinList} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <h2 className="font-bold">{t('Unirme con invitación')}</h2>
              <label className="sr-only" htmlFor="shared-list-invite-code">{t('Código de invitación')}</label>
              <input id="shared-list-invite-code" className={inputClass} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder={t('Pega el enlace o código')} />
              <button disabled={busy || !inviteCode.trim()} className="w-full rounded-xl border border-sky-700 px-4 py-2.5 text-sm font-bold text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-950/40">{t('Unirme')}</button>
            </form>

            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <h2 className="mb-3 font-bold">{t('Mis listas')}</h2>
              {loading ? (
                <p className="text-sm text-stone-500">{t('Cargando listas…')}</p>
              ) : lists.length ? (
                <div className="space-y-2">
                  {lists.map((list) => (
                    <div key={list.id} className={`flex items-center gap-1 rounded-xl border px-2 ${list.id === selectedListId ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40' : 'border-stone-200 dark:border-stone-700'}`}>
                      <button type="button" onClick={() => setSelectedListId(list.id)} className="min-w-0 flex-1 py-3 pl-1 text-left">
                        <span className="block truncate text-sm font-bold">{list.name}</span>
                        <span className="mt-1 block text-xs text-stone-500">{t(list.role === 'owner' ? 'Propietario' : 'Compartida')}</span>
                      </button>
                      {list.role === 'owner' && (
                        <button type="button" onClick={() => deleteList(list)} disabled={busy} aria-label={`${t('Eliminar lista')} ${list.name}`} title={t('Eliminar lista')} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-rose-950/40">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('Todavía no tienes listas compartidas.')}</p>
              )}
            </section>
          </aside>

          <section className="min-h-80 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-6">
            {selectedList ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-4 dark:border-stone-800">
                  <div>
                    <h2 className="text-xl font-black">{selectedList.name}</h2>
                    <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{selectedList.memberCount} {t(selectedList.memberCount === 1 ? 'participante' : 'participantes')} · {t('Sincroniza automáticamente')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => {
                      setInviteOpen((open) => !open)
                      setInviteSearch('')
                      setInviteUsers([])
                      setError('')
                    }} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-800">
                      <UserPlus className="h-4 w-4" aria-hidden="true" /> {t('Invitar')}
                    </button>
                    <button type="button" onClick={leaveList} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800">
                      <LogOut className="h-4 w-4" aria-hidden="true" /> {t('Abandonar lista')}
                    </button>
                  </div>
                </div>
                <section className="mt-4 rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60" aria-label={t('Participantes de la lista')}>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t('Participantes')}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(selectedList.members || []).map((member) => (
                      <span key={member.user_id} className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold dark:border-stone-700 dark:bg-stone-900">
                        <Users className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                        {member.username}
                        {member.role === 'owner' && <span className="text-xs font-normal text-stone-500 dark:text-stone-400">· {t('Creador')}</span>}
                        {selectedList.role === 'owner' && member.role !== 'owner' && (
                          <button
                            type="button"
                            onClick={() => removeListMember(member)}
                            disabled={busy}
                            aria-label={`${t('Quitar participante')} ${member.username}`}
                            title={t('Quitar participante')}
                            className="rounded-full p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-rose-950/40"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </section>
                {inviteOpen && (
                  <section className="mt-4 rounded-xl border border-stone-200 p-3 dark:border-stone-700" aria-label={t('Invitar usuarios')}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h3 className="text-sm font-bold">{t('Invitar a usuarios')}</h3>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          {t('Escribí el nombre de usuario con el que se registró la otra persona.')}
                        </p>
                      </div>
                      <button type="button" onClick={() => setInviteOpen(false)} aria-label={t('Cerrar')} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800">
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <label className="sr-only" htmlFor="shared-list-user-search">{t('Busca por nombre de usuario')}</label>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                      <input
                        id="shared-list-user-search"
                        className={`${inputClass} pl-9`}
                        maxLength={32}
                        value={inviteSearch}
                        onChange={(event) => setInviteSearch(event.target.value)}
                        placeholder={t('Busca por nombre de usuario')}
                        autoComplete="off"
                      />
                    </div>
                    {inviteUsersError ? (
                      <p className="mt-3 text-sm text-rose-700 dark:text-rose-300" role="alert">{t(inviteUsersError)}</p>
                    ) : searchingUsers ? (
                      <p className="mt-3 text-sm text-stone-500" role="status">{t('Buscando usuarios…')}</p>
                    ) : matchingInviteUsers.length ? (
                      <ul className="mt-3 max-h-80 divide-y divide-stone-200 overflow-y-auto dark:divide-stone-800">
                        {matchingInviteUsers.map((inviteUserProfile) => (
                          <li key={inviteUserProfile.username} className="flex items-center justify-between gap-3 py-2">
                            <span className="text-sm font-semibold">{inviteUserProfile.username}</span>
                            <button
                              type="button"
                              onClick={() => inviteUser(inviteUserProfile)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
                            >
                              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> {t('Invitar')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
                        {inviteSearch.trim() ? t('No se encontraron usuarios.') : t('No hay otros usuarios registrados.')}
                      </p>
                    )}
                    <button type="button" onClick={shareList} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-sky-700 underline underline-offset-4 dark:text-sky-300">
                      <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> {t('Compartir enlace privado')}
                    </button>
                  </section>
                )}
                <form onSubmit={addItem} className="mt-4 grid grid-cols-[minmax(0,1fr)_88px] gap-2 sm:grid-cols-[minmax(0,1fr)_96px_auto]">
                  <label className="sr-only" htmlFor="shared-list-item-name">{t('Artículo')}</label>
                  <div className="relative min-w-0" ref={itemSearchRef}>
                    <input
                      id="shared-list-item-name"
                      className={inputClass}
                      maxLength={160}
                      value={itemName}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={itemMenuOpen}
                      aria-controls="shared-list-item-suggestions"
                      aria-activedescendant={itemMenuOpen ? `shared-list-item-option-${highlightedItemIndex}` : undefined}
                      onFocus={() => {
                        if (itemSuggestions.length && !selectedItemProduct) setItemMenuOpen(true)
                      }}
                      onChange={(event) => {
                        setItemName(event.target.value)
                        setSelectedItemProduct(null)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' && itemSuggestions.length) {
                          event.preventDefault()
                          setItemMenuOpen(true)
                          setHighlightedItemIndex((index) => Math.min(index + 1, itemSuggestions.length - 1))
                        } else if (event.key === 'ArrowUp' && itemSuggestions.length) {
                          event.preventDefault()
                          setItemMenuOpen(true)
                          setHighlightedItemIndex((index) => Math.max(index - 1, 0))
                        } else if (event.key === 'Enter' && itemMenuOpen && itemSuggestions.length) {
                          event.preventDefault()
                          const product = itemSuggestions[highlightedItemIndex]
                          if (product) {
                            setSelectedItemProduct(product)
                            setItemName(product.name)
                            setItemMenuOpen(false)
                          }
                        } else if (event.key === 'Escape') {
                          setItemMenuOpen(false)
                        }
                      }}
                      placeholder={t('Agregar artículo')}
                      autoComplete="off"
                    />
                    {itemMenuOpen && itemSuggestions.length > 0 && (
                      <ul
                        id="shared-list-item-suggestions"
                        role="listbox"
                        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-700 dark:bg-stone-900"
                      >
                        {itemSuggestions.map((product, index) => (
                          <li
                            key={product.id}
                            id={`shared-list-item-option-${index}`}
                            ref={(element) => { itemOptionRefs.current[index] = element }}
                            role="option"
                            aria-selected={highlightedItemIndex === index}
                            onMouseEnter={() => setHighlightedItemIndex(index)}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItemProduct(product)
                                setItemName(product.name)
                                setItemMenuOpen(false)
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-sky-50 dark:hover:bg-stone-800 ${highlightedItemIndex === index ? 'bg-sky-50 dark:bg-stone-800' : ''}`}
                            >
                              <span className="min-w-0 truncate">{translateProductName(product.name)}</span>
                              <span className="shrink-0 font-bold text-sky-700 dark:text-sky-300">{itemCurrency.format(product.currentPrice)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {itemSearchLoading && (
                      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400" role="status">{t('Buscando productos...')}</p>
                    )}
                    {itemSearchError && (
                      <p className="mt-2 text-xs text-rose-700 dark:text-rose-300" role="alert">{t(itemSearchError)}</p>
                    )}
                    {!itemSearchLoading && !itemSearchError && itemName.trim().length > 0 && itemName.trim().length < ITEM_SEARCH_MIN_LENGTH && (
                      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('Escribe al menos 2 caracteres para buscar productos.')}</p>
                    )}
                    {!itemSearchLoading && !itemSearchError && itemName.trim().length >= ITEM_SEARCH_MIN_LENGTH && itemSuggestions.length === 0 && !selectedItemProduct && (
                      <p className="mt-2 text-xs text-stone-500 dark:text-stone-400" role="status">{t('No se encontraron productos')}</p>
                    )}
                  </div>
                  <label className="sr-only" htmlFor="shared-list-item-quantity">{t('Cantidad')}</label>
                  <input id="shared-list-item-quantity" className={inputClass} type="number" min="0.01" max="999" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                  <button disabled={busy || !itemName.trim()} className="col-span-full inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 sm:col-span-1"><Plus className="h-4 w-4" /> {t('Agregar')}</button>
                </form>
                {duplicateItem && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
                    <section
                      className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900"
                      role="alertdialog"
                      aria-modal="true"
                      aria-labelledby="duplicate-list-item-title"
                      aria-describedby="duplicate-list-item-description"
                    >
                      <h2 id="duplicate-list-item-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">
                        {t('Este producto ya está en la lista')}
                      </h2>
                      <p id="duplicate-list-item-description" className="mt-2 text-sm text-stone-600 dark:text-stone-300">
                        {t('¿Querés sumar la cantidad al producto que ya existe o cancelar?')}
                      </p>
                      <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-800 dark:bg-stone-800 dark:text-stone-100">
                        {translateProductName(duplicateItem.product?.name || duplicateItem.item_name)}
                        {' · '}
                        {t('Cantidad actual')}: {duplicateItem.quantity}
                        {' + '}
                        {quantity}
                      </p>
                      <div className="mt-5 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setDuplicateItem(null)
                            setItemName('')
                            setSelectedItemProduct(null)
                            setItemSuggestions([])
                            setItemMenuOpen(false)
                            setQuantity(1)
                          }}
                          className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                        >
                          {t('No agregar')}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={confirmAddDuplicateItem}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {busy ? t('Guardando…') : t('Agregar igual')}
                        </button>
                      </div>
                    </section>
                  </div>
                )}
                <ul className="mt-5 divide-y divide-stone-200 dark:divide-stone-800">
                  {selectedList.items.map((item) => {
                    const product = catalogProductsByItemId[item.id] || item.product
                    const productOffers = getProductOffers(product || {})
                      .filter((offer) => filterProductOffers(product || {}, [offer]).length > 0 && offer.supermarket)
                      .sort((left, right) => left.price - right.price)
                    const currentPrice = getProductPrice(product || {})
                    const priceOffer = productOffers.find((offer) => offer.price === currentPrice) || productOffers[0]
                    const supermarketName = getProductSupermarket(product || {}, currentPrice) || priceOffer?.supermarket
                    const productImage = getProductImage(product || {})
                    const catalogLookupKey = `${selectedList.id}:${item.id}:${item.product_id || ''}:${item.item_name}`
                    const addedByUsername = item.added_by_username
                      || selectedList.members?.find((member) => String(member.user_id) === String(item.added_by))?.username
                    return (
                    <li key={item.id} className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 py-4 sm:flex sm:flex-row sm:items-center">
                      <input type="checkbox" checked={item.is_checked} onChange={(event) => updateItem(item, { isChecked: event.target.checked })} aria-label={`${t('Marcar')} ${item.item_name} ${t('como')} ${t(item.is_checked ? 'pendiente' : 'comprado')}`} className="h-4 w-4 accent-sky-700" />
                      <ProductImage
                        src={productImage}
                        alt={item.item_name}
                        productName={product?.name || item.item_name}
                        className="h-14 w-14 shrink-0 rounded-xl border border-stone-200 bg-white p-1 dark:border-stone-700 dark:bg-stone-900"
                      />
                      <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
                        <p className={`min-w-0 break-words text-sm font-bold sm:truncate ${item.is_checked ? 'text-stone-400 line-through' : ''}`}>{translateProductName(product?.name || item.item_name)}</p>
                        <div className="col-span-full grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
                          <div className="min-w-0">
                            <span className="block font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t('Precio unitario')}</span>
                            <span className="mt-0.5 block font-bold text-stone-800 dark:text-stone-100">
                              {currentPrice > 0 ? formatCurrency(currentPrice) : t('Precio no disponible')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t('Supermercado')}</span>
                            {supermarketName ? (
                              <span className="mt-0.5 inline-flex min-w-0 flex-wrap items-center gap-1.5 font-medium text-stone-700 dark:text-stone-200">
                                <SupermarketLogo name={supermarketName} image={product?.supermarketImage || priceOffer?.image} className="h-5 max-w-12" />
                                {supermarketName}
                              </span>
                            ) : (
                              <span className="mt-0.5 block text-stone-500 dark:text-stone-400">{t('Supermercado no disponible')}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="block font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t('Agregado por')}</span>
                            <span className="mt-0.5 block font-medium text-stone-700 dark:text-stone-200">
                              {addedByUsername || t('Usuario')}
                            </span>
                          </div>
                        </div>
                        {catalogLookupFailures[item.id] && (
                          <button
                            type="button"
                            onClick={() => {
                              requestedItemLookups.current.delete(catalogLookupKey)
                              setCatalogLookupFailures((current) => {
                                const next = { ...current }
                                delete next[item.id]
                                return next
                              })
                              setCatalogLookupRetryKey((current) => current + 1)
                            }}
                            className="col-span-full mt-2 text-xs font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
                          >
                            {t('No se pudieron cargar los datos. Reintentar')}
                          </button>
                        )}
                      </div>
                      <div className="col-span-full flex w-full items-center justify-end gap-3 border-t border-stone-100 pt-2 dark:border-stone-800 sm:col-span-1 sm:w-auto sm:shrink-0 sm:justify-normal sm:border-0 sm:pt-0">
                        <label className="sr-only" htmlFor={`quantity-${item.id}`}>{t('Cantidad de')} {item.item_name}</label>
                        <div className="text-right">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t('Total')}</span>
                          <span className="text-sm font-bold">
                            {currentPrice > 0
                              ? formatCurrency(currentPrice * Number(item.quantity || 0))
                              : '—'}
                          </span>
                        </div>
                        <input id={`quantity-${item.id}`} type="number" min="0.01" max="999" step="any" defaultValue={item.quantity} onBlur={(event) => { if (Number(event.target.value) !== Number(item.quantity)) updateItem(item, { quantity: event.target.value }) }} className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-right text-sm dark:border-stone-700 dark:bg-stone-950" />
                        <button type="button" onClick={() => removeItem(item.id)} aria-label={`${t('Quitar')} ${item.item_name}`} className="rounded-lg p-2 text-stone-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  )})}
                </ul>
                {!selectedList.items.length && <p className="py-8 text-center text-sm text-stone-500 dark:text-stone-400">{t('La lista está vacía. Agrega el primer artículo.')}</p>}
                {selectedList.items.length > 0 && (
                  <section className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/30" aria-label={t('Total de la lista')}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t(itemsWithoutPrice > 0 ? 'Total del precio de los productos con precio' : 'Total del precio de los productos')}</p>
                      {itemsWithoutPrice > 0 && (
                        <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                          {t('Hay artículos sin precio del catálogo.')}
                        </p>
                      )}
                    </div>
                    <p className="text-xl font-black text-stone-900 dark:text-stone-100">{formatCurrency(pricedItemsTotal)}</p>
                  </section>
                )}
                <div className="mt-5 border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
                  {t('Invitación privada · Código:')} <span className="select-all font-mono">{selectedList.invite_code}</span>
                  <button type="button" onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selectedList.invite_code)
                      setNotice(t('Código copiado.'))
                      setError('')
                    } catch {
                      setError(t('No se pudo copiar el código. Selecciónalo y cópialo manualmente.'))
                    }
                  }} className="ml-2 inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300"><Copy className="h-3 w-3" /> {t('Copiar código')}</button>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100 text-stone-500 dark:bg-stone-800"><Check className="h-6 w-6" /></span>
                <h2 className="mt-3 font-bold">{t(loading ? 'Cargando listas…' : 'Selecciona o crea una lista')}</h2>
                <p className="mt-1 max-w-sm text-sm text-stone-500 dark:text-stone-400">{t('Invita a otras personas para que puedan agregar, marcar y actualizar artículos junto a ti.')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
      {pendingMembershipAction && selectedList && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setPendingMembershipAction(null)
          }}
        >
          <section
            className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="membership-action-title"
            aria-describedby="membership-action-description"
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="membership-action-title" className="text-lg font-bold text-stone-900 dark:text-stone-100">
                    {t(pendingMembershipAction.type === 'remove-member' ? 'Quitar participante' : 'Abandonar lista')}
                  </h2>
                  <p id="membership-action-description" className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
                    {pendingMembershipAction.type === 'remove-member'
                      ? t('El participante dejará de tener acceso a esta lista.')
                      : selectedList.role === 'owner'
                        ? t('Al abandonar, la propiedad pasará al participante más antiguo. Si eres el único, la lista se eliminará.')
                        : t('Al abandonar, dejarás de tener acceso a los artículos y cambios de esta lista.')}
                  </p>
                  {pendingMembershipAction.type === 'remove-member' && (
                    <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-800 dark:bg-stone-800 dark:text-stone-100">
                      {pendingMembershipAction.member.username}
                    </p>
                  )}
                  {pendingMembershipAction.type === 'leave-list' && selectedList.role === 'owner' && selectedList.members?.length === 1 && (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      {t('Como eres el único participante, la lista se eliminará para todos.')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPendingMembershipAction(null)}
                  disabled={busy}
                  aria-label={t('Cerrar')}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50 px-6 py-4 dark:border-stone-800 dark:bg-stone-950/50 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingMembershipAction(null)}
                disabled={busy}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                {t('Cancelar')}
              </button>
              <button
                type="button"
                onClick={confirmMembershipAction}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? t('Procesando…') : t(pendingMembershipAction.type === 'remove-member' ? 'Quitar participante' : 'Abandonar lista')}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
