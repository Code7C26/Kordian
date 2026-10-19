import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Calculator, CalendarDays, CircleHelp, TrendingUp, Wallet } from 'lucide-react'

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

export default function PriceInflationPage() {
  const [amount, setAmount] = useState('100000')
  const [variation, setVariation] = useState('12.5')
  const [period, setPeriod] = useState('Últimos 3 meses')
  const calculation = useMemo(() => {
    const initialAmount = Number(amount)
    const inflation = Number(variation)
    if (!Number.isFinite(initialAmount) || initialAmount < 0 || !Number.isFinite(inflation)) return null
    const updatedAmount = initialAmount * (1 + inflation / 100)
    return { initialAmount, inflation, updatedAmount, difference: updatedAmount - initialAmount }
  }, [amount, variation])

  const inputClass = 'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-stone-700 dark:bg-stone-900 dark:text-white dark:focus:ring-sky-950'

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
          <Link to="/" className="font-black tracking-tight text-sky-700 dark:text-sky-300">AR-PRICE</Link>
          <Link to="/buscar" className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-sky-700 dark:text-stone-300 dark:hover:text-sky-300">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a productos
          </Link>
        </header>

        <section className="py-8 sm:py-10">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <Calculator className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Herramientas para ahorrar</p>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">Calculadora de inflación</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-400">
                Compara el valor de tu dinero con una variación de precios acumulada y estima cuánto representa hoy.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-black">Calcula la variación</h2>
                <p className="text-xs text-stone-500 dark:text-stone-400">Completa los datos para ver la estimación</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="inflation-amount" className="mb-2 block text-sm font-semibold">Monto inicial</label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-bold text-stone-400">$</span>
                  <input id="inflation-amount" type="number" min="0" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={`${inputClass} pl-9`} />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="inflation-period" className="mb-2 block text-sm font-semibold">Período</label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                    <select id="inflation-period" value={period} onChange={(event) => setPeriod(event.target.value)} className={`${inputClass} pl-10`}>
                      <option>Último mes</option>
                      <option>Últimos 3 meses</option>
                      <option>Últimos 6 meses</option>
                      <option>Últimos 12 meses</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="inflation-rate" className="mb-2 block text-sm font-semibold">Variación acumulada</label>
                  <div className="relative">
                    <input id="inflation-rate" type="number" step="0.1" value={variation} onChange={(event) => setVariation(event.target.value)} className={`${inputClass} pr-10`} />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-stone-400">%</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-5 flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-3 text-xs leading-5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
              <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              La variación es editable y sirve como referencia ilustrativa; no representa un dato oficial de inflación.
            </p>
          </section>

          <section className="overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-700 via-blue-700 to-indigo-800 p-6 text-white shadow-lg dark:border-sky-900 sm:p-8">
            <div className="flex items-center justify-between">
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold">Estimación</span>
              <TrendingUp className="h-5 w-5 text-sky-100" aria-hidden="true" />
            </div>
            <p className="mt-8 text-sm font-semibold text-sky-100">Valor equivalente hoy</p>
            <p className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">{calculation ? currency.format(calculation.updatedAmount) : '—'}</p>
            <p className="mt-3 text-sm text-sky-100">{period} · variación de {calculation ? `${calculation.inflation}%` : '—'}</p>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-medium text-sky-100">Monto inicial</p>
                <p className="mt-1 text-lg font-extrabold">{calculation ? currency.format(calculation.initialAmount) : '—'}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-medium text-sky-100">Diferencia</p>
                <p className="mt-1 text-lg font-extrabold">{calculation ? currency.format(calculation.difference) : '—'}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white p-4 text-stone-800">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">¿Qué significa?</p>
              <p className="mt-1 text-sm leading-5">
                Para conservar el poder de compra de {calculation ? currency.format(calculation.initialAmount) : 'tu monto'},
                necesitarías {calculation ? currency.format(calculation.updatedAmount) : '—'} al final del período.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
