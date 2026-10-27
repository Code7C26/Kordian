import { useRef } from 'react'
import { X } from 'lucide-react'

export default function ClearableSearchInput({
  value,
  onClear,
  clearLabel = 'Limpiar búsqueda',
  className = '',
  wrapperClassName = '',
  ...inputProps
}) {
  const inputRef = useRef(null)
  const hasValue = String(value ?? '').length > 0

  return (
    <div className={`relative block ${wrapperClassName}`}>
      <input
        {...inputProps}
        ref={inputRef}
        value={value}
        className={`${className} pr-9`}
      />
      {hasValue && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onClear()
            inputRef.current?.focus()
          }}
          aria-label={clearLabel}
          title={clearLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:hover:bg-stone-700 dark:hover:text-stone-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
