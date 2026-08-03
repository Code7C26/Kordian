import React from 'react';
import { 
  ShoppingCart, 
  Pill, 
  Tv, 
  Wrench, 
  Shirt, 
  Dog, 
  Grid,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export function CategoryMenuScreen({ categories, onSelectCategory }) {
  const getIcon = (iconName) => {
    switch (iconName) {
      case 'ShoppingCart': return <ShoppingCart className="w-8 h-8" />;
      case 'Pill': return <Pill className="w-8 h-8" />;
      case 'Tv': return <Tv className="w-8 h-8" />;
      case 'Wrench': return <Wrench className="w-8 h-8" />;
      case 'Shirt': return <Shirt className="w-8 h-8" />;
      case 'Dog': return <Dog className="w-8 h-8" />;
      default: return <ShoppingCart className="w-8 h-8" />;
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="text-center space-y-3 mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-sky-100 dark:bg-sky-950/80 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
          <span>Selección Rápida de Categorías</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-stone-900 dark:text-white tracking-tight">
          ¿Qué estás buscando comparar hoy?
        </h1>

        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300 max-w-xl mx-auto font-normal">
          Selecciona una categoría para comenzar a comparar precios y descubrir ofertas reales en tu zona.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className="group relative text-left p-6 rounded-3xl bg-white dark:bg-stone-800/90 hover:bg-sky-50/50 dark:hover:bg-stone-800 border-2 border-stone-200/90 dark:border-stone-700/80 hover:border-sky-500 dark:hover:border-sky-500 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between min-h-[170px] cursor-pointer"
          >
            <div className="flex items-start justify-between w-full">
              <div className="p-3.5 rounded-2xl bg-sky-100/80 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 group-hover:scale-110 group-hover:bg-sky-600 group-hover:text-white transition-all duration-300">
                {getIcon(cat.icon)}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-stone-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                  {cat.name}
                </h2>
                <ArrowRight className="w-5 h-5 text-stone-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">
                {cat.description}
              </p>
            </div>
          </button>
        ))}

        <button
          onClick={() => onSelectCategory('todos')}
          className="group relative text-left p-6 rounded-3xl bg-gradient-to-br from-sky-600 to-blue-700 text-white shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between min-h-[170px] cursor-pointer"
        >
          <div className="flex items-start justify-between w-full">
            <div className="p-3.5 rounded-2xl bg-white/20 text-white group-hover:scale-110 transition-all duration-300">
              <Grid className="w-8 h-8" />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-white">
                Todas las Categorías
              </h2>
              <ArrowRight className="w-5 h-5 text-white/80 group-hover:translate-x-1 transition-transform" />
            </div>
            <p className="text-xs text-sky-100 mt-1">
              Explora todos los productos, aplica filtros avanzados y busca directamente.
            </p>
          </div>
        </button>
      </div>

      <div className="mt-12 text-center text-xs text-stone-400">
        <p>ARPrice Argentina • Selección rápida de categorías para comparación de precios</p>
      </div>
    </div>
  );
}
