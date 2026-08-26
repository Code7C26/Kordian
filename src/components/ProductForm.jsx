import { useState } from 'react'
import { Save } from 'lucide-react'

export default function ProductForm({ form, setForm, brands, categories, supermarkets = [], createProduct, editingProduct, saveEdit, cancelEdit }) {
  const [showValidation, setShowValidation] = useState(false)
  const requiredFields = ['name', 'brand_id', 'category_id', 'supermarket', 'cashPrice']
  const missingFields = requiredFields.filter((field) => !String(form[field] ?? '').trim())
  const fieldClass = (field) => {
    const validationClass = showValidation
      ? missingFields.includes(field)
        ? 'border-rose-500 ring-1 ring-rose-300'
        : 'border-emerald-500 ring-1 ring-emerald-200'
      : 'border-stone-300 dark:border-stone-600'
    return `px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 ${validationClass}`
  }

  const handleCreateProduct = async () => {
    if (missingFields.length > 0) {
      setShowValidation(true)
      return
    }
    const created = await createProduct()
    if (created) setShowValidation(false)
  }

  return (
    <section className="mt-6 bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
      <h2 className="text-lg font-bold mb-4">{editingProduct ? 'Editar Producto u Oferta existente' : 'Agregar Producto y/o Precio'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input className={fieldClass('name')} placeholder="Nombre *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={fieldClass('brand_id')} value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
          <option value="">Seleccionar marca *</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
        <select className={fieldClass('category_id')} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">Seleccionar categoría *</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" type="number" placeholder="Calificación" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="URL Imagen" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
        <select className={fieldClass('supermarket')} value={form.supermarket} onChange={(e) => setForm({ ...form, supermarket: e.target.value })}>
          {supermarkets.map((supermarket) => <option key={supermarket.id} value={supermarket.name}>{supermarket.name}</option>)}
        </select>
        <input className={fieldClass('cashPrice')} type="number" placeholder="Precio contado *" value={form.cashPrice} onChange={(e) => setForm({ ...form, cashPrice: e.target.value })} />
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" type="number" placeholder="Cantidad cuotas" value={form.installmentsQuantity} onChange={(e) => setForm({ ...form, installmentsQuantity: e.target.value })} />
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" type="number" placeholder="Valor cuota" value={form.installmentPrice} onChange={(e) => setForm({ ...form, installmentPrice: e.target.value })} />
      </div>
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {editingProduct ? (
          <>
            <button onClick={saveEdit} className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg">
              <Save size={16} /> Guardar cambios
            </button>
            <button onClick={cancelEdit} className="px-4 py-2 bg-stone-200 dark:bg-stone-700 text-stone-900 dark:text-white rounded-lg">
              Cancelar
            </button>
          </>
        ) : (
          <button onClick={handleCreateProduct} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg">
            <Save size={16} /> Agregar producto
          </button>
        )}
        {form.installmentsQuantity && form.installmentPrice && (
          <div className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg">Total: <strong>${Number(form.installmentsQuantity) * Number(form.installmentPrice)}</strong></div>
        )}
      </div>
    </section>
  )
}
