import { useState } from 'react'
import { ChevronDown, Save, Store } from 'lucide-react'

export default function ProductForm({ form, setForm, brands, categories, supermarkets = [], createProduct, editingProduct, editingOfferId = null, saveEdit, cancelEdit, taxonomy = [], skipPriceChangeRecording = false, setSkipPriceChangeRecording }) {
  const [supermarketMenuOpen, setSupermarketMenuOpen] = useState(false)
  const selectedCategory = taxonomy.find((category) => String(category.id) === String(form.category_id))
  const subcategories = selectedCategory?.subcategories || []
  const selectedSupermarket = supermarkets.find((supermarket) => supermarket.name === form.supermarket)
  return (
    <section className="mt-6 bg-white dark:bg-stone-800 rounded-2xl p-6 shadow-sm">
      <h2 className="text-lg font-bold mb-4">{editingProduct ? 'Editar Producto u Oferta existente' : 'Agregar Producto y/o Precio'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" value={form.brand_id} onChange={(e) => setForm({ ...form, brand_id: e.target.value })}>
          <option value="">Seleccionar marca</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
        <select className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value, subcategory_id: '' })}>
          <option value="">Seleccionar categoría</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <select className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 disabled:opacity-60" value={form.subcategory_id || ''} onChange={(e) => setForm({ ...form, subcategory_id: e.target.value })} disabled={!form.category_id}>
          <option value="">Seleccionar subcategoría</option>
          {subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}
        </select>
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" type="number" placeholder="Calificación" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} />
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="URL Imagen" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
        <div className="relative">
          <button
            type="button"
            className="w-full min-h-[42px] px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 flex items-center justify-between gap-3 text-left"
            onClick={() => setSupermarketMenuOpen((open) => !open)}
            aria-expanded={supermarketMenuOpen}
            aria-haspopup="listbox"
          >
            <span className="flex items-center gap-2 min-w-0">
              {selectedSupermarket?.image ? <img src={selectedSupermarket.image} alt="" className="w-7 h-7 rounded object-contain shrink-0" /> : <Store size={20} className="text-stone-400 shrink-0" />}
              <span className="truncate">{selectedSupermarket?.name || 'Seleccionar supermercado'}</span>
            </span>
            <ChevronDown size={18} className="shrink-0" />
          </button>
          {supermarketMenuOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border bg-white dark:bg-stone-900 shadow-lg" role="listbox">
              <button
                type="button"
                className="w-full px-3 py-2 flex items-center gap-2 text-left text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                onClick={() => { setForm({ ...form, supermarket: '' }); setSupermarketMenuOpen(false) }}
              >
                <Store size={20} className="text-stone-400 shrink-0" />
                Seleccionar supermercado
              </button>
              {supermarkets.map((supermarket) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={supermarket.name === form.supermarket}
                  key={supermarket.id}
                  className="w-full px-3 py-2 flex items-center gap-2 text-left text-sm text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800"
                  onClick={() => { setForm({ ...form, supermarket: supermarket.name }); setSupermarketMenuOpen(false) }}
                >
                  {supermarket.image ? <img src={supermarket.image} alt="" className="w-8 h-8 rounded object-contain shrink-0" /> : <Store size={20} className="text-stone-400 shrink-0" />}
                  <span className="truncate">{supermarket.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" type="number" placeholder="Precio contado" value={form.cashPrice} onChange={(e) => setForm({ ...form, cashPrice: e.target.value })} />
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" type="number" placeholder="Cantidad cuotas" value={form.installmentsQuantity} onChange={(e) => setForm({ ...form, installmentsQuantity: e.target.value })} />
        <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" type="number" placeholder="Valor cuota" value={form.installmentPrice} onChange={(e) => setForm({ ...form, installmentPrice: e.target.value })} />
      </div>
      {editingProduct && editingOfferId !== null && (
        <label className="mt-4 flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
          <input type="checkbox" checked={skipPriceChangeRecording} onChange={(e) => setSkipPriceChangeRecording?.(e.target.checked)} className="h-4 w-4 accent-sky-600" />
          No registrar esta edición en historial ni actualizaciones
        </label>
      )}
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
          <button onClick={createProduct} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg">
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
