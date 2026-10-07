import { ArrowRight, Boxes, Dog, Layers3, Pill, Shirt, ShoppingCart, Tv, Wrench } from 'lucide-react';
import brandLogo from '../../assents/Ar-Price/Logo_final.svg';

const CATEGORY_ICONS = {
  ShoppingCart,
  Pill,
  Tv,
  Wrench,
  Shirt,
  Dog,
};

export function CategorySelectionPage({ categories, onSelectCategory }) {
  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-b from-sky-50 via-white to-stone-50 px-4 py-10 text-stone-900 dark:from-stone-950 dark:via-stone-950 dark:to-stone-900 dark:text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-700/10" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-xl shadow-sky-600/10">
            <img src={brandLogo} alt="ARPRICE" className="h-full w-full object-contain" />
          </div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-sky-600 dark:text-sky-400">Bienvenido a ARPRICE</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Elige un rubro para comparar</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-stone-600 dark:text-stone-300">
            Primero selecciona la categoría de negocios que quieres explorar. Después podrás consultar precios, ofertas y productos en esa categoría.
          </p>
        </div>

        <section className="mt-10" aria-labelledby="category-selection-title">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 id="category-selection-title" className="text-xl font-black">Categorías disponibles</h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Selecciona una para continuar</p>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 p-12 text-center dark:border-stone-700 dark:bg-stone-900/50">
              <p className="font-bold">Cargando categorías…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                type="button"
                onClick={() => onSelectCategory('todos')}
                className="group relative overflow-hidden rounded-3xl border border-sky-200 bg-sky-600 p-5 text-left text-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-400 hover:shadow-xl hover:shadow-sky-500/20"
              >
                <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-white/10 transition-transform duration-300 group-hover:scale-125" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                    <Boxes className="h-6 w-6" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-sky-100 transition-all group-hover:translate-x-1" />
                </div>
                <h3 className="relative mt-5 text-lg font-black">Todos los productos</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-sky-100">Comparar el catálogo completo.</p>
              </button>

              {categories.map((category) => {
                const CategoryIcon = CATEGORY_ICONS[category.icon] || Layers3;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => onSelectCategory(category.id)}
                    className="group relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-400 hover:shadow-xl hover:shadow-sky-500/10 dark:border-stone-700 dark:bg-stone-900"
                  >
                    <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-sky-100 transition-transform duration-300 group-hover:scale-125 dark:bg-sky-950/70" />
                    <div className="relative flex items-start justify-between gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600 dark:bg-sky-950/70 dark:text-sky-300">
                        <CategoryIcon className="h-6 w-6" />
                      </div>
                      <ArrowRight className="h-5 w-5 text-stone-300 transition-all group-hover:translate-x-1 group-hover:text-sky-600 dark:text-stone-600 dark:group-hover:text-sky-400" />
                    </div>
                    <h3 className="relative mt-5 text-lg font-black">{category.name}</h3>
                    <p className="relative mt-2 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                      {category.description || 'Explora productos y precios de este rubro.'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
