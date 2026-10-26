import { ArrowRight } from 'lucide-react';
import { CategoryIconImage, getCategoryIconAsset } from '../utils/categoryIconAssets.jsx';
import brandLogo from '../../assents/Ar-Price/Logo_final.svg';
import { useLanguage } from '../contexts/LanguageContext.jsx';

export function CategorySelectionPage({ categories, selectedCategory, onSelectCategory }) {
  const allProductsSelected = selectedCategory === 'todos';
  const { language, setLanguage, t } = useLanguage();

  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-b from-sky-50 via-white to-stone-50 px-4 py-10 text-stone-900 dark:from-stone-950 dark:via-stone-950 dark:to-stone-900 dark:text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-700/10" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-8 flex justify-end gap-2" role="group" aria-label={t('Idioma')}>
          {[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }].map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={language === option.value}
              onClick={() => setLanguage(option.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${language === option.value ? 'border-sky-600 bg-sky-600 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-sky-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200'}`}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-xl shadow-sky-600/10">
            <img src={brandLogo} alt="AR-PRICE" className="h-full w-full object-contain" />
          </div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-sky-600 dark:text-sky-400">{t('Bienvenido a AR-PRICE')}</p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{t('Elige un rubro para comparar')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-stone-600 dark:text-stone-300">
            {t('Primero selecciona la categoría de negocios que quieres explorar. Después podrás consultar precios, ofertas y productos en esa categoría.')}
          </p>
        </div>

        <section className="mt-10" aria-labelledby="category-selection-title">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 id="category-selection-title" className="text-xl font-black">{t('Categorías disponibles')}</h2>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('Selecciona una para continuar')}</p>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 p-12 text-center dark:border-stone-700 dark:bg-stone-900/50">
              <p className="font-bold">{t('Cargando categorías…')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                type="button"
                aria-pressed={allProductsSelected}
                onClick={() => onSelectCategory('todos')}
                className={`group relative overflow-hidden rounded-3xl border p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-400 hover:shadow-xl ${
                  allProductsSelected
                    ? 'border-sky-200 bg-sky-600 text-white hover:shadow-sky-500/20'
                    : 'border-stone-200 bg-white text-stone-900 hover:shadow-sky-500/10 dark:border-stone-700 dark:bg-stone-900 dark:text-white'
                }`}
              >
                <div className={`absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full transition-transform duration-300 group-hover:scale-125 ${allProductsSelected ? 'bg-white/10' : 'bg-sky-100 dark:bg-sky-950/70'}`} />
                <div className="relative flex items-start justify-between gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${allProductsSelected ? 'bg-white/15' : 'bg-sky-100 text-sky-600 dark:bg-sky-950/70 dark:text-sky-300'}`}>
                    <CategoryIconImage src={getCategoryIconAsset({ id: 'todos' })} className="h-7 w-7" />
                  </div>
                  <ArrowRight className={`h-5 w-5 transition-all group-hover:translate-x-1 ${allProductsSelected ? 'text-sky-100' : 'text-stone-300 group-hover:text-sky-600 dark:text-stone-600 dark:group-hover:text-sky-400'}`} />
                </div>
                <h3 className="relative mt-5 text-lg font-black">{t('Todos los productos')}</h3>
                <p className={`relative mt-2 text-sm leading-relaxed ${allProductsSelected ? 'text-sky-100' : 'text-stone-500 dark:text-stone-400'}`}>{t('Comparar el catálogo completo.')}</p>
              </button>

              {categories.map((category) => {
                const isSelected = String(selectedCategory) === String(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectCategory(category.id)}
                    className={`group relative overflow-hidden rounded-3xl border p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-sky-400 hover:shadow-xl ${
                      isSelected
                        ? 'border-sky-200 bg-sky-600 text-white hover:shadow-sky-500/20'
                        : 'border-stone-200 bg-white text-stone-900 hover:shadow-sky-500/10 dark:border-stone-700 dark:bg-stone-900 dark:text-white'
                    }`}
                  >
                    <div className={`absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full transition-transform duration-300 group-hover:scale-125 ${isSelected ? 'bg-white/10' : 'bg-sky-100 dark:bg-sky-950/70'}`} />
                    <div className="relative flex items-start justify-between gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? 'bg-white/15' : 'bg-sky-100 text-sky-600 dark:bg-sky-950/70 dark:text-sky-300'}`}>
                        <CategoryIconImage src={getCategoryIconAsset(category)} className="h-7 w-7" />
                      </div>
                      <ArrowRight className={`h-5 w-5 transition-all group-hover:translate-x-1 ${isSelected ? 'text-sky-100' : 'text-stone-300 group-hover:text-sky-600 dark:text-stone-600 dark:group-hover:text-sky-400'}`} />
                    </div>
                    <h3 className="relative mt-5 text-lg font-black">{t(category.name)}</h3>
                    <p className={`relative mt-2 text-sm leading-relaxed ${isSelected ? 'text-sky-100' : 'text-stone-500 dark:text-stone-400'}`}>
                      {category.description ? t(category.description) : t('Explora productos y precios de este rubro.')}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-right text-[10px] text-stone-400 dark:text-stone-500">
            {t('Íconos por')} <a className="underline underline-offset-2 hover:text-sky-600 dark:hover:text-sky-400" href="https://www.flaticon.es/autores/magnific" target="_blank" rel="noreferrer">Magnific</a> {t('en')} <a className="underline underline-offset-2 hover:text-sky-600 dark:hover:text-sky-400" href="https://www.flaticon.es" target="_blank" rel="noreferrer">Flaticon</a>
          </p>
        </section>
      </div>
    </main>
  );
}
