import { useState } from 'react'
import { PlusCircle, Store } from 'lucide-react'

export default function CategoryBrandForm({ newCategory, setNewCategory, createCategory, newBrand, setNewBrand, createBrand, editingCategory, editingBrand, categories = [], onEditCategory, onDeleteCategory, subcategories = [], newSubcategory, setNewSubcategory, subcategoryCategoryId, setSubcategoryCategoryId, createSubcategory, editingSubcategory, onEditSubcategory, onDeleteSubcategory, cancelSubcategory, brands = [], onEditBrand, onDeleteBrand, supermarkets = [], onEditSupermarket, onDeleteSupermarket, newSupermarket, setNewSupermarket, newSupermarketImage, setNewSupermarketImage, createSupermarket, editingSupermarket, cancelSupermarketEdit, catalogSection }) {
  const [showCategoriesModal, setShowCategoriesModal] = useState(false)
  const [showBrandsModal, setShowBrandsModal] = useState(false)
  const [showSupermarketsModal, setShowSupermarketsModal] = useState(false)
  const [showSubcategoriesModal, setShowSubcategoriesModal] = useState(false)
  const visibleSubcategories = subcategoryCategoryId
    ? subcategories.filter((subcategory) => String(subcategory.category_id) === String(subcategoryCategoryId))
    : subcategories
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {(!catalogSection || catalogSection === 'category') && <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Categorías</h3>
        <div className="flex flex-wrap gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nueva categoría" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <button onClick={createCategory} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingCategory ? 'Actualizar' : 'Agregar'}
          </button>
          <button type="button" onClick={() => setShowCategoriesModal(true)} className="px-3 py-2 bg-stone-700 text-white rounded-lg whitespace-nowrap">
            Ver existentes
          </button>
        </div>
      </div>}

      {(!catalogSection || catalogSection === 'subcategory') && <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Subcategorías</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" value={subcategoryCategoryId} onChange={(e) => setSubcategoryCategoryId(e.target.value)}>
            <option value="">Categoría principal</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <input className="px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nueva subcategoría" value={newSubcategory} onChange={(e) => setNewSubcategory(e.target.value)} />
          <button onClick={createSubcategory} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center justify-center gap-2 min-w-0">
            <PlusCircle size={16}/> {editingSubcategory ? 'Actualizar' : 'Agregar'}
          </button>
          <button type="button" onClick={() => setShowSubcategoriesModal(true)} className="px-3 py-2 bg-stone-700 text-white rounded-lg whitespace-nowrap">Ver existentes</button>
        </div>
        {editingSubcategory && <button type="button" onClick={cancelSubcategory} className="mt-2 text-sm text-rose-600">Cancelar</button>}
      </div>}

      {(!catalogSection || catalogSection === 'brand') && <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Marcas</h3>
        <div className="flex flex-wrap gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nueva marca" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />
          <button onClick={createBrand} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingBrand ? 'Actualizar' : 'Agregar'}
          </button>
          <button type="button" onClick={() => setShowBrandsModal(true)} className="px-3 py-2 bg-stone-700 text-white rounded-lg whitespace-nowrap">
            Ver existentes
          </button>
        </div>
      </div>}

      {(!catalogSection || catalogSection === 'supermarket') && <div className="bg-white dark:bg-stone-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold mb-2">Supermercados</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
          <input className="flex-1 px-3 py-2 rounded-lg border bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100" placeholder="Nuevo supermercado" value={newSupermarket} onChange={(e) => setNewSupermarket(e.target.value)} />
          <button onClick={createSupermarket} className="px-3 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
            <PlusCircle size={16}/> {editingSupermarket ? 'Actualizar' : 'Agregar'}
          </button>
          <button type="button" onClick={() => setShowSupermarketsModal(true)} className="px-3 py-2 bg-stone-700 text-white rounded-lg whitespace-nowrap">Ver existentes</button>
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
                {brands.map((brand) => (
                  <div key={brand.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-stone-100 dark:bg-stone-900 text-sm font-medium">
                    <span>{brand.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button type="button" onClick={() => { onEditBrand?.(brand); setShowBrandsModal(false) }} className="text-sky-600 hover:underline">Editar</button>
                      <button type="button" onClick={() => onDeleteBrand?.(brand.id)} className="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No hay marcas registradas.</p>
            )}
          </div>
        </div>
      )}

      {showCategoriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60" onClick={() => setShowCategoriesModal(false)}>
          <div className="w-full max-w-md max-h-[70vh] overflow-y-auto bg-white dark:bg-stone-800 rounded-2xl p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-stone-900 dark:text-white">Categorías existentes</h3>
              <button type="button" onClick={() => setShowCategoriesModal(false)} className="px-3 py-1 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">Cerrar</button>
            </div>
            {categories.length ? (
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-stone-100 dark:bg-stone-900 text-sm font-medium">
                    <span>{category.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button type="button" onClick={() => { onEditCategory?.(category); setShowCategoriesModal(false) }} className="text-sky-600 hover:underline">Editar</button>
                      <button type="button" onClick={() => onDeleteCategory?.(category.id)} className="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No hay categorías registradas.</p>
            )}
          </div>
        </div>
      )}

      {showSubcategoriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60" onClick={() => setShowSubcategoriesModal(false)}>
          <div className="w-full max-w-md max-h-[70vh] overflow-y-auto bg-white dark:bg-stone-800 rounded-2xl p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-stone-900 dark:text-white">Subcategorías existentes</h3>
              <button type="button" onClick={() => setShowSubcategoriesModal(false)} className="px-3 py-1 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">Cerrar</button>
            </div>
            {visibleSubcategories.length ? (
              <div className="space-y-2">
                {visibleSubcategories.map((subcategory) => (
                  <div key={subcategory.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-stone-100 dark:bg-stone-900 text-sm font-medium">
                    <span className="min-w-0"><span className="block truncate">{subcategory.name}</span><span className="block text-xs font-normal text-stone-500">{subcategory.categoryName}</span></span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button type="button" onClick={() => { onEditSubcategory?.(subcategory); setShowSubcategoriesModal(false) }} className="text-sky-600 hover:underline">Editar</button>
                      <button type="button" onClick={() => onDeleteSubcategory?.(subcategory.id)} className="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-stone-500">No hay subcategorías para la categoría seleccionada.</p>}
          </div>
        </div>
      )}

      {showSupermarketsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60" onClick={() => setShowSupermarketsModal(false)}>
          <div className="w-full max-w-md max-h-[70vh] overflow-y-auto bg-white dark:bg-stone-800 rounded-2xl p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-stone-900 dark:text-white">Supermercados existentes</h3>
              <button type="button" onClick={() => setShowSupermarketsModal(false)} className="px-3 py-1 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">Cerrar</button>
            </div>
            {supermarkets.length ? (
              <div className="space-y-2">
                {supermarkets.map((supermarket) => (
                  <div key={supermarket.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-stone-100 dark:bg-stone-900 text-sm font-medium">
                    <span className="flex items-center gap-2 min-w-0">
                      {supermarket.image ? <img src={supermarket.image} alt="" className="w-8 h-8 rounded object-contain shrink-0 bg-white" /> : <Store size={20} className="text-stone-400 shrink-0" />}
                      <span className="truncate">{supermarket.name}</span>
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <button type="button" onClick={() => { onEditSupermarket?.(supermarket); setShowSupermarketsModal(false) }} className="text-sky-600 hover:underline">Editar</button>
                      <button type="button" onClick={() => onDeleteSupermarket?.(supermarket.id)} className="text-rose-600 hover:underline">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No hay supermercados registrados.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
