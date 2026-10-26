import { Store } from 'lucide-react'

export function SupermarketLogo({ name, image, className = 'h-8 w-16' }) {
  if (image) {
    return (
      <img
        src={image}
        alt={name || 'Supermercado'}
        title={name || 'Supermercado'}
        className={`shrink-0 rounded-lg bg-white object-contain ${className}`}
        loading="lazy"
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={name || 'Supermercado'}
      title={name || 'Supermercado'}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-sky-700 shadow-xs dark:border-stone-700 dark:bg-stone-800 dark:text-sky-300"
    >
      <Store className="h-4 w-4" aria-hidden="true" />
    </span>
  )
}
