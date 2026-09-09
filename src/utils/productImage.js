import defaultProductImage from '../assets/hero.png';

export function getProductImageUrl(image) {
  if (typeof image !== 'string') return defaultProductImage;

  const trimmed = image.trim();
  if (!trimmed) return defaultProductImage;

  const normalized = trimmed.replace(/\s+/g, '').toLowerCase();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return defaultProductImage;

  return trimmed;
}

export function isGenericProductImage(image) {
  if (typeof image !== 'string') return true;

  const normalized = image.trim().replace(/\s+/g, '').toLowerCase();
  if (!normalized || normalized === 'null' || normalized === 'undefined') return true;

  return /(?:no[-_ ]?product[-_ ]?image|placeholder|sin[-_ ]?imagen|default[-_ ]?product|hero\.(?:png|jpe?g|webp))/.test(normalized);
}

export function getProductImageLabel(name) {
  return String(name || 'Producto')
    .replace(/\s*(?:x\s*)?\d+(?:[.,]\d+)?\s*(?:ml|mililitros?|cc|cl|l|lt|lts|litros?|kg|kgs|kilos?|g|gr|gramos?|mg)\b.*$/i, '')
    .replace(/\s*(?:\+\s*\d+|x\s*\d+\s*(?:u|un|uds?|unidades?)?|p(?:ck|ack)\s*\d+|u\s*\d+)\b.*$/i, '')
    .trim() || 'Producto';
}

export function hasUsableProductImage(image) {
  return !isGenericProductImage(image);
}
