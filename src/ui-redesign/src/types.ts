export type PriceStatus = 'EN_PRECIO' | 'OFERTA' | 'INFLADO' | 'SOBREPRECIO';

export interface StorePrice {
  storeId: string;
  storeName: string;
  storeLogo: string;
  storeColor: string;
  price: number;
  stock: boolean;
  lastUpdated: string;
}

export interface PriceHistoryPoint {
  date: string;
  avgPrice: number;
  minPrice: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: 'supermercados' | 'farmacia' | 'ropa' | 'ferreteria' | 'electro' | 'mascotas';
  subcategory: string;
  image: string;
  unit: string;
  currentPrice: number;
  avgMarketPrice: number;
  status: PriceStatus;
  percentageDiff: number; // e.g. -20 for 20% cheaper, +35 for 35% inflated
  primaryStore: {
    id: string;
    name: string;
    badgeColor: string;
  };
  otherStores: StorePrice[];
  priceHistory: PriceHistoryPoint[];
  rating: number; // 1-5 score for price fairness
  description: string;
}

export interface CategoryItem {
  id: 'todos' | 'supermercados' | 'farmacia' | 'ropa' | 'ferreteria' | 'electro' | 'mascotas';
  name: string;
  icon: string;
  description: string;
  count: number;
  color: string;
  bgGradient: string;
}

export interface FilterState {
  category: string;
  searchQuery: string;
  store: string;
  priceStatus: 'todos' | 'EN_PRECIO' | 'INFLADO';
  sortBy: 'price-asc' | 'price-desc' | 'discount-desc' | 'rating-desc' | 'name-asc';
  maxPrice: number;
}

export interface BasketItem {
  product: Product;
  quantity: number;
}
