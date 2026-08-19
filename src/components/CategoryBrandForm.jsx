import { useState } from 'react'
import { PlusCircle } from 'lucide-react'

export default function CategoryBrandForm({ newCategory, setNewCategory, createCategory, newBrand, setNewBrand, createBrand, editingCategory, editingBrand, brands = [], newSupermarket, setNewSupermarket, newSupermarketImage, setNewSupermarketImage, createSupermarket, editingSupermarket, cancelSupermarketEdit, catalogSection }) {
  const [showBrandsModal, setShowBrandsModal] = useState(false)
  return (
    <div className="grid grid-cols-1 gap-4">
      {catalogSection === 'category' && <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Categorías</h3>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nueva categoría" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <button onClick={createCategory} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingCategory ? 'Actualizar' : 'Agregar'}
          </button>
        </div>
      </div>}

      {catalogSection === 'brand' && <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Marcas</h3>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nueva marca" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
          <button onClick={createBrand} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingBrand ? 'Actualizar' : 'Agregar'}
          </button>
          <button type="button" onClick={() => setShowBrandsModal(true)} className="px-3 py-2 bg-stone-700 text-white rounded-lg whitespace-nowrap">
            Ver existentes
          </button>
        </div>
      </div>}

      {catalogSection === 'supermarket' && <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Supermercados</h3>
        <div className="flex gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nuevo supermercado" value={newSupermarket} onChange={(e) => setNewSupermarket(e.target.value)} />
          <button onClick={createSupermarket} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingSupermarket ? 'Actualizar' : 'Agregar'}
          </button>
          {editingSupermarket && <button onClick={cancelSupermarketEdit} className="text-sm text-rose-600">Cancelar</button>}
        </div>
        <input className="w-full mt-2 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="URL de imagen del supermercado" value={newSupermarketImage} onChange={(e) => setNewSupermarketImage(e.target.value)} />
      </div>}

      {showBrandsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60" onClick={() => setShowBrandsModal(false)}>
          <div className="w-full max-w-md max-h-[70vh] overflow-y-auto bg-white dark:bg-stone-800 rounded-2xl p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-stone-900 dark:text-white">Marcas existentes</h3>
              <button type="button" onClick={() => setShowBrandsModal(false)} className="px-3 py-1 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">Cerrar</button>
            </div>
            {brands.length ? (
              <div className="space-y-2">
                {brands.map((brand) => <div key={brand.id} className="px-3 py-2 rounded-lg bg-stone-100 dark:bg-stone-900 text-sm font-medium">{brand.name}</div>)}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No hay marcas registradas.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
