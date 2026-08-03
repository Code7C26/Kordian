import React from 'react'
import { PlusCircle } from 'lucide-react'

export default function CategoryBrandForm({ newCategory, setNewCategory, createCategory, newBrand, setNewBrand, createBrand, editingCategory, editingBrand }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Categorías</h3>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nueva categoría" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <button onClick={createCategory} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingCategory ? 'Actualizar' : 'Agregar'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Marcas</h3>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nueva marca" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
          <button onClick={createBrand} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingBrand ? 'Actualizar' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
