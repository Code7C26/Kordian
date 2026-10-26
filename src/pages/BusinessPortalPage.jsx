import { ArrowUpRight, BarChart3, Boxes, CircleDollarSign, PackageCheck, Store, Tags, UsersRound } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'

const overview = [
  { label: 'Productos publicados', value: '128', detail: '+8 este mes', icon: Boxes, color: 'sky' },
  { label: 'Precios actualizados', value: '96', detail: 'Últimos 30 días', icon: CircleDollarSign, color: 'emerald' },
  { label: 'Ofertas activas', value: '14', detail: 'En tu catálogo', icon: Tags, color: 'amber' },
]

const shortcuts = [
  { title: 'Catálogo de productos', description: 'Publica productos y actualiza su precio.', icon: PackageCheck },
  { title: 'Precios y ofertas', description: 'Revisa la información visible para clientes.', icon: BarChart3 },
  { title: 'Datos del comercio', description: 'Consulta el perfil asignado a tu cuenta.', icon: Store },
]

export default function BusinessPortalPage({ children }) {
  const { t } = useLanguage()
  return (
    <section className="mt-7 space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-700 via-teal-700 to-sky-800 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold">
              <Store className="h-4 w-4" aria-hidden="true" /> {t('Espacio comercial')}
            </span>
            <h2 className="mt-4 text-2xl font-black sm:text-3xl">{t('Gestiona tu comercio')}</h2>
            <p className="mt-2 text-sm leading-6 text-emerald-50">
              {t('Administra la presencia de tu tienda en AR-PRICE y mantén actualizado el catálogo que consultan tus clientes.')}
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold">
            <span className="block text-xs font-medium text-emerald-100">{t('Panel del comercio')}</span>
            <span className="mt-1 inline-flex items-center gap-2">{t('Estado de cuenta')} <span className="h-2 w-2 rounded-full bg-emerald-300" /></span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overview.map(({ label, value, detail, icon: Icon, color }) => (
          <article key={label} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-start justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color === 'sky' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : color === 'emerald' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <ArrowUpRight className="h-4 w-4 text-stone-400" aria-hidden="true" />
            </div>
            <p className="mt-5 text-3xl font-black">{value}</p>
            <p className="mt-1 text-sm font-bold">{t(label)}</p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">{t(detail)}</p>
          </article>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">{t('Accesos rápidos')}</p>
            <h3 className="mt-1 text-xl font-black">{t('Herramientas del comercio')}</h3>
          </div>
          <span className="hidden items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400 sm:inline-flex">
            <UsersRound className="h-4 w-4" aria-hidden="true" /> {t('Vista de muestra')}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {shortcuts.map(({ title, description, icon: Icon }) => (
            <article key={title} className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h4 className="text-sm font-extrabold">{t(title)}</h4>
                <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{t(description)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">{t('Gestión de catálogo')}</p>
          <h3 className="mt-1 text-xl font-black">{t('Productos de tu comercio')}</h3>
        </div>
        {children}
      </section>
    </section>
  )
}