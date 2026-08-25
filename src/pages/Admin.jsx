
import { useEffect, useState } from 'react'
import { Header } from '../components/Header.jsx'
import ProductForm from '../components/ProductForm.jsx'
import CategoryBrandForm from '../components/CategoryBrandForm.jsx'
import CsvUploader from '../components/CsvUploader.jsx'
import Toast from '../components/Toast.jsx'
import { PackageOpen, Pencil, Trash2 } from 'lucide-react'
import { adminFetch, apiUrl } from '../config/api.js'

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
  const [taxonomy, setTaxonomy] = useState([])
  const [priceUpdates, setPriceUpdates] = useState([])

  const [editingProduct, setEditingProduct] = useState(null)
  const [editingOfferId, setEditingOfferId] = useState(null)

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
  const [productBrandFilter, setProductBrandFilter] = useState('')

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  const showToast = (message, type = 'success', title) => {
    setToast({ visible: true, message, type, title })
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500)
  }

  // data loaders
  const loadProducts = async () => {
    try {
      const res = await fetch(apiUrl('/products'))
      const data = await res.json()
      setProducts(data)
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
      const res = await fetch(apiUrl('/categories'))
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadBrands = async () => {
    try {
      const res = await fetch(apiUrl('/brands'))
      const data = await res.json()
      setBrands(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadSupermarkets = async () => {
    try {
      const res = await fetch(apiUrl('/supermarkets'))
      const data = await res.json()
      setSupermarkets(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadTaxonomy = async () => {
    try {
      const res = await fetch(apiUrl('/taxonomy'))
      if (!res.ok) throw new Error('Error cargando árbol de categorías')
      setTaxonomy(await res.json())
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
    loadTaxonomy()
    loadPriceUpdates()
  }, [])

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
          body: JSON.stringify({ subcategory_id: form.subcategory_id }),
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
          }),
        })

        if (!offerRes.ok) {
          const err = await offerRes.json()
          showToast(err.error || 'Error actualizando oferta', 'error')
          return
        }

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

        <section className="mt-6 bg-white dark:bg-stone-800 rounded-3xl border border-stone-200/80 dark:border-stone-700 p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Árbol de categorías</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {taxonomy.map((category) => (
              <div key={category.id} className="rounded-2xl border border-stone-200 dark:border-stone-700 p-4 bg-stone-50 dark:bg-stone-900">
                <h3 className="font-bold">{category.name}</h3>
                {category.subcategories.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {category.subcategories.map((subcategory) => (
                      <li key={subcategory.id}>
                        <div className="font-semibold text-sky-700 dark:text-sky-300">{subcategory.name}</div>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-start">
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

          <div className="col-span-1 lg:col-span-1">
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

          <div className="col-span-1 lg:col-span-1">
            <CsvUploader onUploaded={() => { loadProducts(); loadPriceUpdates() }} />
          </div>

          <section className="col-span-1 lg:col-span-2 bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold">Registro de actualizaciones rápidas</h2>
                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Cada aplicación de cambios queda registrada aquí.</p>
              </div>
              <button type="button" onClick={loadPriceUpdates} className="px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-stone-700">Actualizar</button>
            </div>
            {priceUpdates.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 dark:border-stone-700 text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400">
                    <tr>
                      <th className="py-3 pr-4">Fecha</th>
                      <th className="py-3 pr-4">Filtros aplicados</th>
                      <th className="py-3 pr-4">Porcentaje</th>
                      <th className="py-3 pr-4">Productos</th>
                      <th className="py-3 pr-4">Administrador</th>
                      <th className="py-3">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-700/70">
                    {priceUpdates.map((update) => {
                      const categoryName = categories.find((category) => String(category.id) === String(update.filters?.categoryId))?.name
                      const brandName = brands.find((brand) => String(brand.id) === String(update.filters?.brandId))?.name
                      const appliedFilters = [
                        categoryName ? `Categoría: ${categoryName}` : null,
                        brandName ? `Marca: ${brandName}` : null,
                        update.filters?.supermarket ? `Supermercado: ${update.filters.supermarket}` : null,
                      ].filter(Boolean)
                      return (
                        <tr key={update.id} className="text-stone-700 dark:text-stone-200">
                          <td className="py-3 pr-4 whitespace-nowrap text-xs text-stone-500 dark:text-stone-400">{new Date(update.updated_at).toLocaleString('es-AR')}</td>
                          <td className="py-3 pr-4 font-semibold">{appliedFilters.length ? appliedFilters.join(' · ') : 'Sin filtros'}</td>
                          <td className={`py-3 pr-4 font-bold ${Number(update.percentage) >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{Number(update.percentage) > 0 ? '+' : ''}{update.percentage}%</td>
                          <td className="py-3 pr-4">{update.products_updated}</td>
                          <td className="py-3 pr-4 text-xs">{update.admin_username}</td>
                          <td className="py-3">
                            <button type="button" onClick={() => deletePriceUpdate(update.id)} className="text-sm font-semibold text-rose-600 hover:underline">Eliminar</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-xl bg-stone-50 dark:bg-stone-900 p-4 text-sm text-stone-500 dark:text-stone-400">Todavía no hay actualizaciones rápidas registradas.</p>
            )}
          </section>

          <div className="col-span-1 lg:col-span-1">
            {/* reserved for quick stats or actions */}
            <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold">Acciones rápidas</h3>
              <p className="text-sm text-stone-500 mt-2">Aquí puedes añadir accesos rápidos, reportes o links.</p>
            </div>
          </div>
        </div>

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
          taxonomy={taxonomy}
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
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-28 h-28 object-cover rounded-lg" />
                    ) : (
                      <div className="w-28 h-28 shrink-0 rounded-lg bg-gradient-to-br from-sky-100 via-white to-emerald-100 dark:from-sky-950/70 dark:via-stone-800 dark:to-emerald-950/60 text-sky-700 dark:text-sky-300 flex flex-col items-center justify-center gap-1 p-2">
                        <div className="w-9 h-9 rounded-xl bg-white/80 dark:bg-stone-900/70 border border-sky-200 dark:border-sky-800 flex items-center justify-center shadow-sm">
                          <PackageOpen className="w-5 h-5" />
                        </div>
                        <div className="text-center leading-tight max-w-full">
                          <div className="text-xs font-black line-clamp-2 bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-500 dark:from-indigo-300 dark:via-sky-300 dark:to-emerald-300 bg-clip-text text-transparent">{product.name || 'Producto'}</div>
                          <div className="text-[8px] font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400 truncate">{product.categories?.name || 'Producto'}</div>
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold">{product.name}</h3>
                      <p className="text-sm text-stone-500">Marca: {product.brands?.name}</p>
                      <p className="text-sm text-stone-500">Categoría: {product.categories?.name}</p>
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
                                <div className="text-sm text-stone-700 dark:text-stone-200">Contado: ${offer.cash_price}</div>
                                {offer.installments_quantity && (
                                  <div className="text-xs text-stone-500">{offer.installments_quantity} x ${offer.installment_price} = ${offer.installments_quantity * offer.installment_price}</div>
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
