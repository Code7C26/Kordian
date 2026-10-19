import { Link } from 'react-router-dom'
import { ArrowLeft, CircleHelp } from 'lucide-react'

const questions = [
  {
    question: '¿Cómo busco un producto?',
    answer: 'Elige una categoría y escribe el nombre o la marca en el buscador. Puedes filtrar por comercio y ordenar los resultados por precio o ahorro.',
  },
  {
    question: '¿Cómo comparo precios?',
    answer: 'Cada producto muestra su precio y el comercio. Abre la comparación para consultar las otras opciones disponibles para ese producto.',
  },
  {
    question: '¿Para qué sirve una cuenta?',
    answer: 'Al registrarte puedes acceder a tu perfil y guardar productos favoritos. La disponibilidad de funciones puede variar según el estado de tu cuenta.',
  },
  {
    question: '¿Cómo agrego productos a mi canasta?',
    answer: 'Pulsa “+ Canasta” en un producto para agregarlo. Abre “Canasta” en la parte superior para revisar los artículos y sus precios.',
  },
  {
    question: '¿Qué hago si un precio parece incorrecto?',
    answer: 'Usa la opción “Reportar precio” al pie de la página e indica el producto y el comercio para que el dato pueda revisarse.',
  },
]

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8 text-stone-900 dark:bg-stone-950 dark:text-stone-100 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a Ar-Price
        </Link>

        <header className="mt-8 rounded-3xl bg-sky-600 p-6 text-white sm:p-8">
          <CircleHelp className="h-8 w-8 text-sky-100" aria-hidden="true" />
          <h1 className="mt-4 text-3xl font-black">Preguntas frecuentes</h1>
          <p className="mt-2 text-sm leading-relaxed text-sky-100">
            Respuestas rápidas para ayudarte a usar Ar-Price.
          </p>
        </header>

        <section className="mt-6 space-y-3" aria-label="Preguntas frecuentes">
          {questions.map(({ question, answer }) => (
            <details key={question} className="group rounded-2xl border border-stone-200 bg-white p-5 open:border-sky-300 dark:border-stone-800 dark:bg-stone-900 dark:open:border-sky-800">
              <summary className="cursor-pointer list-none pr-6 text-base font-bold marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
                {question}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">
                {answer}
              </p>
            </details>
          ))}
        </section>
      </div>
    </main>
  )
}
