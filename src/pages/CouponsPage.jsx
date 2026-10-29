import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgePercent, Check, Clock3, Tag } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext.jsx'
import BrandHeader from '../components/BrandHeader.jsx'
import carrefourLogo from '../assets/supermarkets/carrefour.svg'
import discoLogo from '../assets/supermarkets/disco-logo.png'

const promotions = [
  { store: 'Carrefour', type: 'Descuento en seleccionados', value: 'Hasta 30%', color: 'from-sky-600 to-blue-700', logo: carrefourLogo, logoBackground: 'bg-white', tag: 'Destacado' },
  { store: 'Disco', type: 'Beneficio en tu compra', value: '20% OFF', color: 'from-rose-500 to-red-600', logo: discoLogo, logoBackground: 'bg-white', tag: 'Por tiempo limitado' },
]

export default function CouponsPage() {
  const { t } = useLanguage()
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <BrandHeader>
          <Link to="/buscar" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-sky-700 dark:text-stone-300 dark:hover:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('Volver a productos')}
          </Link>
        </BrandHeader>

        <section className="relative mt-7 overflow-hidden rounded-3xl bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-800 p-6 text-white shadow-lg sm:p-9">
          <div className="relative z-10 max-w-2xl">
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{t('Cupones y descuentos')}</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-sky-100 sm:text-base">
              {t('Explora beneficios y ofertas destacadas para encontrar nuevas formas de ahorrar en tus compras.')}
            </p>
            <Link to="/buscar?deals=1" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-sky-800 transition-colors hover:bg-sky-50">
              {t('Ver productos en oferta')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <span className="absolute -right-8 -top-10 hidden h-64 w-64 items-center justify-center rounded-full border-[30px] border-white/10 text-white/20 sm:flex">
            <BadgePercent className="h-32 w-32" aria-hidden="true" />
          </span>
        </section>

        <section className="py-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">{t('Elegí tu próximo ahorro')}</p>
              <h2 className="mt-1 text-2xl font-black">{t('Descuentos destacados')}</h2>
            </div>
            <span className="text-sm font-semibold text-stone-500 dark:text-stone-400">{t('Promociones de muestra')}</span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {promotions.map((promotion) => (
              <article key={`${promotion.store}-${promotion.value}`} className="group overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
                <div className={`flex items-center justify-between bg-gradient-to-r ${promotion.color} px-5 py-4 text-white`}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-xl p-2 ${promotion.logoBackground}`}>
                      <img src={promotion.logo} alt={`${promotion.store} logo`} className="max-h-full max-w-full object-contain" />
                    </span>
                    <div>
                      <p className="text-lg font-black">{promotion.store}</p>
                      <p className="text-xs font-semibold text-white/80">{t(promotion.tag)}</p>
                    </div>
                  </div>
                  <Tag className="h-5 w-5 text-white/80" aria-hidden="true" />
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t(promotion.type)}</p>
                      <p className="mt-1 text-2xl font-black text-sky-700 dark:text-sky-300">{t(promotion.value)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t('Beneficio disponible')}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-dashed border-stone-200 pt-4 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {t('Consultar vigencia')}</span>
                    <Link to="/buscar?deals=1" className="font-bold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">{t('Ver ofertas')}</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}