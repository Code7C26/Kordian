import defaultProductImage from '../assets/no-product-image.svg';

export function getProductImageUrl(image) {
  if (typeof image !== 'string') return defaultProductImage;

  const trimmed = image.trim();
  if (!trimmed) return defaultProductImage;

  const normalized = trimmed.replace(/\s+/g, '');
  if (!normalized || normalized === 'null' || normalized === 'undefined') return defaultProductImage;

  return trimmed;
}

export function hasUsableProductImage(image) {
  return Boolean(getProductImageUrl(image)) && getProductImageUrl(image) !== defaultProductImage;
}
