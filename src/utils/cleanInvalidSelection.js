export function sanitizeProductSelections({ favorites = [], basket = [], productIds = new Set() }) {
  const validProductIds = new Set((Array.from(productIds) || []).map(String));

  const nextFavorites = Array.isArray(favorites)
    ? favorites.filter((id) => validProductIds.has(String(id)))
    : [];

  const nextBasket = Array.isArray(basket)
    ? basket.filter((item) => {
        const productId = item?.product?.id ?? item?.productId ?? null;
        return productId != null && validProductIds.has(String(productId));
      })
    : [];

  return {
    favorites: nextFavorites,
    basket: nextBasket,
  };
}
