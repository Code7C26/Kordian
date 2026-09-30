import { useEffect, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { getProductImageLabel, getProductImageUrl, isGenericProductImage } from '../utils/productImage';

export function ProductImage({ src, alt = 'Producto', productName, productCategory, showDetails = false, iconSize = 'default', className = '', ...props }) {
  const productImage = getProductImageUrl(src);
  const imageLabel = getProductImageLabel(productName || alt);
  const [failedSource, setFailedSource] = useState(null);
  const [genericSource, setGenericSource] = useState(null);
  const shouldUsePlaceholder = isGenericProductImage(src) || failedSource === productImage || genericSource === productImage;

  useEffect(() => {
    setFailedSource(null);
    setGenericSource(null);
  }, [productImage]);

  if (shouldUsePlaceholder) {
    return (
      <div className={`flex min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-sky-200 bg-slate-200 px-3 text-center dark:border-transparent dark:bg-sky-950/30 ${className}`}>
        <PackageOpen className={`${iconSize === 'large' ? 'h-28 w-28' : iconSize === 'medium' ? 'h-8 w-8' : iconSize === 'small' ? 'h-16 w-16' : showDetails ? 'h-20 w-20' : 'h-2/5 w-2/5'} max-h-[70%] max-w-[70%] text-sky-500 dark:text-sky-400`} strokeWidth={1.5} />
        {showDetails && (
          <div className="min-w-0 max-w-full">
            <p className="line-clamp-2 text-sm font-black leading-tight text-slate-800 dark:text-sky-100">{imageLabel}</p>
            {productCategory && <p className="mt-1 line-clamp-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">{productCategory}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      {...props}
      src={productImage}
      alt={alt}
      onError={() => setFailedSource(productImage)}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth === 512 && event.currentTarget.naturalHeight === 512) {
          setGenericSource(productImage);
        }
      }}
      className={`object-contain ${className}`}
    />
  );
}
