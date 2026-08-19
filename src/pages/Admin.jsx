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
      const res = await fetch('http://localhost:3000/products', {
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
      }

      showToast('Producto actualizado', 'success')
      resetProductForm()
    } catch (err) {
      console.error(err)
      showToast('Error de red al actualizar producto', 'error')
    }

    loadProducts()
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

  // ===== UI =====
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100">
      <Header
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        selectedCity={selectedCity}
        setSelectedCity={() => {}}
        basketCount={0}
        onOpenBasket={() => {}}
        favoritesCount={0}
        onOpenFavorites={() => {}}
        onResetView={() => {}}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold">Panel Admin</h1>
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
                <div className="flex gap-4">
                  <img src={product.image || 'https://placehold.co/300x200'} alt={product.name} className="w-28 h-28 object-cover rounded-lg" />
                  <div>
                    <h3 className="font-bold">{product.name}</h3>
                    <p className="text-sm text-stone-500">Marca: {product.brands?.name}</p>
                    <p className="text-sm text-stone-500">Categoría: {product.categories?.name}</p>
                    <p className="text-sm">⭐ {product.rating}</p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {product.offers?.map((offer) => (
                    <div key={offer.id} className="p-3 bg-stone-50 dark:bg-stone-900 rounded-lg flex items-center justify-between">
                      <div>
                        <strong>{offer.supermarket}</strong>
                        <div className="text-sm text-stone-500">Contado: ${offer.cash_price}</div>
                        {offer.installments_quantity && (
                          <div className="text-sm text-stone-500">{offer.installments_quantity} x ${offer.installment_price} = ${offer.installments_quantity * offer.installment_price}</div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => startEdit(product, offer)} className="px-3 py-1 bg-yellow-500 text-white rounded">Editar</button>
                        <button onClick={() => deleteProduct(product.id)} className="px-3 py-1 bg-red-600 text-white rounded">Eliminar</button>
                      </div>
                    </div>
                  ))}
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
