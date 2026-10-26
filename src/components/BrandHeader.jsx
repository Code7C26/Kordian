import { Link } from 'react-router-dom'
import brandLogo from '../../assents/Ar-Price/Logo_final.svg'
import brandLogoDark from '../../assents/Ar-Price/Logo_final_Negativo.svg'

export default function BrandHeader({ children, className = '' }) {
  return (
    <header className={`flex items-center justify-between gap-3 border-b border-stone-200 pb-4 dark:border-stone-800 ${className}`}>
      <Link to="/" aria-label="AR-PRICE" className="inline-flex items-center gap-2 font-black tracking-tight text-sky-700 dark:text-sky-300">
        <span className="flex items-center justify-center rounded-lg bg-white p-1 ring-1 ring-sky-300/70 shadow-[0_0_12px_rgba(14,165,233,0.2)] dark:bg-transparent dark:ring-sky-500/70">
          <img src={brandLogo} alt="" aria-hidden="true" className="h-8 w-auto dark:hidden" />
          <img src={brandLogoDark} alt="" aria-hidden="true" className="hidden h-8 w-auto dark:block" />
        </span>
        <span>AR-PRICE</span>
      </Link>
      {children}
    </header>
  )
}
