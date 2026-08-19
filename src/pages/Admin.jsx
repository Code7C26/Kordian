
import React, { useEffect, useState } from 'react'
import { Header } from '../components/Header.jsx'
import ProductForm from '../components/ProductForm.jsx'
import CategoryBrandForm from '../components/CategoryBrandForm.jsx'
import CsvUploader from '../components/CsvUploader.jsx'
import Toast from '../components/Toast.jsx'
import { PackageOpen } from 'lucide-react'

const cleanProductName = (name) => (name || 'Producto')
  .replace(/\s+\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|mg|cm|mm|unidades?|uds?|u)\s*$/i, '')
  .trim()

export default function Admin() {
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
  const [priceUpdates, setPriceUpdates] = useState(() => {
    try {
      const savedHistory = JSON.parse(localStorage.getItem('arprice_update_history') || '[]')
      return Array.isArray(savedHistory) ? savedHistory : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    const refreshPriceUpdates = () => {
      try {
        const savedHistory = JSON.parse(localStorage.getItem('arprice_update_history') || '[]')
        setPriceUpdates(Array.isArray(savedHistory) ? savedHistory : [])
      } catch {
        setPriceUpdates([])
      }
    }

    window.addEventListener('arprice-update-history-changed', refreshPriceUpdates)
    return () => window.removeEventListener('arprice-update-history-changed', refreshPriceUpdates)
  }, [])

  const [editingProduct, setEditingProduct] = useState(null)
  const [editingOfferId, setEditingOfferId] = useState(null)

  const [adminForm, setAdminForm] = useState({ username: '', password: '' })

  const [form, setForm] = useState({
    name: '',
    category_id: '',
    brand_id: '',
    rating: 5,
    image: '',
    supermarket: 'Carrefour',
    cashPrice: '',
    installmentsQuantity: '',
    installmentPrice: '',
  })

  const [newCategory, setNewCategory] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [newSupermarket, setNewSupermarket] = useState('')
  const [newSupermarketImage, setNewSupermarketImage] = useState('')
  const [editingSupermarket, setEditingSupermarket] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingBrand, setEditingBrand] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [productCategoryFilter, setProductCategoryFilter] = useState('')
  const [productBrandFilter, setProductBrandFilter] = useState('')
  const [failedProductImages, setFailedProductImages] = useState([])
  const [catalogSection, setCatalogSection] = useState(null)

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  const showToast = (message, type = 'success', title) => {
    setToast({ visible: true, message, type, title })
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500)
  }

  const deletePriceUpdate = async (updateId) => {
    const firstConfirmation = window.confirm('¿Quieres eliminar esta actualización del historial?')
    if (!firstConfirmation) return

    const secondConfirmation = window.confirm('Confirmación final: esta acción restaurará los precios anteriores y quitará el registro del historial. ¿Continuar?')
    if (!secondConfirmation) return

    const update = priceUpdates.find((item) => item.id === updateId)
    if (!update) return

    try {
      if (update.changes?.length) {
        const response = await fetch('http://localhost:3000/admin/rollback-price-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes: update.changes }),
        })
        const data = await response.json()
        if (!response.ok) {
          showToast(data.error || 'No se pudieron restaurar los precios', 'error')
          return
        }
      }

      const nextHistory = priceUpdates.filter((item) => item.id !== updateId)
      setPriceUpdates(nextHistory)
      localStorage.setItem('arprice_update_history', JSON.stringify(nextHistory))
      await loadProducts()
      showToast('Precios restaurados y actualización eliminada', 'success')
    } catch (error) {
      console.error(error)
      showToast('Error de red al restaurar los precios', 'error')
    }
  }

  // data loaders
  const loadProducts = async () => {
    try {
      const res = await fetch('http://localhost:3000/products')
      const data = await res.json()
      setProducts(data)
    } catch (error) {
      console.error(error)
    }
  }

  const loadAdmins = async () => {
    try {
      const res = await fetch('http://localhost:3000/admins')
      const data = await res.json()
      setAdmins(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadCategories = async () => {
    try {
      const res = await fetch('http://localhost:3000/categories')
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadBrands = async () => {
    try {
      const res = await fetch('http://localhost:3000/brands')
      const data = await res.json()
      setBrands(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadSupermarkets = async () => {
    try {
      const res = await fetch('http://localhost:3000/supermarkets')
      const data = await res.json()
      const saved = JSON.parse(localStorage.getItem('arprice_custom_supermarkets') || '[]')
      const images = JSON.parse(localStorage.getItem('arprice_supermarket_images') || '{}')
      const combined = [...(Array.isArray(data) ? data : []), ...(Array.isArray(saved) ? saved : [])]
        .map((item) => ({ ...item, image: item.image || images[item.name] || '' }))
      const unique = [...new Map(combined.map((item) => [item.name.toLowerCase(), item])).values()]
      setSupermarkets(unique.sort((first, second) => first.name.localeCompare(second.name)))
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadProducts()
    loadAdmins()
    loadCategories()
    loadBrands()
    loadSupermarkets()
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
      supermarket: 'Carrefour',
      cashPrice: '',
      installmentsQuantity: '',
      installmentPrice: '',
    })
  }

  const createProduct = async () => {
    if (editingProduct) {
      return saveEdit()
    }

    const missingFields = ['name', 'category_id', 'brand_id', 'supermarket', 'cashPrice']
      .filter((field) => !String(form[field] ?? '').trim())
    if (missingFields.length > 0 || Number(form.cashPrice) <= 0) {
      showToast('Completa nombre, marca, categoría, supermercado y un precio contado válido', 'error')
      return false
    }

    try {
      const res = await fetch('http://localhost:3000/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error creando producto', 'error')
        return false
      }
      showToast('Producto creado correctamente', 'success')
    } catch (err) {
      console.error(err)
      showToast('Error de red al crear producto', 'error')
      return false
    }

    resetProductForm()
    await loadProducts()
    return true
  }

  const deleteProduct = async (id) => {
    try {
      const res = await fetch(`http://localhost:3000/products/${id}`, { method: 'DELETE' })
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
      const res = await fetch(`http://localhost:3000/offers/${id}`, { method: 'DELETE' })
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
      supermarket: offer.supermarket || 'Carrefour',
      cashPrice: offer.cash_price || '',
      installmentsQuantity: offer.installments_quantity || '',
      installmentPrice: offer.installment_price || '',
    })
  }

  const cancelEdit = () => {
    resetProductForm()
  }

  const startEditCategory = (category) => {
    setEditingCategory(category)
    setNewCategory(category.name)
  }

  const startEditBrand = (brand) => {
    setEditingBrand(brand)
    setNewBrand(brand.name)
  }

  const saveEdit = async () => {
    if (!editingProduct) return

    try {
      const res = await fetch(`http://localhost:3000/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category_id: form.category_id,
          brand_id: form.brand_id,
          rating: form.rating,
          image: form.image,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        showToast(err.error || 'Error actualizando producto', 'error')
        return
      }

      if (editingOfferId) {
        const offerRes = await fetch(`http://localhost:3000/offers/${editingOfferId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            supermarket: form.supermarket,
            cash_price: form.cashPrice,
            installments_quantity: form.installmentsQuantity || null,
            installment_price: form.installmentPrice || null,
          }),
        })

        if (!offerRes.ok) {
          const err = await offerRes.json()
          showToast(err.error || 'Error actualizando oferta', 'error')
          return
        }

        showToast('Oferta actualizada', 'success')
      } else if (form.cashPrice || form.installmentsQuantity || form.installmentPrice) {
        const offerRes = await fetch('http://localhost:3000/offers', {
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

        const offerData = await offerRes.json()
        if (!offerRes.ok) {
          showToast(offerData.error || 'Error agregando oferta', 'error')
          return
        }
        if (!offerData?.id) {
          showToast('El servidor no confirmó el precio agregado', 'error')
          return
        }

        showToast('Precio agregado al producto', 'success')
      } else {
        showToast('Producto actualizado', 'success')
      }

      resetProductForm()
      await loadProducts()
    } catch (err) {
      console.error(err)
      showToast('Error de red al actualizar producto', 'error')
    }
  }

  const createAdmin = async () => {
    try {
      const res = await fetch('http://localhost:3000/admins', {
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
    const endpoint = editingCategory ? `http://localhost:3000/categories/${editingCategory.id}` : 'http://localhost:3000/categories'
    const method = editingCategory ? 'PUT' : 'POST'
    const res = await fetch(endpoint, {
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
  }

  const createBrand = async () => {
    if (!newBrand) return
    const endpoint = editingBrand ? `http://localhost:3000/brands/${editingBrand.id}` : 'http://localhost:3000/brands'
    const method = editingBrand ? 'PUT' : 'POST'
    const res = await fetch(endpoint, {
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
    const name = newSupermarket.trim()
    if (!name) return
    const image = newSupermarketImage.trim()
    if (editingSupermarket) {
      if (String(editingSupermarket.id).startsWith('custom-')) {
        const current = JSON.parse(localStorage.getItem('arprice_custom_supermarkets') || '[]')
        if (current.some((item) => item.id !== editingSupermarket.id && item.name.toLowerCase() === name.toLowerCase())) {
          showToast('Ese supermercado ya existe', 'error')
          return
        }
        const next = current.map((item) => item.id === editingSupermarket.id ? { ...item, name, image } : item)
        localStorage.setItem('arprice_custom_supermarkets', JSON.stringify(next))
        setEditingSupermarket(null)
        setNewSupermarket('')
        setNewSupermarketImage('')
        await loadSupermarkets()
        window.dispatchEvent(new CustomEvent('arprice-supermarkets-changed'))
        showToast('Supermercado actualizado', 'success')
        return
      }
      try {
        const response = await fetch(`http://localhost:3000/supermarkets/${encodeURIComponent(editingSupermarket.name)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        const data = await response.json()
        if (!response.ok) {
          showToast(data.error || 'Error actualizando supermercado', 'error')
          return
        }
        setEditingSupermarket(null)
        setNewSupermarket('')
        const images = JSON.parse(localStorage.getItem('arprice_supermarket_images') || '{}')
        delete images[editingSupermarket.name]
        if (image) images[name] = image
        localStorage.setItem('arprice_supermarket_images', JSON.stringify(images))
        setNewSupermarketImage('')
        await loadSupermarkets()
        showToast('Supermercado actualizado', 'success')
      } catch (error) {
        console.error(error)
        showToast('Error de red actualizando supermercado', 'error')
      }
      return
    }
    const current = JSON.parse(localStorage.getItem('arprice_custom_supermarkets') || '[]')
    if (current.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      showToast('Ese supermercado ya existe', 'error')
      return
    }
    const supermarket = { id: `custom-${Date.now()}`, name }
    supermarket.image = image
    const next = [...current, supermarket]
    localStorage.setItem('arprice_custom_supermarkets', JSON.stringify(next))
    setSupermarkets((items) => [...items, supermarket].sort((first, second) => first.name.localeCompare(second.name)))
    window.dispatchEvent(new CustomEvent('arprice-supermarkets-changed'))
    setNewSupermarket('')
    setNewSupermarketImage('')
    showToast('Supermercado agregado', 'success')
  }

  const deleteSupermarket = async (supermarket) => {
    const confirmed = window.confirm(`¿Eliminar ${supermarket.name} y todas sus ofertas? Esta acción no se puede deshacer.`)
    if (!confirmed) return
    try {
      const response = await fetch(`http://localhost:3000/supermarkets/${encodeURIComponent(supermarket.name)}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) {
        showToast(data.error || 'Error eliminando supermercado', 'error')
        return
      }
      const current = JSON.parse(localStorage.getItem('arprice_custom_supermarkets') || '[]')
      const next = current.filter((item) => item.id !== supermarket.id && item.name.toLowerCase() !== supermarket.name.toLowerCase())
      localStorage.setItem('arprice_custom_supermarkets', JSON.stringify(next))
      const images = JSON.parse(localStorage.getItem('arprice_supermarket_images') || '{}')
      delete images[supermarket.name]
      localStorage.setItem('arprice_supermarket_images', JSON.stringify(images))
      await loadSupermarkets()
      window.dispatchEvent(new CustomEvent('arprice-supermarkets-changed'))
      showToast('Supermercado eliminado', 'success')
    } catch (error) {
      console.error(error)
      showToast('Error de red eliminando supermercado', 'error')
    }
  }

  const startEditSupermarket = (supermarket) => {
    setEditingSupermarket(supermarket)
    setNewSupermarket(supermarket.name)
    setNewSupermarketImage(supermarket.image || '')
  }

  const cancelSupermarketEdit = () => {
    setEditingSupermarket(null)
    setNewSupermarket('')
    setNewSupermarketImage('')
  }

  const deleteCategory = async (id) => {
    try {
      const res = await fetch(`http://localhost:3000/categories/${id}`, { method: 'DELETE' })
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
      const res = await fetch(`http://localhost:3000/brands/${id}`, { method: 'DELETE' })
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

  const handleCsvUploaded = (err, message) => {
    if (err) showToast(err.message || 'Error importando CSV', 'error')
    else showToast(message || 'CSV importado', 'success')
    loadProducts()
  }

  const filteredProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase()
    if (query) {
      const matchName = product.name?.toLowerCase().includes(query)
      const matchBrand = product.brands?.name?.toLowerCase().includes(query)
      const matchCategory = product.categories?.name?.toLowerCase().includes(query)
      if (!matchName && !matchBrand && !matchCategory) {
        return false
      }
    }

    if (productCategoryFilter) {
      const categoryId = String(product.categories?.id || product.category_id || '')
      if (categoryId !== String(productCategoryFilter)) {
        return false
      }
    }

    if (productBrandFilter) {
      const brandId = String(product.brands?.id || product.brand_id || '')
      if (brandId !== String(productBrandFilter)) {
        return false
      }
    }

    return true
  })

  const groupedOffersBySupermarket = (offers = []) => {
    return offers.reduce((acc, offer) => {
      const supermarket = offer.supermarket || 'Sin supermercado'
      acc[supermarket] = acc[supermarket] || []
      acc[supermarket].push(offer)
      return acc
    }, {})
  }

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
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400 max-w-2xl">Aquí puedes administrar productos, categorías y marcas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCatalogSection(catalogSection === 'category' ? null : 'category')} className="px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold">Ver categorías</button>
            <button onClick={() => setCatalogSection(catalogSection === 'brand' ? null : 'brand')} className="px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold">Ver marcas</button>
            <button onClick={() => setCatalogSection(catalogSection === 'supermarket' ? null : 'supermarket')} className="px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold">Ver supermercados</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {catalogSection && <div className="col-span-1">
            <CategoryBrandForm
              newCategory={newCategory}
              setNewCategory={setNewCategory}
              createCategory={createCategory}
              brands={brands}
              newBrand={newBrand}
              setNewBrand={setNewBrand}
              createBrand={createBrand}
              editingCategory={editingCategory}
              editingBrand={editingBrand}
              newSupermarket={newSupermarket}
              setNewSupermarket={setNewSupermarket}
              newSupermarketImage={newSupermarketImage}
              setNewSupermarketImage={setNewSupermarketImage}
              createSupermarket={createSupermarket}
              editingSupermarket={editingSupermarket}
              cancelSupermarketEdit={cancelSupermarketEdit}
              catalogSection={catalogSection}
            />
          </div>}

          <div className="col-span-1">
            <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
              <h3 className="font-semibold mb-4">Filtros rápidos</h3>
              <div className="space-y-3">
                <input
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  placeholder="Buscar producto"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <select
                  className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                  value={productCategoryFilter}
                  onChange={(e) => setProductCategoryFilter(e.target.value)}
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
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

          <div className="col-span-1">
            <CsvUploader onUploaded={loadProducts} />
          </div>

          <div className="col-span-1">
            {/* reserved for quick stats or actions */}
            <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold">Acciones rápidas</h3>
              <p className="text-sm text-stone-500 mt-2">Aquí puedes añadir accesos rápidos, reportes o links.</p>
            </div>
          </div>
        </div>

        <section className="mt-6 bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold">Historial de actualizaciones</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">Cambios de precios aplicados desde el panel.</p>
            </div>
            <span className="text-sm text-stone-500 dark:text-stone-400">{priceUpdates.length} registro{priceUpdates.length === 1 ? '' : 's'}</span>
          </div>
          {priceUpdates.length > 0 ? (
            <div className="space-y-2">
              {priceUpdates.map((update) => (
                <div key={update.id} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center rounded-xl border border-stone-200 dark:border-stone-700 p-3 bg-stone-50 dark:bg-stone-900">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-stone-500">{update.type === 'brand' ? 'Marca' : update.type === 'supermarket' ? 'Supermercado' : update.type === 'combined' ? 'Filtros combinados' : 'Categoría'}</span>
                    <p className="font-semibold">{update.targetName}</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wide text-stone-500">Porcentaje</span>
                    <p className={Number(update.percentage) >= 0 ? 'font-semibold text-rose-600' : 'font-semibold text-emerald-600'}>{Number(update.percentage) > 0 ? '+' : ''}{update.percentage}%</p>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-wide text-stone-500">Fecha</span>
                    <p className="font-semibold">{update.date}</p>
                  </div>
                  <div className="text-sm text-stone-500 sm:text-right">Precios actualizados</div>
                  <button onClick={() => deletePriceUpdate(update.id)} title="Eliminar actualización" className="justify-self-start sm:justify-self-end px-3 py-1 bg-rose-600 text-white rounded">Eliminar</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500 dark:text-stone-400">Todavía no hay actualizaciones registradas.</p>
          )}
        </section>

        <ProductForm
          form={form}
          setForm={setForm}
          brands={brands}
          categories={categories}
          supermarkets={supermarkets}
          createProduct={createProduct}
          editingProduct={editingProduct}
          saveEdit={saveEdit}
          cancelEdit={cancelEdit}
        />
        <Toast toast={toast} />

        {/* Products list */}
        <section className="mt-6">
          <h2 className="text-xl font-bold mb-4">Productos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    {product.image && !failedProductImages.includes(product.id) ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        onError={() => setFailedProductImages((current) => current.includes(product.id) ? current : [...current, product.id])}
                        className="w-28 h-28 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-28 h-28 rounded-lg bg-gradient-to-br from-sky-100 via-white to-emerald-100 dark:from-sky-950/70 dark:via-stone-800 dark:to-emerald-950/60 border border-sky-200 dark:border-sky-800 flex flex-col items-center justify-center gap-1 p-2 text-center shrink-0">
                        <PackageOpen className="w-7 h-7 text-sky-600 dark:text-sky-300" />
                        <span className="text-xs font-black leading-tight bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-500 dark:from-indigo-300 dark:via-sky-300 dark:to-emerald-300 bg-clip-text text-transparent line-clamp-3">{cleanProductName(product.name)}</span>
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold">{product.name}</h3>
                      <p className="text-sm text-stone-500">Marca: {product.brands?.name || product.id_brands || 'Sin marca'}</p>
                      <p className="text-sm text-stone-500">Categoría: {product.categories?.name || product['category.id'] || 'Sin categoría'}</p>
                      <p className="text-sm">⭐ {product.rating}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button onClick={() => startEdit(product)} className="px-4 py-2 bg-sky-600 text-white rounded-lg">Editar producto</button>
                    <button onClick={() => deleteProduct(product.id)} className="px-4 py-2 bg-red-600 text-white rounded-lg">Eliminar producto</button>
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
                                <div className="text-sm text-stone-700 dark:text-stone-200">Contado: ${offer.cash_price}</div>
                                {offer.installments_quantity && (
                                  <div className="text-xs text-stone-500">{offer.installments_quantity} x ${offer.installment_price} = ${offer.installments_quantity * offer.installment_price}</div>
                                )}
                              </div>
                              <button onClick={() => deleteOffer(offer.id)} title="Eliminar precio" aria-label="Eliminar precio" className="px-3 py-1 bg-rose-600 text-white rounded">X</button>
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {catalogSection && <section className="mt-6 grid grid-cols-1 gap-4">
          {catalogSection === 'category' && <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Categorías existentes</h2>
              {editingCategory && (
                <button onClick={() => { setEditingCategory(null); setNewCategory('') }} className="text-sm text-rose-600 hover:underline">Cancelar</button>
              )}
            </div>
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{cat.name}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingCategory(cat); setNewCategory(cat.name) }} className="text-sky-600 hover:underline text-sm">Editar</button>
                    <button onClick={() => deleteCategory(cat.id)} className="text-rose-600 hover:underline text-sm">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>}

          {catalogSection === 'brand' && <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Marcas existentes</h2>
              {editingBrand && (
                <button onClick={() => { setEditingBrand(null); setNewBrand('') }} className="text-sm text-rose-600 hover:underline">Cancelar</button>
              )}
            </div>
            <div className="space-y-2">
              {brands.map((brand) => (
                <div key={brand.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                  <span className="text-sm font-medium text-stone-900 dark:text-stone-100">{brand.name}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingBrand(brand); setNewBrand(brand.name) }} className="text-sky-600 hover:underline text-sm">Editar</button>
                    <button onClick={() => deleteBrand(brand.id)} className="text-rose-600 hover:underline text-sm">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>}

          {catalogSection === 'supermarket' && <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Supermercados existentes</h2>
            </div>
            <div className="space-y-2">
              {supermarkets.map((supermarket) => (
                <div key={supermarket.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700">
                  <div className="flex items-center gap-3 min-w-0">
                    {supermarket.image ? <img src={supermarket.image} alt={supermarket.name} className="w-10 h-10 rounded-lg object-cover border border-stone-200 dark:border-stone-700" /> : <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 flex items-center justify-center text-xs font-black">{supermarket.name.slice(0, 2).toUpperCase()}</div>}
                    <span className="text-sm font-medium text-stone-900 dark:text-stone-100 truncate">{supermarket.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEditSupermarket(supermarket)} className="text-sky-600 hover:underline text-sm">Editar</button>
                    <button onClick={() => deleteSupermarket(supermarket)} className="text-rose-600 hover:underline text-sm">Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>}
        </section>}

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
      </main>
    </div>
  )

}
