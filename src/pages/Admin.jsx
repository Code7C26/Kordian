
import { useEffect, useState } from 'react'
import { Header } from '../components/Header.jsx'
import ProductForm from '../components/ProductForm.jsx'
import CategoryBrandForm from '../components/CategoryBrandForm.jsx'
import CsvUploader from '../components/CsvUploader.jsx'
import Toast from '../components/Toast.jsx'
<<<<<<< HEAD
import { ChevronLeft, ChevronRight, Eye, FolderTree, GitMerge, History, Package, Pencil, RefreshCw, RotateCcw, Trash2, Users, Zap } from 'lucide-react'
import { adminFetch, apiFetch, readApiResponse } from '../config/api.js'
import { formatCurrency } from '../utils/formatters.js'
import { getVisiblePageNumbers } from '../utils/pagination.js'
import { ProductImage } from '../components/ProductImage.jsx'

const ADMIN_PAGES = [
  { id: 'arbol', label: 'Árbol', icon: FolderTree },
  { id: 'acciones', label: 'Acciones', icon: Zap },
  { id: 'producto', label: 'Producto', icon: Package },
  { id: 'registro', label: 'Registro de actualizaciones', icon: History },
  { id: 'vista-previa', label: 'Vista previa', icon: Eye },
  { id: 'agrupacion', label: 'Agrupación', icon: GitMerge },
  { id: 'usuario', label: 'Usuario', icon: Users },
]
=======
import { Pencil, Trash2 } from 'lucide-react'
import { adminFetch, apiUrl } from '../config/api.js'
import { formatCurrency } from '../utils/formatters.js'
import { getVisiblePageNumbers } from '../utils/pagination.js'
import { ProductImage } from '../components/ProductImage.jsx'
>>>>>>> origin/main

export default function Admin() {
  const [activePage, setActivePage] = useState('arbol')

  // theme state to reuse site header dark toggle
  const [darkMode, setDarkMode] = useState(() => {
    return (
      localStorage.getItem('arprice_theme') === 'dark' ||
      (!('arprice_theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('arprice_theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // data state
  const [products, setProducts] = useState([])
  const [admins, setAdmins] = useState([])
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState([])
  const [supermarkets, setSupermarkets] = useState([])
  const [taxonomy, setTaxonomy] = useState([])
  const [priceUpdates, setPriceUpdates] = useState([])
  const [reviewSummary, setReviewSummary] = useState(null)
  const [reviewCandidates, setReviewCandidates] = useState([])
  const [reviewCandidateIndex, setReviewCandidateIndex] = useState(0)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewDecisions, setReviewDecisions] = useState({})
  const [reviewHistory, setReviewHistory] = useState([])
  const [reviewHistorySummary, setReviewHistorySummary] = useState({ total: 0, byStatus: { match: 0, no_match: 0, revisión: 0 }, byAdmin: {} })
  const [discoQuery, setDiscoQuery] = useState('yerba')
  const [discoPreview, setDiscoPreview] = useState([])
  const [discoDiscarded, setDiscoDiscarded] = useState([])
  const [selectedDiscoProducts, setSelectedDiscoProducts] = useState([])
  const [discoLoading, setDiscoLoading] = useState(false)
  const [discoError, setDiscoError] = useState('')
  const [discoSyncStatus, setDiscoSyncStatus] = useState(null)
  const [discoImportStatus, setDiscoImportStatus] = useState(null)
<<<<<<< HEAD
  const [mamiQuery, setMamiQuery] = useState('yerba')
  const [mamiPreview, setMamiPreview] = useState([])
  const [mamiDiscarded, setMamiDiscarded] = useState([])
  const [mamiLoading, setMamiLoading] = useState(false)
  const [mamiError, setMamiError] = useState('')
  const [mamiImportSkipped, setMamiImportSkipped] = useState([])
  const [selectedMamiProducts, setSelectedMamiProducts] = useState([])
=======
>>>>>>> origin/main

  const [editingProduct, setEditingProduct] = useState(null)
  const [editingOfferId, setEditingOfferId] = useState(null)
  const [skipPriceChangeRecording, setSkipPriceChangeRecording] = useState(() => localStorage.getItem('arprice_skip_price_change_recording') === 'true')

  const [adminForm, setAdminForm] = useState({ username: '', password: '' })

  const [form, setForm] = useState({
    name: '',
    category_id: '',
    brand_id: '',
    rating: 5,
    image: '',
    supermarket: '',
    cashPrice: '',
    installmentsQuantity: '',
    installmentPrice: '',
    subcategory_id: '',
  })

  const [newCategory, setNewCategory] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newSupermarket, setNewSupermarket] = useState('')
  const [newSupermarketImage, setNewSupermarketImage] = useState('')
  const [newSubcategory, setNewSubcategory] = useState('')
  const [subcategoryCategoryId, setSubcategoryCategoryId] = useState('')
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingBrand, setEditingBrand] = useState(null)
  const [editingSupermarket, setEditingSupermarket] = useState(null)
  const [editingSubcategory, setEditingSubcategory] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [productCategoryFilter, setProductCategoryFilter] = useState('')
  const [productSubcategoryFilter, setProductSubcategoryFilter] = useState('')
  const [productBrandFilter, setProductBrandFilter] = useState('')
  const [productPage, setProductPage] = useState(1)
  const [productPageSize, setProductPageSize] = useState(20)
  const [totalProductCount, setTotalProductCount] = useState(0)

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  const showToast = (message, type = 'success', title) => {
    setToast({ visible: true, message, type, title })
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500)
  }

  const formatLowestPrice = (offers = []) => {
    const values = (offers || [])
      .map((offer) => Number(offer?.cash_price || 0))
      .filter((value) => Number.isFinite(value) && value > 0)

    if (!values.length) return 'Sin precio'
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Math.min(...values))
  }

  // data loaders
  const loadProducts = async (page = productPage) => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(productPageSize) })
      if (productSearch.trim()) params.set('search', productSearch.trim())
      if (productCategoryFilter) params.set('category', productCategoryFilter)
<<<<<<< HEAD
      if (productSubcategoryFilter) params.set('subcategory', productSubcategoryFilter)
      if (productBrandFilter) params.set('brand', productBrandFilter)
      const res = await apiFetch(`/products?${params.toString()}`)
=======
      if (productBrandFilter) params.set('brand', productBrandFilter)
      const res = await fetch(apiUrl(`/products?${params.toString()}`))
