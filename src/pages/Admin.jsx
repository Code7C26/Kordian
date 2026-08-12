
import React, { useEffect, useState } from 'react'
import { Header } from '../components/Header.jsx'
import ProductForm from '../components/ProductForm.jsx'
import CategoryBrandForm from '../components/CategoryBrandForm.jsx'
import CsvUploader from '../components/CsvUploader.jsx'
import Toast from '../components/Toast.jsx'

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
  const [editingCategory, setEditingCategory] = useState(null)
  const [editingBrand, setEditingBrand] = useState(null)
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [bulkPercentage, setBulkPercentage] = useState(0)
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
      const res = await fetch('http://localhost:62752/products')
      const data = await res.json()
      setProducts(data)
    } catch (error) {
      console.error(error)
    }
  }

  const loadAdmins = async () => {
    try {
      const res = await fetch('http://localhost:62752/admins')
      const data = await res.json()
      setAdmins(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadCategories = async () => {
    try {
      const res = await fetch('http://localhost:62752/categories')
      const data = await res.json()
      setCategories(data)
    } catch (err) {
      console.error(err)
    }
  }

  const loadBrands = async () => {
    try {
      const res = await fetch('http://localhost:62752/brands')
      const data = await res.json()
      setBrands(data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    loadProducts()
    loadAdmins()
    loadCategories()
    loadBrands()
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

    try {
      const res = await fetch('http://localhost:62752/products', {
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
      const res = await fetch(`http://localhost:62752/products/${id}`, { method: 'DELETE' })
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
      const res = await fetch(`http://localhost:62752/offers/${id}`, { method: 'DELETE' })
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
      const res = await fetch(`http://localhost:62752/products/${editingProduct.id}`, {
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
        const offerRes = await fetch(`http://localhost:62752/offers/${editingOfferId}`, {
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
        const offerRes = await fetch('http://localhost:62752/offers', {
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
      const res = await fetch('http://localhost:62752/admins', {
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
    const endpoint = editingCategory ? `http://localhost:62752/categories/${editingCategory.id}` : 'http://localhost:62752/categories'
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
    const endpoint = editingBrand ? `http://localhost:62752/brands/${editingBrand.id}` : 'http://localhost:62752/brands'
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

  const deleteCategory = async (id) => {
    try {
      const res = await fetch(`http://localhost:62752/categories/${id}`, { method: 'DELETE' })
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
      const res = await fetch(`http://localhost:62752/brands/${id}`, { method: 'DELETE' })
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
        selectedCity={"Buenos Aires - CABA"}
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
          <div className="rounded-2xl bg-sky-900/10 dark:bg-sky-500/10 border border-sky-500/20 dark:border-sky-400/20 p-4">
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-200">Actualiza precios por categoría</p>
            <p className="text-xs text-stone-500 dark:text-stone-300 mt-1">Elige una categoría, ingresa un porcentaje y haz clic en aplicar.</p>
          </div>
        </div>

        <div className="mt-6 bg-white dark:bg-stone-800 rounded-3xl border border-stone-200/80 dark:border-stone-700 p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Actualizar precios por categoría</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block mb-2 text-sm font-semibold text-stone-700 dark:text-stone-200">Categoría</label>
              <select className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
                <option value="">Seleccionar categoría</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-2 text-sm font-semibold text-stone-700 dark:text-stone-200">Porcentaje</label>
              <input type="number" className="w-full px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" value={bulkPercentage} onChange={(e) => setBulkPercentage(Number(e.target.value))} placeholder="-10 para bajar 10%, 5 para subir 5%" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={async () => {
                if (!bulkCategoryId) { showToast('Elige una categoría', 'error'); return }
                try {
                  const res = await fetch('http://localhost:62752/admin/update-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: bulkCategoryId, percentage: Number(bulkPercentage) }) })
                  const data = await res.json()
                  if (!res.ok) { showToast(data.error || 'Error al actualizar precios', 'error'); return }
                  showToast(`Precios actualizados: ${data.updated}`, 'success')
                  setBulkCategoryId('')
                  setBulkPercentage(0)
                  loadProducts()
                } catch (err) {
                  console.error(err)
                  showToast('Error de red aplicando actualización', 'error')
                }
              }} className="w-full px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition">Aplicar porcentaje</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="col-span-1">
            <CategoryBrandForm
              newCategory={newCategory}
              setNewCategory={setNewCategory}
              createCategory={createCategory}
              newBrand={newBrand}
              setNewBrand={setNewBrand}
              createBrand={createBrand}
              editingCategory={editingCategory}
              editingBrand={editingBrand}
            />
          </div>

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

        <ProductForm
          form={form}
          setForm={setForm}
          brands={brands}
          categories={categories}
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
                    <img src={product.image || 'https://placehold.co/300x200'} alt={product.name} className="w-28 h-28 object-cover rounded-lg" />
                    <div className="flex-1">
                      <h3 className="font-bold">{product.name}</h3>
                      <p className="text-sm text-stone-500">Marca: {product.brands?.name}</p>
                      <p className="text-sm text-stone-500">Categoría: {product.categories?.name}</p>
                      <p className="text-sm">⭐ {product.rating}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button onClick={() => startEdit(product)} className="px-4 py-2 bg-sky-600 text-white rounded-lg">Agregar precio</button>
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
                              <button onClick={() => deleteOffer(offer.id)} className="px-3 py-1 bg-rose-600 text-white rounded">Eliminar</button>
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

        <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
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
          </div>

          <div className="bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
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
