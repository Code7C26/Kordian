
export default function Toast({ toast }) {
  if (!toast || !toast.visible) return null

  const base = 'fixed right-4 top-4 z-50 max-w-sm w-full'

  return (
    <div className={base}>
      <div className={`rounded-lg p-4 shadow-xl text-white ${toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
        <div className="font-bold">{toast.title || (toast.type === 'error' ? 'Error' : 'Listo')}</div>
        <div className="text-sm mt-1">{toast.message}</div>
      </div>
    </div>
  )
}