>>>>>>> origin/main
      const payload = await res.json()
      const data = Array.isArray(payload) ? payload : payload.data || []
      setProducts(data)
      setTotalProductCount(Array.isArray(payload) ? data.length : Number(payload.total || data.length || 0))
    } catch (error) {
      console.error(error)
    }
  }

  const loadPriceUpdates = async () => {
    try {
      const res = await adminFetch('/admin/price-updates')
      if (!res.ok) return
      setPriceUpdates(await res.json())
    } catch (error) {
      console.error(error)
    }
  }

  const buildReviewPairKey = (leftId, rightId) => `cross_source:${leftId ?? 'mami'}:${rightId ?? 'disco'}`

  const loadReviewDecisions = async () => {
    try {
      const response = await adminFetch('/review/cross-source-decisions')
      if (!response.ok) return
      const data = await response.json()
      const nextMap = {}
      for (const decision of data.decisions || []) {
        nextMap[decision.pairKey] = decision.status
      }
      setReviewDecisions(nextMap)
      setReviewHistory(data.decisions || [])
      setReviewHistorySummary(data.summary || { total: 0, byStatus: { match: 0, no_match: 0, revisión: 0 }, byAdmin: {} })
    } catch (error) {
      console.error('Error loading review decisions', error)
    }
  }

  const persistReviewDecision = async (pairKey, nextStatus, pairData = {}) => {
    try {
      const candidateIndex = reviewCandidates.findIndex((candidate) => {
        const leftId = candidate?.products?.mami?.id ?? null
        const rightId = candidate?.products?.disco?.id ?? null
        return buildReviewPairKey(leftId, rightId) === pairKey
      })
      const payload = {
        pairKey,
        status: nextStatus,
        reasonCodes: pairData.reasonCodes || [],
        confidence: pairData.confidence || 'media',
        evidence: pairData.evidence || {},
        mamiProductId: pairData.mamiProductId || null,
        discoProductId: pairData.discoProductId || null,
      }
      const response = await adminFetch('/review/cross-source-decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await readApiResponse(response, 'No se pudo guardar la decisión de revisión')
      const savedStatus = data.decision?.status || nextStatus
      setReviewDecisions((prev) => ({ ...prev, [pairKey]: savedStatus }))
      if (savedStatus === 'match') {
        setReviewCandidates((prev) => prev.filter((candidate) => {
          const leftId = candidate?.products?.mami?.id ?? null
          const rightId = candidate?.products?.disco?.id ?? null
          return !(leftId === pairData.mamiProductId && rightId === pairData.discoProductId)
        }))
        setReviewCandidateIndex((currentIndex) => {
          if (candidateIndex >= 0 && currentIndex > candidateIndex) return currentIndex - 1
          return Math.min(currentIndex, Math.max(reviewCandidates.length - 2, 0))
        })
      } else {
        setReviewCandidates((prev) => prev.map((candidate) => {
          const leftId = candidate?.products?.mami?.id ?? null
          const rightId = candidate?.products?.disco?.id ?? null
          if (leftId === pairData.mamiProductId && rightId === pairData.discoProductId) {
            return { ...candidate, status: savedStatus, decisionStatus: savedStatus }
          }
          return candidate
        }))
      }
      window.dispatchEvent(new CustomEvent('arprice:review-decision-updated'))
      showToast(`Decisión guardada: ${savedStatus}`, 'success')
      await loadReviewDecisions()
      await loadProducts(productPage)
    } catch (error) {
      console.error('Error persisting review decision', error)
      showToast(error.message || 'No se pudo guardar la decisión', 'error')
    }
  }

  const resetReviewDecisions = async () => {
    if (!window.confirm('¿Reiniciar las decisiones guardadas? Se borrará el historial manual y los pares volverán a su estado sugerido.')) return

    try {
      const response = await adminFetch('/review/cross-source-decisions', { method: 'DELETE' })
      const data = await readApiResponse(response, 'No se pudieron reiniciar las decisiones')
      if (!data.success) return
      setReviewDecisions({})
      showToast('Decisiones reiniciadas', 'success')
      await Promise.all([loadReviewDecisions(), loadCrossSourceReview()])
    } catch (error) {
      console.error('Error resetting review decisions', error)
      showToast(error.message || 'No se pudieron reiniciar las decisiones', 'error')
    }
  }

  const loadCrossSourceReview = async () => {
    setReviewLoading(true)
    setReviewError('')
    try {
      const response = await adminFetch('/analysis/cross-source-matches?source=all')
      const data = await readApiResponse(response, 'No se pudo cargar la revisión de agrupación')
      setReviewSummary(data.summary || null)
      setReviewCandidates(Array.isArray(data.pairs) ? data.pairs : [])
      setReviewCandidateIndex(0)
    } catch (error) {
      setReviewError(error.message || 'No se pudo cargar la revisión de agrupación')
      setReviewSummary(null)
      setReviewCandidates([])
      setReviewCandidateIndex(0)
    } finally {
      setReviewLoading(false)
    }
  }

  const previewDiscoProducts = async () => {
    setDiscoLoading(true)
    setDiscoError('')
    try {
      const response = await adminFetch(`/admin/import/disco/preview?query=${encodeURIComponent(discoQuery)}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar Disco')
      setDiscoPreview(data.products || [])
      setDiscoDiscarded(data.discarded || [])
      setSelectedDiscoProducts([])
    } catch (error) {
      setDiscoError(error.message || 'No se pudo consultar Disco')
    } finally {
      setDiscoLoading(false)
    }
  }

  const previewMamiProducts = async () => {
    setMamiLoading(true)
    setMamiError('')
    try {
      const response = await adminFetch(`/admin/import/mami/preview?query=${encodeURIComponent(mamiQuery)}`)
      const data = await readApiResponse(response, 'No se pudo consultar Mami')
      setMamiPreview(data.products || [])
      setMamiDiscarded(data.discarded || [])
      setSelectedMamiProducts([])
    } catch (error) {
      setMamiError(error.message || 'No se pudo consultar Mami')
      setMamiPreview([])
      setMamiDiscarded([])
    } finally {
      setMamiLoading(false)
    }
  }

  const importSelectedMamiProducts = async () => {
    const selected = mamiPreview.filter((product) => selectedMamiProducts.includes(product.sourceProductId))
    if (!selected.length) {
      showToast('Seleccioná al menos un producto de Mami', 'error')
      return
    }
    setMamiLoading(true)
    try {
      const response = await adminFetch('/admin/import/mami', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selected, query: mamiQuery }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error([result.error, result.detail].filter(Boolean).join(': ') || 'No se pudieron importar los productos de Mami')
      setSelectedMamiProducts([])
      setMamiImportSkipped(result.skipped || [])
      await loadProducts()
      const importedCount = result.imported?.length || 0
      const updatedCount = result.updated?.length || 0
      const unchangedCount = result.unchanged?.length || 0
      const skippedCount = result.skipped?.length || 0
      await loadPriceUpdates()
      showToast(`Mami: ${importedCount} nuevo(s), ${updatedCount} oferta(s) actualizada(s), ${unchangedCount} sin cambios, ${skippedCount} omitido(s).`, importedCount || updatedCount || unchangedCount ? 'success' : 'error')
      await previewMamiProducts()
    } catch (error) {
      showToast(error.message || 'No se pudieron importar los productos de Mami', 'error')
    } finally {
      setMamiLoading(false)
    }
  }

  const selectEligibleMamiProducts = () => {
    const eligible = mamiPreview
      .filter((product) => product.existingProduct || (product.proposedCategory && product.proposedSubcategory))
      .map((product) => product.sourceProductId)
    setSelectedMamiProducts(eligible)
  }

  const importSelectedDiscoProducts = async () => {
    const selected = discoPreview.filter((product) => selectedDiscoProducts.includes(product.sourceProductId) && !product.possibleDuplicate)
    if (!selected.length) {
      showToast('Seleccioná productos válidos sin duplicados', 'error')
      return
    }
    setDiscoLoading(true)
    try {
      const response = await adminFetch('/admin/import/disco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: selected }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error([result.error, result.detail].filter(Boolean).join(': ') || 'No se pudieron importar los productos')
      setDiscoPreview((products) => products.filter((product) => !result.imported.some((entry) => entry.sourceProductId === product.sourceProductId)))
      setSelectedDiscoProducts([])
      await loadProducts()
      const skippedMessage = result.skipped?.length
        ? ` ${result.skipped.length} omitido(s): ${result.skipped.map((entry) => entry.reason).join(', ')}`
        : ''
      showToast(`${result.imported.length} producto(s) importado(s).${skippedMessage}`, result.imported.length ? 'success' : 'error')
    } catch (error) {
      showToast(error.message || 'No se pudieron importar los productos', 'error')
    } finally {
      setDiscoLoading(false)
    }
  }

  const updateDiscoPrices = async () => {
    setDiscoLoading(true)
    try {
      const response = await adminFetch('/admin/import/disco/update-prices', { method: 'POST' })
      const result = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : { error: `El servidor no reconoce la sincronización de Disco (HTTP ${response.status})` }
      if (!response.ok) throw new Error([result.error, result.detail].filter(Boolean).join(': ') || 'No se pudieron actualizar los precios')
      await loadProducts()
      await loadDiscoSyncStatus()
      showToast(`${result.updated} precio(s) actualizado(s), ${result.unchanged} sin cambios${result.unavailable.length ? ` y ${result.unavailable.length} no disponible(s)` : ''}`, result.updated || !result.unavailable.length ? 'success' : 'error')
    } catch (error) {
      showToast(error.message || 'No se pudieron actualizar los precios', 'error')
    } finally {
      setDiscoLoading(false)
    }
  }

  const loadDiscoSyncStatus = async () => {
    try {
      const response = await adminFetch('/admin/import/disco/sync-status')
      if (response.ok) setDiscoSyncStatus(await response.json())
    } catch (error) {
      console.error(error)
    }
  }

  const loadDiscoImportStatus = async () => {
    try {
      const response = await adminFetch('/admin/import/disco/import-status')
      if (response.ok) setDiscoImportStatus(await response.json())
    } catch (error) {
      console.error(error)
    }
  }

  const deletePriceUpdate = async (id) => {
    if (!window.confirm('¿Eliminar este registro y restaurar los precios anteriores?')) return
    try {
      const res = await adminFetch(`/admin/price-updates/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        showToast('No se pudo eliminar el registro', 'error')
        return
      }
      setPriceUpdates((updates) => updates.filter((update) => update.id !== id))
      showToast('Registro eliminado y precios restaurados', 'success')
    } catch (error) {
      console.error(error)
      showToast('Error de red al eliminar el registro', 'error')
    }
  }

  const loadAdmins = async () => {
    try {
      const res = await adminFetch('/admins')
      const data = await res.json()
      setAdmins(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadCategories = async () => {
    try {
      const res = await apiFetch('/categories')
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadBrands = async () => {
    try {
      const res = await apiFetch('/brands')
      const data = await res.json()
      setBrands(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadSupermarkets = async () => {
    try {
      const res = await apiFetch('/supermarkets')
      const data = await res.json()
      setSupermarkets(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadTaxonomy = async () => {
    try {
      const res = await apiFetch('/taxonomy')
      if (!res.ok) throw new Error('Error cargando árbol de categorías')
      setTaxonomy(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadProducts(productPage)
    loadAdmins()
    loadCategories()
    loadBrands()
    loadSupermarkets()
    loadTaxonomy()
    loadPriceUpdates()
    loadDiscoSyncStatus()
    loadDiscoImportStatus()
<<<<<<< HEAD
    loadCrossSourceReview()
    loadReviewDecisions()
  }, [productPage, productPageSize, productSearch, productCategoryFilter, productSubcategoryFilter, productBrandFilter])

  useEffect(() => {
    if (productPage !== 1) setProductPage(1)
  }, [productSearch, productCategoryFilter, productSubcategoryFilter, productBrandFilter])
=======
  }, [productPage, productPageSize, productSearch, productCategoryFilter, productBrandFilter])

  useEffect(() => {
    if (productPage !== 1) setProductPage(1)
  }, [productSearch, productCategoryFilter, productBrandFilter])
>>>>>>> origin/main

  useEffect(() => {
    window.addEventListener('price-updates-changed', loadPriceUpdates)
    return () => window.removeEventListener('price-updates-changed', loadPriceUpdates)
  }, [])

  // CRUD operations
  const resetProductForm = () => {
    setEditingProduct(null)
    setEditingOfferId(null)
    setForm({
      name: '',
      category_id: '',
      brand_id: '',
      rating: 5,
      image: '',
      supermarket: '',
      cashPrice: '',
      installmentsQuantity: '',
      installmentPrice: '',
      subcategory_id: '',
    })
  }

  const createProduct = async () => {
    if (editingProduct) {
      return saveEdit()
    }

    try {
      const res = await adminFetch('/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error creando producto', 'error')
        return
      }
      showToast('Producto creado correctamente', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error de red al crear producto', 'error')
      return
    }

    resetProductForm()
    loadProducts()
  }

  const deleteProduct = async (id) => {
    try {
      const res = await adminFetch(`/products/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error eliminando producto', 'error')
        return
      }
      showToast('Producto eliminado', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error de red al eliminar producto', 'error')
    }
    loadProducts()
  }

  const deleteOffer = async (id) => {
    try {
      const res = await adminFetch(`/offers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error eliminando oferta', 'error')
        return
      }
      showToast('Oferta eliminada', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error de red al eliminar oferta', 'error')
    }
    loadProducts()
  }

  const startEdit = (product, offer = {}) => {
    setEditingProduct(product)
    setEditingOfferId(offer.id || null)
    setForm({
      name: product.name || '',
      category_id: product.category_id || product.categories?.id || '',
      brand_id: product.brand_id || product.brands?.id || '',
      rating: product.rating || 5,
      image: product.image || '',
      supermarket: offer.supermarket || '',
      cashPrice: offer.cash_price || '',
      installmentsQuantity: offer.installments_quantity || '',
      installmentPrice: offer.installment_price || '',
      subcategory_id: product.subcategory_id || '',
    })
  }

  const cancelEdit = () => {
    resetProductForm()
  }

  const saveEdit = async () => {
    if (!editingProduct) return

    try {
      const res = await adminFetch(`/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category_id: form.category_id,
          brand_id: form.brand_id,
          rating: form.rating,
          image: form.image,
          priceHistoryRecorded: !skipPriceChangeRecording && Boolean(editingOfferId || form.cashPrice || form.installmentsQuantity || form.installmentPrice),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error actualizando producto', 'error')
        return
      }

      if (form.subcategory_id) {
        const classificationRes = await adminFetch(`/products/${editingProduct.id}/classification`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subcategory_id: form.subcategory_id, priceHistoryRecorded: !skipPriceChangeRecording && Boolean(editingOfferId || form.cashPrice || form.installmentsQuantity || form.installmentPrice) }),
        })
        if (!classificationRes.ok) {
          const err = await classificationRes.json()
          showToast(err.error || 'Error actualizando clasificación', 'error')
          return
        }
      }

      if (editingOfferId) {
        const offerRes = await adminFetch(`/offers/${editingOfferId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supermarket: form.supermarket,
            cash_price: form.cashPrice,
            installments_quantity: form.installmentsQuantity || null,
            installment_price: form.installmentPrice || null,
            skipPriceChangeRecording,
            skipPriceChangeRecording,
          }),
        })

        if (!offerRes.ok) {
          const err = await offerRes.json()
          showToast(err.error || 'Error actualizando oferta', 'error')
          return
        }

        if (!skipPriceChangeRecording) await loadPriceUpdates()
        showToast('Oferta actualizada', 'success')
      } else if (form.cashPrice || form.installmentsQuantity || form.installmentPrice) {
        const offerRes = await adminFetch('/offers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: editingProduct.id,
            supermarket: form.supermarket,
            cash_price: form.cashPrice,
            installments_quantity: form.installmentsQuantity || null,
            installment_price: form.installmentPrice || null,
          }),
        })

        if (!offerRes.ok) {
          const err = await offerRes.json()
          showToast(err.error || 'Error agregando oferta', 'error')
          return
        }

        showToast('Precio agregado al producto', 'success')
      } else {
        showToast('Producto actualizado', 'success')
      }

      resetProductForm()
    } catch (err) {
      console.error(err)
      showToast('Error de red al actualizar producto', 'error')
    }

    loadProducts()
  }

  const createAdmin = async () => {
    try {
      const res = await adminFetch('/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminForm),
      })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error creando admin', 'error')
        return
      }
      showToast('Administrador creado', 'success')
      setAdminForm({ username: '', password: '' })
      loadAdmins()
    } catch (err) {
      console.error(err)
      showToast('Error de red al crear admin', 'error')
    }
  }

  const createCategory = async () => {
    if (!newCategory) return
    const endpoint = editingCategory ? `/categories/${editingCategory.id}` : '/categories'
    const method = editingCategory ? 'PUT' : 'POST'
    const res = await adminFetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategory }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast(data.error || 'Error guardando categoría', 'error')
      return
    }
    showToast(editingCategory ? 'Categoría actualizada' : 'Categoría creada', 'success')
    setNewCategory('')
    setEditingCategory(null)
    loadCategories()
    loadTaxonomy()
  }

  const createBrand = async () => {
    if (!newBrand) return
    const endpoint = editingBrand ? `/brands/${editingBrand.id}` : '/brands'
    const method = editingBrand ? 'PUT' : 'POST'
    const res = await adminFetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBrand }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast(data.error || 'Error guardando marca', 'error')
      return
    }
    showToast(editingBrand ? 'Marca actualizada' : 'Marca creada', 'success')
    setNewBrand('')
    setEditingBrand(null)
    loadBrands()
  }

  const createSupermarket = async () => {
    if (!newSupermarket.trim()) return
    const endpoint = editingSupermarket ? `/supermarkets/${editingSupermarket.id}` : '/supermarkets'
    const method = editingSupermarket ? 'PUT' : 'POST'
    const res = await adminFetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSupermarket, image: newSupermarketImage }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast(data.error || 'Error guardando supermercado', 'error')
      return
    }
    showToast(editingSupermarket ? 'Supermercado actualizado' : 'Supermercado creado', 'success')
    setNewSupermarket('')
    setNewSupermarketImage('')
    setEditingSupermarket(null)
    loadSupermarkets()
  }

  const createSubcategory = async () => {
    if (!newSubcategory.trim() || !subcategoryCategoryId) return
    const endpoint = editingSubcategory ? `/subcategories/${editingSubcategory.id}` : '/subcategories'
    const method = editingSubcategory ? 'PUT' : 'POST'
    const res = await adminFetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSubcategory, category_id: subcategoryCategoryId }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast(data.error || 'Error guardando subcategoría', 'error')
      return
    }
    showToast(editingSubcategory ? 'Subcategoría actualizada' : 'Subcategoría creada', 'success')
    setNewSubcategory('')
    setSubcategoryCategoryId('')
    setEditingSubcategory(null)
    loadTaxonomy()
  }

  const deleteSubcategory = async (id) => {
    if (!window.confirm('¿Eliminar esta subcategoría? Los productos conservarán su categoría principal.')) return
    const res = await adminFetch(`/subcategories/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      showToast(data.error || 'Error eliminando subcategoría', 'error')
      return
    }
    showToast('Subcategoría eliminada', 'success')
    loadTaxonomy()
  }

  const deleteSupermarket = async (id) => {
    if (!window.confirm('¿Eliminar este supermercado? Las ofertas existentes conservarán su nombre.')) return
    try {
      const res = await adminFetch(`/supermarkets/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error eliminando supermercado', 'error')
        return
      }
      showToast('Supermercado eliminado', 'success')
      loadSupermarkets()
    } catch (err) {
      console.error(err)
      showToast('Error de red al eliminar supermercado', 'error')
    }
  }

  const deleteCategory = async (id) => {
    try {
      const res = await adminFetch(`/categories/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error eliminando categoría', 'error')
        return
      }
      showToast('Categoría eliminada', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error de red al eliminar categoría', 'error')
    }
    loadCategories()
  }

  const deleteBrand = async (id) => {
    try {
      const res = await adminFetch(`/brands/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error eliminando marca', 'error')
        return
      }
      showToast('Marca eliminada', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error de red al eliminar marca', 'error')
    }
    loadBrands()
  }

  const totalPages = Math.max(1, Math.ceil(totalProductCount / productPageSize))
  const visibleProductPages = getVisiblePageNumbers(productPage, totalPages, 1)

  const filteredProducts = products

  const groupedOffersBySupermarket = (offers = []) => {
    const grouped = offers.reduce((acc, offer) => {
      const supermarket = offer.supermarket || 'Sin supermercado'
      acc[supermarket] = acc[supermarket] || []
      acc[supermarket].push(offer)
      return acc
    }, {})

    return Object.fromEntries(
      Object.entries(grouped)
        .map(([supermarket, supermarketOffers]) => [
          supermarket,
          [...supermarketOffers].sort((firstOffer, secondOffer) => Number(secondOffer.cash_price || 0) - Number(firstOffer.cash_price || 0)),
        ])
        .sort(([, firstOffers], [, secondOffers]) => Number(secondOffers[0]?.cash_price || 0) - Number(firstOffers[0]?.cash_price || 0)),
    )
  }

  const manualPriceUpdates = priceUpdates.filter((update) => update.filters?.source !== 'disco_sync')
  const discoPriceUpdates = priceUpdates.filter((update) => update.filters?.source === 'disco_sync')
  const renderPriceUpdates = (updates, emptyMessage, automatic = false) => {
    if (!updates.length) return <p className="rounded-xl bg-stone-50 dark:bg-stone-900 p-4 text-sm text-stone-500 dark:text-stone-400">{emptyMessage}</p>

    const priceChangeByProduct = new Map()
    for (const update of updates) {
      for (const change of Array.isArray(update.changes) ? update.changes : []) {
        const previousPrice = Number(change.previousCashPrice)
        const updatedPrice = Number(change.updatedCashPrice)
        if (!change.productId || previousPrice <= 0 || updatedPrice <= 0) continue
        priceChangeByProduct.set(String(change.productId), ((updatedPrice - previousPrice) / previousPrice) * 100)
      }
    }

    const renderTable = (tableUpdates) => (
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-200 dark:border-stone-700 text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
          <tr><th className="py-3 pr-4">Fecha</th><th className="py-3 pr-4">{automatic ? 'Cambios' : 'Filtros aplicados'}</th><th className="py-3 pr-4">{automatic ? 'Variación' : 'Porcentaje'}</th><th className="py-3 pr-4">Productos</th><th className="py-3 pr-4">Administrador</th><th className="py-3">Acción</th></tr>
        </thead>
        <tbody className="divide-y divide-stone-100 dark:divide-stone-700/70">
          {tableUpdates.map((update) => {
            const categoryName = categories.find((category) => String(category.id) === String(update.filters?.categoryId))?.name
            const brandName = brands.find((brand) => String(brand.id) === String(update.filters?.brandId))?.name
            const appliedFilters = [categoryName ? `Categoría: ${categoryName}` : null, brandName ? `Marca: ${brandName}` : null, update.filters?.supermarket ? `Supermercado: ${update.filters.supermarket}` : null].filter(Boolean)
            const changes = Array.isArray(update.changes) ? update.changes : []
<<<<<<< HEAD
            const changeType = changes[0]?.type
=======
>>>>>>> origin/main
            const affectedProductCount = new Set(changes.map((change) => String(change.productId)).filter(Boolean)).size
            const percentage = changes.length && Number(changes[0].previousCashPrice) > 0
              ? ((Number(changes[0].updatedCashPrice) - Number(changes[0].previousCashPrice)) / Number(changes[0].previousCashPrice)) * 100
              : Number(update.percentage)
<<<<<<< HEAD
            const isProductEdit = changeType === 'product_edit' || changeType === 'classification_edit'
            const isMamiImport = update.filters?.source === 'mami_import'
            const changeLabel = changeType === 'classification_edit' ? 'Clasificación de producto' : changeType === 'product_edit' ? `Producto: ${changes[0]?.productName || update.filters?.productId || 'editado'}` : null
            const linkedPricePercentage = isProductEdit && changes[0]?.priceHistoryRecorded === true
              ? priceChangeByProduct.get(String(changes[0]?.productId || update.filters?.productId))
              : null
            const linkedPriceLabel = Number.isFinite(linkedPricePercentage) ? `Edición (${linkedPricePercentage > 0 ? '+' : ''}${linkedPricePercentage.toFixed(1)}%)` : 'Edición'
            const updateLabel = isProductEdit ? changeLabel : isMamiImport ? `Importación Mami${update.filters?.query ? `: ${update.filters.query}` : ''}` : automatic ? 'Sincronización de precios Disco' : (appliedFilters.length ? appliedFilters.join(' · ') : 'Sin filtros')
            const updateValue = isProductEdit ? linkedPriceLabel : isMamiImport ? 'Importación' : `${percentage > 0 ? '+' : ''}${percentage.toFixed(1)}%`
            return <tr key={update.id} className="text-stone-700 dark:text-stone-200"><td className="py-3 pr-4 whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">{new Date(update.updated_at).toLocaleString('es-AR')}</td><td className="py-3 pr-4 font-semibold">{updateLabel}</td><td className={`py-3 pr-4 font-bold ${isProductEdit ? 'text-sky-600' : isMamiImport ? 'text-emerald-600' : percentage >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{updateValue}</td><td className="py-3 pr-4">{affectedProductCount || update.products_updated || 0}</td><td className="py-3 pr-4 text-xs">{update.admin_username}</td><td className="py-3"><button type="button" onClick={() => deletePriceUpdate(update.id)} className="text-sm font-semibold text-rose-600 hover:underline">Eliminar</button></td></tr>
=======
            return <tr key={update.id} className="text-stone-700 dark:text-stone-200"><td className="py-3 pr-4 whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">{new Date(update.updated_at).toLocaleString('es-AR')}</td><td className="py-3 pr-4 font-semibold">{automatic ? 'Sincronización de precios Disco' : (appliedFilters.length ? appliedFilters.join(' · ') : 'Sin filtros')}</td><td className={`py-3 pr-4 font-bold ${percentage >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{percentage > 0 ? '+' : ''}{percentage.toFixed(1)}%</td><td className="py-3 pr-4">{affectedProductCount || update.products_updated || 0}</td><td className="py-3 pr-4 text-xs">{update.admin_username}</td><td className="py-3"><button type="button" onClick={() => deletePriceUpdate(update.id)} className="text-sm font-semibold text-rose-600 hover:underline">Eliminar</button></td></tr>
>>>>>>> origin/main
          })}
        </tbody>
      </table>
    )

    return (
      <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-700 pr-4" style={{ scrollbarGutter: 'stable both-edges' }} aria-label="Registro completo de actualizaciones">
        {renderTable(updates)}
      </div>
    )
  }

  const reviewStatusCounts = reviewSummary?.statusCounts || {}
  const reviewMatchCount = reviewStatusCounts.match ?? 0
  const reviewRevisionCount = reviewStatusCounts.revisión ?? reviewStatusCounts.revision ?? 0
  const reviewNoMatchCount = reviewStatusCounts.no_match ?? 0
  const visibleReviewIndex = Math.min(reviewCandidateIndex, Math.max(reviewCandidates.length - 1, 0))

  // ===== UI =====
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        selectedCity="Alta Gracia"
        setSelectedCity={() => {}}
        basketCount={0}
        onOpenBasket={() => {}}
        favoritesCount={0}
        onOpenFavorites={() => {}}
        onResetView={() => {}}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">Panel Admin</h1>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400 max-w-2xl">Aquí puedes administrar producto, categorías, marcas y actualizar precios en bloque por categoría.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { localStorage.removeItem('adminAuth'); localStorage.removeItem('adminToken'); localStorage.removeItem('currentAdmin'); window.location.href = '/login' }} className="px-4 py-2 rounded-xl border border-stone-300 dark:border-stone-600 text-sm font-bold hover:bg-stone-100 dark:hover:bg-stone-800">Cerrar sesión</button>
          </div>
        </div>

        <nav className="mt-6 border-b border-emerald-950/30" aria-label="Secciones de administración">
          <div className="flex gap-1 overflow-x-auto rounded-t-xl bg-[#2576b5] px-2 pt-2" role="tablist" aria-label="Páginas del panel admin">
            {ADMIN_PAGES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activePage === id}
                id={`admin-tab-${id}`}
                aria-controls="admin-page-content"
                onClick={() => setActivePage(id)}
                style={activePage === id ? { color: '#ffffff', borderBottomColor: '#ffffff' } : undefined}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors md:min-w-0 md:flex-1 md:shrink md:justify-center md:px-2 md:text-center md:whitespace-normal ${activePage === id ? 'border-white text-white' : 'border-transparent text-white/85 hover:bg-white/10 hover:text-white'}`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                </span>
                {label}
              </button>
            ))}
          </div>
        </nav>

        <div id="admin-page-content" role="tabpanel" aria-labelledby={`admin-tab-${activePage}`}>
        {activePage === 'agrupacion' && (
        <section className="mt-6 bg-white dark:bg-stone-800 rounded-3xl border border-stone-200/80 dark:border-stone-700 p-6 shadow-sm">
          <div>
            <div>
              <h2 className="text-xl font-bold">Revisión de agrupación</h2>
              <p className="mt-1 max-w-3xl text-sm text-stone-500 dark:text-stone-400">Evalúa cada par como Agrupar, No agrupar o Revisión. Las decisiones se guardan en el historial, sin modificar productos ni ofertas.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-y border-stone-200 py-4 dark:border-stone-700 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold">Acciones de revisión</h3>
              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Actualiza los pares o limpia las decisiones manuales.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={loadCrossSourceReview} disabled={reviewLoading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60">
                <RefreshCw className={`h-4 w-4 ${reviewLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                {reviewLoading ? 'Actualizando pares…' : 'Actualizar pares'}
              </button>
              <button type="button" onClick={resetReviewDecisions} disabled={reviewHistory.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reiniciar decisiones
              </button>
            </div>
          </div>

          {reviewError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {reviewError}
            </div>
          )}

          {reviewSummary && (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900">
                <div className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">Pares analizados</div>
                <div className="mt-2 text-2xl font-black">{reviewSummary.pairsCompared ?? 0}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-700/60 dark:bg-emerald-950/20">
                <div className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Match</div>
                <div className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">{reviewMatchCount}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/20">
                <div className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300">Revisión</div>
                <div className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-300">{reviewRevisionCount}</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-700/60 dark:bg-rose-950/20">
                <div className="text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-300">No match</div>
                <div className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-300">{reviewNoMatchCount}</div>
              </div>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-bold">Decisiones guardadas</h3>
              <span className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">{reviewHistorySummary.total || 0} registros</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-700/60 dark:bg-emerald-950/20">
                <div className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Match</div>
                <div className="mt-2 text-xl font-black text-emerald-700 dark:text-emerald-300">{reviewHistorySummary.byStatus?.match ?? 0}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-700/60 dark:bg-amber-950/20">
                <div className="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300">Revisión</div>
                <div className="mt-2 text-xl font-black text-amber-700 dark:text-amber-300">{reviewHistorySummary.byStatus?.revisión ?? 0}</div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-700/60 dark:bg-rose-950/20">
                <div className="text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-300">No match</div>
                <div className="mt-2 text-xl font-black text-rose-700 dark:text-rose-300">{reviewHistorySummary.byStatus?.no_match ?? 0}</div>
              </div>
            </div>
            {Object.keys(reviewHistorySummary.byAdmin || {}).length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">Por administrador</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(reviewHistorySummary.byAdmin).map(([admin, count]) => (
                    <span key={admin} className="inline-flex rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-700 dark:bg-stone-700 dark:text-stone-200">
                      {admin}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {reviewHistory.length > 0 && (
              <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-950">
                <div className="space-y-2 text-sm">
                  {reviewHistory.slice(0, 8).map((decision) => (
                    <div key={decision.pairKey} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-2 py-2 dark:border-stone-700">
                      <div>
                        <div className="font-semibold text-stone-800 dark:text-stone-100">{decision.pairKey}</div>
                        <div className="text-xs text-stone-500 dark:text-stone-400">{decision.admin || 'system'}</div>
                      </div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${decision.status === 'match' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : decision.status === 'no_match' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                        {decision.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-4">
            {reviewCandidates.length > 0 && (
              <nav className="flex items-center justify-center gap-4" aria-label="Navegación de pares de agrupación">
                <button
                  type="button"
                  onClick={() => setReviewCandidateIndex((index) => Math.max(0, index - 1))}
                  disabled={visibleReviewIndex === 0}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-emerald-500"
                  aria-label="Par anterior"
                  title="Par anterior"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <span className="min-w-24 text-center text-sm font-bold text-stone-600 dark:text-stone-300" aria-live="polite">
                  Par {visibleReviewIndex + 1} de {reviewCandidates.length}
                </span>
                <button
                  type="button"
                  onClick={() => setReviewCandidateIndex((index) => Math.min(reviewCandidates.length - 1, index + 1))}
                  disabled={visibleReviewIndex >= reviewCandidates.length - 1}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-emerald-500"
                  aria-label="Par siguiente"
                  title="Par siguiente"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            )}

            {reviewCandidates.length === 0 && !reviewLoading && !reviewError && (
              <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-400">
                No hay candidatos de revisión disponibles en este momento.
              </div>
            )}

            {reviewCandidates.slice(visibleReviewIndex, visibleReviewIndex + 1).map((pair) => {
              const left = pair.products?.mami || null
              const right = pair.products?.disco || null
              const pairKey = buildReviewPairKey(left?.id, right?.id)
              const decision = reviewDecisions[pairKey] || pair.status || 'revisión'
              const statusColor = decision === 'match' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : decision === 'no_match' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'

              return (
                <div key={pairKey} className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-700 dark:bg-stone-900">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusColor}`}>
                        {decision === 'match' ? 'Agrupar' : decision === 'no_match' ? 'No agrupar' : 'Revisión'}
                      </span>
                      <span className="inline-flex rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
                        Confianza: {pair.confidence || 'media'}
                      </span>
                      <span className="inline-flex rounded-full bg-stone-200 px-2.5 py-1 text-xs font-bold text-stone-700 dark:bg-stone-700 dark:text-stone-200">
                        {pair.nameCompatibility || 'unknown'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => persistReviewDecision(pairKey, 'match', { mamiProductId: left?.id, discoProductId: right?.id, confidence: pair.confidence || 'media', reasonCodes: pair.reasonCodes || [], evidence: { matchedAttributes: pair.matchedAttributes, mismatchedAttributes: pair.mismatchedAttributes } })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">Agrupar</button>
                      <button type="button" onClick={() => persistReviewDecision(pairKey, 'no_match', { mamiProductId: left?.id, discoProductId: right?.id, confidence: pair.confidence || 'media', reasonCodes: pair.reasonCodes || [], evidence: { matchedAttributes: pair.matchedAttributes, mismatchedAttributes: pair.mismatchedAttributes } })} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-500">No agrupar</button>
                      <button type="button" onClick={() => persistReviewDecision(pairKey, 'revisión', { mamiProductId: left?.id, discoProductId: right?.id, confidence: pair.confidence || 'media', reasonCodes: pair.reasonCodes || [], evidence: { matchedAttributes: pair.matchedAttributes, mismatchedAttributes: pair.mismatchedAttributes } })} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-400">Revisión</button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <article className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-950">
                      <div className="mb-3 flex items-center gap-3">
                        <ProductImage src={left?.image} alt={left?.name || 'Producto Mami'} productName={left?.name || 'Producto Mami'} productCategory={left?.category || 'Mami'} className="h-16 w-16 rounded-lg" />
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">Mami</div>
                          <h3 className="font-bold text-stone-900 dark:text-white">{left?.name || 'Sin nombre'}</h3>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <p><span className="font-semibold">Marca:</span> {left?.brand || left?.brands?.name || 'Sin marca'}</p>
                        <p><span className="font-semibold">Familia:</span> {left?.attributes?.family || 'Sin familia'}</p>
                        <p><span className="font-semibold">Medida:</span> {left?.attributes?.measure ? `${left.attributes.measure.amount} ${left.attributes.measure.baseUnit}` : 'Sin medida'}</p>
                        <p><span className="font-semibold">Presentación:</span> {left?.attributes?.container || 'Sin presentación'}</p>
                        <p><span className="font-semibold">Sabor:</span> {left?.attributes?.flavor || 'Sin sabor'}</p>
                        <p><span className="font-semibold">GTIN:</span> {left?.validGtin || left?.ean || 'Sin GTIN'}</p>
                        <p><span className="font-semibold">Precio:</span> {formatLowestPrice(left?.offers)}</p>
                      </div>
                    </article>

                    <article className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-950">
                      <div className="mb-3 flex items-center gap-3">
                        <ProductImage src={right?.image} alt={right?.name || 'Producto Disco'} productName={right?.name || 'Producto Disco'} productCategory={right?.category || 'Disco'} className="h-16 w-16 rounded-lg" />
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-stone-400">Disco</div>
                          <h3 className="font-bold text-stone-900 dark:text-white">{right?.name || 'Sin nombre'}</h3>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <p><span className="font-semibold">Marca:</span> {right?.brand || right?.brands?.name || 'Sin marca'}</p>
                        <p><span className="font-semibold">Familia:</span> {right?.attributes?.family || 'Sin familia'}</p>
                        <p><span className="font-semibold">Medida:</span> {right?.attributes?.measure ? `${right.attributes.measure.amount} ${right.attributes.measure.baseUnit}` : 'Sin medida'}</p>
                        <p><span className="font-semibold">Presentación:</span> {right?.attributes?.container || 'Sin presentación'}</p>
                        <p><span className="font-semibold">Sabor:</span> {right?.attributes?.flavor || 'Sin sabor'}</p>
                        <p><span className="font-semibold">GTIN:</span> {right?.validGtin || right?.ean || 'Sin GTIN'}</p>
                        <p><span className="font-semibold">Precio:</span> {formatLowestPrice(right?.offers)}</p>
                      </div>
                    </article>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-950">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Coinciden</h4>
                      <ul className="mt-2 list-disc pl-5 text-sm text-stone-700 dark:text-stone-200">
                        {(pair.matchedAttributes || []).length ? pair.matchedAttributes.map((field) => <li key={field}>{field}</li>) : <li>Sin coincidencias</li>}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-950">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Diferencias</h4>
                      <ul className="mt-2 list-disc pl-5 text-sm text-stone-700 dark:text-stone-200">
                        {(pair.mismatchedAttributes || []).length ? pair.mismatchedAttributes.map((field) => <li key={`${field.field || field}`}>{field.field || field}</li>) : <li>Sin diferencias</li>}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-950">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Razones</h4>
                      <ul className="mt-2 list-disc pl-5 text-sm text-stone-700 dark:text-stone-200">
                        {(pair.reasonCodes || []).length ? pair.reasonCodes.map((reason) => <li key={reason}>{reason}</li>) : <li>Sin motivos</li>}
                      </ul>
                    </div>
                  </div>

                  {pair.priceSignal && (
                    <div className="mt-4 rounded-xl border border-stone-200 bg-white p-3 text-sm dark:border-stone-700 dark:bg-stone-950">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Señal de precio</h4>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <span>Mami: {pair.priceSignal.mamiPrice ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(pair.priceSignal.mamiPrice) : 'n/a'}</span>
                        <span>Disco: {pair.priceSignal.discoPrice ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(pair.priceSignal.discoPrice) : 'n/a'}</span>
                        <span>Diferencia: {pair.priceSignal.differencePercent ?? 'n/a'}%</span>
                        <span>Sospechoso: {pair.priceSignal.suspicious ? 'Sí' : 'No'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
        )}

        {activePage === 'arbol' && (
        <section className="mt-6 bg-white dark:bg-stone-800 rounded-3xl border border-stone-200/80 dark:border-stone-700 p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Árbol de categorías</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {taxonomy.map((category) => (
              <div key={category.id} className="rounded-2xl border border-stone-200 dark:border-stone-700 p-4 bg-stone-50 dark:bg-stone-900">
                <h3 className="font-bold">{category.name} <span className="text-xs font-semibold text-stone-500">({category.productCount || 0} productos)</span></h3>
                {category.subcategories.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {category.subcategories.map((subcategory) => (
                      <li key={subcategory.id}>
                        <div className="font-semibold text-sky-700 dark:text-sky-300">{subcategory.name} <span className="text-xs font-normal text-stone-500">({subcategory.productCount || 0})</span></div>
                        <div className="ml-4 mt-1 text-xs text-stone-500 dark:text-stone-400">
                          <div>Clasificación lógica por subcategoría</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-3 text-sm text-stone-500">Sin subcategorías</p>}
              </div>
            ))}
          </div>
        </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-start">
          {activePage === 'acciones' && (
          <div className="col-span-1 lg:col-span-2">
            <CategoryBrandForm
              newCategory={newCategory}
              setNewCategory={setNewCategory}
              createCategory={createCategory}
              newBrand={newBrand}
              setNewBrand={setNewBrand}
              createBrand={createBrand}
              categories={categories}
              onEditCategory={(category) => { setEditingCategory(category); setNewCategory(category.name) }}
              onDeleteCategory={deleteCategory}
              subcategories={taxonomy.flatMap((category) => category.subcategories.map((subcategory) => ({ ...subcategory, categoryName: category.name })))}
              newSubcategory={newSubcategory}
              setNewSubcategory={setNewSubcategory}
              subcategoryCategoryId={subcategoryCategoryId}
              setSubcategoryCategoryId={setSubcategoryCategoryId}
              createSubcategory={createSubcategory}
              editingSubcategory={editingSubcategory}
              onEditSubcategory={(subcategory) => { setEditingSubcategory(subcategory); setNewSubcategory(subcategory.name); setSubcategoryCategoryId(subcategory.category_id) }}
              onDeleteSubcategory={deleteSubcategory}
              cancelSubcategory={() => { setEditingSubcategory(null); setNewSubcategory(''); setSubcategoryCategoryId('') }}
              brands={brands}
              onEditBrand={(brand) => { setEditingBrand(brand); setNewBrand(brand.name) }}
              onDeleteBrand={deleteBrand}
              supermarkets={supermarkets}
              onEditSupermarket={(supermarket) => { setEditingSupermarket(supermarket); setNewSupermarket(supermarket.name); setNewSupermarketImage(supermarket.image || '') }}
              onDeleteSupermarket={deleteSupermarket}
              newSupermarket={newSupermarket}
              setNewSupermarket={setNewSupermarket}
              newSupermarketImage={newSupermarketImage}
              setNewSupermarketImage={setNewSupermarketImage}
              createSupermarket={createSupermarket}
              editingSupermarket={editingSupermarket}
              cancelSupermarketEdit={() => { setEditingSupermarket(null); setNewSupermarket(''); setNewSupermarketImage('') }}
              editingCategory={editingCategory}
              editingBrand={editingBrand}
            />
          </div>
          )}

          {activePage === 'producto' && (
          <div className="col-span-1 lg:col-span-3">
            <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold mb-4">Filtros rápidos</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                <input
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  placeholder="Buscar producto"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <select
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  value={productCategoryFilter}
                  onChange={(e) => {
                    setProductCategoryFilter(e.target.value)
                    setProductSubcategoryFilter('')
                  }}
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <select
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                  value={productSubcategoryFilter}
                  onChange={(e) => setProductSubcategoryFilter(e.target.value)}
                  disabled={!productCategoryFilter}
                >
                  <option value="">{productCategoryFilter ? 'Todas las subcategorías' : 'Elegí una categoría primero'}</option>
                  {(taxonomy.find((category) => String(category.id) === String(productCategoryFilter))?.subcategories || []).map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                  ))}
                </select>
                <select
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  value={productBrandFilter}
                  onChange={(e) => setProductBrandFilter(e.target.value)}
                >
                  <option value="">Todas las marcas</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          )}

          {activePage === 'acciones' && (
          <div className="col-span-1 lg:col-span-1">
            <CsvUploader onUploaded={() => { loadProducts(); loadPriceUpdates() }} />
          </div>
          )}

          {activePage === 'registro' && (
          <section className="col-span-1 lg:col-span-3 bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold">Registro de actualizaciones rápidas</h2>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Cada aplicación de cambios queda registrada aquí.</p>
              </div>
              <button type="button" onClick={loadPriceUpdates} className="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">Actualizar</button>
            </div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Actualizaciones manuales</h3>
            {renderPriceUpdates(manualPriceUpdates, 'Todavía no hay actualizaciones manuales registradas.')}
            <h3 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Sincronizaciones automáticas de Disco</h3>
            {renderPriceUpdates(discoPriceUpdates, 'Todavía no hay sincronizaciones automáticas registradas.', true)}
          </section>
          )}
        </div>

        {activePage === 'vista-previa' && (
        <div>
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm dark:bg-stone-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Vista previa de Disco</h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Consulta productos externos sin modificar el inventario.</p>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                {discoSyncStatus?.lastSyncAt
                  ? `Última sincronización: ${new Date(discoSyncStatus.lastSyncAt).toLocaleString('es-AR')} · ${discoSyncStatus.changes} cambio(s)`
                  : 'Todavía no hay sincronizaciones automáticas registradas.'}
              </p>
              {discoImportStatus && (
                <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                  Búsquedas públicas: {discoImportStatus.searches} · Importados: {discoImportStatus.totals.imported} · Actualizados: {discoImportStatus.totals.updated} · Descartados: {discoImportStatus.totals.discarded}
                </p>
              )}
            </div>
            <form className="flex w-full gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); previewDiscoProducts() }}>
              <input className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-stone-900 dark:bg-stone-900 dark:text-stone-100" value={discoQuery} onChange={(event) => setDiscoQuery(event.target.value)} placeholder="Buscar en Disco" aria-label="Buscar productos en Disco" />
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500" disabled={discoLoading}>{discoLoading ? 'Consultando...' : 'Consultar'}</button>
            </form>
          </div>
          {discoError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{discoError}</p>}
          {discoDiscarded.length > 0 && (
            <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              <summary className="cursor-pointer font-semibold">{discoDiscarded.length} producto(s) descartado(s) automáticamente</summary>
              <div className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
                {discoDiscarded.map((product, index) => (
                  <p key={`${product.sourceProductId || 'sin-id'}-${index}`}><strong>{product.name || 'Sin nombre'}</strong>: {product.reason}</p>
                ))}
              </div>
            </details>
          )}
          {!discoLoading && !discoError && discoPreview.length === 0 && <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">Consultá una categoría o producto para ver una vista previa.</p>}
          {discoPreview.length > 0 && (
            <>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={updateDiscoPrices} disabled={discoLoading} className="rounded-lg border border-sky-600 px-4 py-2 font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50">Actualizar precios importados</button>
              <button type="button" onClick={importSelectedDiscoProducts} disabled={discoLoading || !selectedDiscoProducts.length} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">Importar seleccionados</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {discoPreview.map((product) => (
                <article key={product.sourceProductId} className={`flex gap-3 rounded-xl border p-3 dark:border-stone-700 ${product.possibleDuplicate ? 'border-amber-300 opacity-70' : 'border-stone-200'}`}>
                  <input type="checkbox" disabled={product.possibleDuplicate} checked={selectedDiscoProducts.includes(product.sourceProductId)} onChange={(event) => setSelectedDiscoProducts((selected) => event.target.checked ? [...selected, product.sourceProductId] : selected.filter((id) => id !== product.sourceProductId))} className="mt-2 h-4 w-4 accent-emerald-600" aria-label={`Seleccionar ${product.name}`} />
                  <ProductImage src={product.image} alt={product.name} productName={product.name} productCategory={product.categories?.name || product.category?.name || product.category} className="h-20 w-20 rounded-lg bg-stone-100 dark:bg-stone-900" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-stone-900 dark:text-white">{product.name}</h3>
                    <p className="text-sm text-stone-500 dark:text-stone-400">{product.brand || 'Marca no informada'} · {product.available ? 'Disponible' : 'Sin stock'}</p>
                    <p className="mt-1 font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(product.price)}</p>
                    <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{product.proposedCategory && product.proposedSubcategory ? `${product.proposedCategory} > ${product.proposedSubcategory}` : 'Mapeo pendiente'}</p>
                    {product.possibleDuplicate && <span className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Posible duplicado</span>}
                  </div>
                </article>
              ))}
            </div>
            </>
          )}
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm dark:bg-stone-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">Vista previa de Mami</h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Consulta productos externos, revisa sus ofertas y selecciona cuáles importar.</p>
            </div>
            <form className="flex w-full gap-2 sm:w-auto" onSubmit={(event) => { event.preventDefault(); previewMamiProducts() }}>
              <input className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-stone-900 dark:bg-stone-900 dark:text-stone-100" value={mamiQuery} onChange={(event) => setMamiQuery(event.target.value)} placeholder="Buscar en Mami" aria-label="Buscar productos en Mami" />
              <button type="submit" className="rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50" disabled={mamiLoading}>{mamiLoading ? 'Consultando...' : 'Consultar'}</button>
            </form>
          </div>
          {mamiError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{mamiError}</p>}
          {mamiImportSkipped.length > 0 && <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><summary className="cursor-pointer font-semibold">{mamiImportSkipped.length} producto(s) omitido(s) en la última importación</summary><div className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">{mamiImportSkipped.map((item, index) => <p key={`${item.sourceProductId || 'sin-id'}-${index}`}><strong>{item.sourceProductId || 'Sin ID'}</strong>: {item.reason}</p>)}</div></details>}
          {mamiDiscarded.length > 0 && <details className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><summary className="cursor-pointer font-semibold">{mamiDiscarded.length} producto(s) descartado(s) automáticamente</summary><div className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">{mamiDiscarded.map((product, index) => <p key={`${product.sourceProductId || 'sin-id'}-${index}`}><strong>{product.name || 'Sin nombre'}</strong>: {product.reason}</p>)}</div></details>}
          {!mamiLoading && !mamiError && mamiPreview.length === 0 && <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">Consultá un producto para ver la vista previa de Mami.</p>}
          {mamiPreview.length > 0 && <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-stone-500 dark:text-stone-400">Los productos nuevos sin categoría o subcategoría quedan fuera de la selección masiva.</p><div className="flex gap-2"><button type="button" onClick={selectEligibleMamiProducts} disabled={mamiLoading} className="rounded-lg border border-emerald-600 px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-stone-700">Seleccionar válidos</button><button type="button" onClick={importSelectedMamiProducts} disabled={mamiLoading || !selectedMamiProducts.length} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">Importar seleccionados</button></div></div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {mamiPreview.map((product) => <label key={product.sourceProductId} className="flex cursor-pointer gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                <input type="checkbox" disabled={!product.existingProduct && !(product.proposedCategory && product.proposedSubcategory)} checked={selectedMamiProducts.includes(product.sourceProductId)} onChange={(event) => setSelectedMamiProducts((selected) => event.target.checked ? [...selected, product.sourceProductId] : selected.filter((id) => id !== product.sourceProductId))} className="mt-2 h-4 w-4 accent-emerald-600" aria-label={`Seleccionar ${product.name}`} />
                <ProductImage src={product.image} alt={product.name} productName={product.name} productCategory={product.sourceCategory} className="h-20 w-20 rounded-lg bg-stone-100 dark:bg-stone-900" />
                <div className="min-w-0 flex-1"><p className="font-bold text-stone-900 dark:text-white">{product.name}</p><p className="text-xs text-stone-500 dark:text-stone-400">{product.brand || 'Marca no informada'} · {product.existingProduct ? 'Producto existente' : 'Producto nuevo'}</p><p className="mt-1 font-black text-emerald-700 dark:text-emerald-400">Mami: {formatCurrency(product.price)}</p>{product.priceOptions?.map((offer) => <p key={`${product.sourceProductId}-${offer.supermarket}`} className="text-xs text-stone-500 dark:text-stone-400">{offer.supermarket}: {formatCurrency(offer.price)}</p>)}{!product.existingProduct && <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">{product.proposedCategory && product.proposedSubcategory ? `${product.proposedCategory} > ${product.proposedSubcategory}` : 'Mapeo pendiente'}</p>}{product.possibleDuplicate && <span className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Oferta/producto existente</span>}</div>
              </label>)}
            </div>
          </>}
        </section>
        </div>
        )}

        {activePage === 'producto' && (
        <>
        <ProductForm
          form={form}
          setForm={setForm}
          brands={brands}
          categories={categories}
          supermarkets={supermarkets}
          createProduct={createProduct}
          editingProduct={editingProduct}
          editingOfferId={editingOfferId}
          saveEdit={saveEdit}
          cancelEdit={cancelEdit}
          taxonomy={taxonomy}
          skipPriceChangeRecording={skipPriceChangeRecording}
          setSkipPriceChangeRecording={(skip) => {
            setSkipPriceChangeRecording(skip)
            localStorage.setItem('arprice_skip_price_change_recording', String(skip))
          }}
        />
        <Toast toast={toast} />

        {/* Products list */}
        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Productos</h2>
            <div className="flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400">
              <span>Página {productPage} de {totalPages}</span>
              <select
                value={productPageSize}
                onChange={(event) => {
                  setProductPageSize(Number(event.target.value))
                  setProductPage(1)
                }}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setProductPage((page) => Math.max(1, page - 1))}
                disabled={productPage === 1}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
              >
                Anterior
              </button>
              {visibleProductPages.map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setProductPage(page)}
                  className={`min-w-10 rounded-lg border px-3 py-2 text-xs font-bold ${productPage === page ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'}`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setProductPage((page) => Math.min(totalPages, page + 1))}
                disabled={productPage === totalPages}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
              >
                Siguiente
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <ProductImage src={product.image} alt={product.name} productName={product.name} productCategory={product.categories?.name || product.category?.name || product.category} className="w-28 h-28 shrink-0 rounded-lg" />
                    <div className="flex-1">
                      <h3 className="font-bold">{product.name}</h3>
                      <p className="text-sm text-stone-500">Marca: {product.brands?.name}</p>
                      <p className="text-sm text-stone-500">Categoría: {product.categories?.name}</p>
                      <p className="text-sm text-stone-500">Subcategoría: {product.subcategories?.name || 'Sin subcategoría'}</p>
                      <p className="text-sm">⭐ {product.rating}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button onClick={() => startEdit(product)} className="w-full px-4 py-2 bg-amber-500 text-white rounded-lg">Editar producto</button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {Object.entries(groupedOffersBySupermarket(product.offers)).length > 0 ? (
                    Object.entries(groupedOffersBySupermarket(product.offers)).map(([supermarket, offers]) => (
                      <div key={supermarket} className="p-3 bg-stone-50 dark:bg-stone-900 rounded-lg space-y-3">
                        <div className="flex items-center justify-between gap-4">
                          <strong>{supermarket}</strong>
                          <span className="text-xs uppercase tracking-wide text-stone-500">{offers.length} registro{offers.length > 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-2">
                          {offers.map((offer) => (
                            <div key={offer.id} className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 bg-white dark:bg-stone-950 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm text-stone-700 dark:text-stone-200">Contado: {formatCurrency(Number(offer.cash_price || 0))}</div>
                                {offer.installments_quantity && (
                                  <div className="text-xs text-stone-500">{offer.installments_quantity} x {formatCurrency(Number(offer.installment_price || 0))} = {formatCurrency(Number((offer.installments_quantity || 0) * (offer.installment_price || 0)))}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => startEdit(product, offer)}
                                  className="p-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                                  title="Editar este precio"
                                  aria-label={`Editar precio de ${supermarket}`}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteOffer(offer.id)}
                                  className="p-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700"
                                  title="Eliminar este precio"
                                  aria-label={`Eliminar precio de ${supermarket}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 bg-stone-50 dark:bg-stone-900 rounded-lg text-sm text-stone-500">Este producto no tiene precios registrados aún.</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => startEdit(product)} className="px-3 py-2 bg-sky-600 text-white rounded">Agregar precio</button>
                    <button onClick={() => deleteProduct(product.id)} className="px-3 py-2 bg-red-600 text-white rounded">Eliminar producto</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        </>
        )}

        {activePage === 'usuario' && (
        <section className="mt-6 bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold mb-3">Administradores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="px-3 py-2 rounded-lg border" placeholder="Usuario" value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} />
            <input className="px-3 py-2 rounded-lg border" placeholder="Contraseña" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
          </div>
          <div className="mt-4">
            <button onClick={createAdmin} className="px-4 py-2 bg-sky-600 text-white rounded-lg">Crear admin</button>
          </div>
          <div className="mt-4 space-y-2">
            {admins.map((a) => (
              <div key={a.id} className="px-3 py-2 bg-stone-50 dark:bg-stone-900 rounded-lg">👤 {a.username}</div>
            ))}
          </div>
        </section>
        )}
        </div>
      </main>
    </div>
  )

}
