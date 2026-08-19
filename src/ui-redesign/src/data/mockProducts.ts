import { Product, CategoryItem } from '../types';

export const CATEGORIES: CategoryItem[] = [
  {
    id: 'supermercados',
    name: 'Supermercados',
    icon: 'ShoppingCart',
    description: 'Almacén, lácteos, bebidas y limpieza del hogar',
    count: 2450,
    color: 'emerald',
    bgGradient: 'from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-500/20'
  },
  {
    id: 'farmacia',
    name: 'Farmacia y Cuidado',
    icon: 'Pill',
    description: 'Medicamentos, perfumería e higiene personal',
    count: 1820,
    color: 'blue',
    bgGradient: 'from-blue-500/10 via-indigo-500/5 to-transparent border-blue-500/20'
  },
  {
    id: 'electro',
    name: 'Electro y Tecnología',
    icon: 'Tv',
    description: 'Televisores, smartphones, audio y climatización',
    count: 1430,
    color: 'purple',
    bgGradient: 'from-purple-500/10 via-violet-500/5 to-transparent border-purple-500/20'
  },
  {
    id: 'ferreteria',
    name: 'Ferretería y Jardín',
    icon: 'Wrench',
    description: 'Herramientas, pintura, plomería y electricidad',
    count: 980,
    color: 'amber',
    bgGradient: 'from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20'
  },
  {
    id: 'ropa',
    name: 'Ropa y Calzado',
    icon: 'Shirt',
    description: 'Indumentaria urbana, deportiva y calzado',
    count: 1650,
    color: 'rose',
    bgGradient: 'from-rose-500/10 via-pink-500/5 to-transparent border-rose-500/20'
  },
  {
    id: 'mascotas',
    name: 'Mascotas',
    icon: 'Dog',
    description: 'Alimento balanceado, pipetas y accesorios',
    count: 740,
    color: 'amber',
    bgGradient: 'from-amber-600/10 via-amber-500/5 to-transparent border-amber-600/20'
  }
];

export const STORES_LIST = [
  { id: 'coto', name: 'Coto CISA', logoBg: 'bg-red-600' },
  { id: 'carrefour', name: 'Carrefour', logoBg: 'bg-blue-600' },
  { id: 'jumbo', name: 'Jumbo', logoBg: 'bg-emerald-600' },
  { id: 'dia', name: 'Supermercados Día', logoBg: 'bg-red-500' },
  { id: 'farmacity', name: 'Farmacity', logoBg: 'bg-teal-600' },
  { id: 'easy', name: 'Easy', logoBg: 'bg-amber-600' },
  { id: 'fravega', name: 'Frávega', logoBg: 'bg-indigo-600' },
  { id: 'vea', name: 'Vea Supermercados', logoBg: 'bg-yellow-600' }
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Yerba Mate Playadito Con Palo 1kg',
    brand: 'Playadito',
    category: 'supermercados',
    subcategory: 'Almacén',
    image: 'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&w=600&q=80',
    unit: 'Bolsa 1 kg',
    currentPrice: 3850,
    avgMarketPrice: 4900,
    status: 'OFERTA',
    percentageDiff: -21.4,
    rating: 4.9,
    description: 'Yerba mate suave elaborada con palo, estacionamiento natural de 12 meses.',
    primaryStore: {
      id: 'coto',
      name: 'Coto CISA',
      badgeColor: 'bg-red-600'
    },
    otherStores: [
      { storeId: 'coto', storeName: 'Coto CISA', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 3850, stock: true, lastUpdated: 'Hace 15 min' },
      { storeId: 'dia', storeName: 'Super Día%', storeLogo: 'Día', storeColor: 'text-red-500 bg-red-50 dark:bg-red-900/40', price: 4100, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'carrefour', storeName: 'Carrefour', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 4890, stock: true, lastUpdated: 'Hace 30 min' },
      { storeId: 'jumbo', storeName: 'Jumbo', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 5450, stock: true, lastUpdated: 'Hace 2 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 5100, minPrice: 4200 },
      { date: '10 Jul', avgPrice: 5000, minPrice: 4100 },
      { date: '20 Jul', avgPrice: 4950, minPrice: 3950 },
      { date: '30 Jul', avgPrice: 4900, minPrice: 3850 }
    ]
  },
  {
    id: 'prod-2',
    name: 'Aceite de Oliva Extra Virgen Cocinero 500ml',
    brand: 'Cocinero',
    category: 'supermercados',
    subcategory: 'Aceites y Vinagres',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80',
    unit: 'Botella 500 ml',
    currentPrice: 9800,
    avgMarketPrice: 6900,
    status: 'INFLADO',
    percentageDiff: 42.0,
    rating: 2.1,
    description: 'Aceite de oliva extra virgen de primera prensada en frío.',
    primaryStore: {
      id: 'jumbo',
      name: 'Jumbo Palermo',
      badgeColor: 'bg-emerald-600'
    },
    otherStores: [
      { storeId: 'carrefour', storeName: 'Carrefour', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 6500, stock: true, lastUpdated: 'Hace 20 min' },
      { storeId: 'coto', storeName: 'Coto CISA', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 6800, stock: true, lastUpdated: 'Hace 10 min' },
      { storeId: 'dia', storeName: 'Super Día%', storeLogo: 'Día', storeColor: 'text-red-500 bg-red-50 dark:bg-red-900/40', price: 7200, stock: true, lastUpdated: 'Hace 3 horas' },
      { storeId: 'jumbo', storeName: 'Jumbo', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 9800, stock: true, lastUpdated: 'Hace 5 min' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 6500, minPrice: 6100 },
      { date: '10 Jul', avgPrice: 6600, minPrice: 6200 },
      { date: '20 Jul', avgPrice: 6800, minPrice: 6400 },
      { date: '30 Jul', avgPrice: 6900, minPrice: 6500 }
    ]
  },
  {
    id: 'prod-3',
    name: 'Ibupirac 600 mg x 10 Comprimidos',
    brand: 'Pfizer / Ibupirac',
    category: 'farmacia',
    subcategory: 'Medicamentos Venta Libre',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80',
    unit: 'Caja x 10 caps',
    currentPrice: 2400,
    avgMarketPrice: 2450,
    status: 'EN_PRECIO',
    percentageDiff: -2.0,
    rating: 4.5,
    description: 'Analgésico y antiinflamatorio para alivio rápido de dolores musculares y de cabeza.',
    primaryStore: {
      id: 'farmacity',
      name: 'Farmacity Centro',
      badgeColor: 'bg-teal-600'
    },
    otherStores: [
      { storeId: 'farmacity', storeName: 'Farmacity', storeLogo: 'FCT', storeColor: 'text-teal-600 bg-teal-100 dark:bg-teal-950/50', price: 2400, stock: true, lastUpdated: 'Hace 10 min' },
      { storeId: 'drahorro', storeName: 'Farmacia Dr. Ahorro', storeLogo: 'DRA', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 2250, stock: true, lastUpdated: 'Hace 45 min' },
      { storeId: 'carrefour', storeName: 'Carrefour Farmacia', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 2500, stock: true, lastUpdated: 'Hace 2 horas' },
      { storeId: 'coto', storeName: 'Coto Farmacia', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 2550, stock: false, lastUpdated: 'Hace 4 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 2200, minPrice: 2100 },
      { date: '10 Jul', avgPrice: 2300, minPrice: 2150 },
      { date: '20 Jul', avgPrice: 2400, minPrice: 2200 },
      { date: '30 Jul', avgPrice: 2450, minPrice: 2250 }
    ]
  },
  {
    id: 'prod-4',
    name: 'Smart TV Samsung 50" Crystal UHD 4K 4K 50CU7000',
    brand: 'Samsung',
    category: 'electro',
    subcategory: 'Televisores',
    image: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=600&q=80',
    unit: '1 unidad con control remoto Magic',
    currentPrice: 589999,
    avgMarketPrice: 720000,
    status: 'OFERTA',
    percentageDiff: -18.0,
    rating: 4.8,
    description: 'Televisor inteligente con resolución 4K Real, procesador Crystal 4K y PurColor integrados.',
    primaryStore: {
      id: 'fravega',
      name: 'Frávega Directo',
      badgeColor: 'bg-indigo-600'
    },
    otherStores: [
      { storeId: 'fravega', storeName: 'Frávega', storeLogo: 'FRV', storeColor: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/50', price: 589999, stock: true, lastUpdated: 'Hace 5 min' },
      { storeId: 'megatone', storeName: 'Megatone', storeLogo: 'MGT', storeColor: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50', price: 649999, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'jumbo', storeName: 'Jumbo Electro', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 749000, stock: true, lastUpdated: 'Hace 3 horas' },
      { storeId: 'coto', storeName: 'Coto Digital', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 780000, stock: true, lastUpdated: 'Hace 2 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 750000, minPrice: 680000 },
      { date: '10 Jul', avgPrice: 740000, minPrice: 650000 },
      { date: '20 Jul', avgPrice: 730000, minPrice: 620000 },
      { date: '30 Jul', avgPrice: 720000, minPrice: 589999 }
    ]
  },
  {
    id: 'prod-5',
    name: 'Taladro Atornillador Inalámbrico DeWalt 20V MAX DCD771',
    brand: 'DeWalt',
    category: 'ferreteria',
    subcategory: 'Herramientas Eléctricas',
    image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80',
    unit: 'Kit con 2 Baterías + Cargador + Maletín',
    currentPrice: 220000,
    avgMarketPrice: 165000,
    status: 'SOBREPRECIO',
    percentageDiff: 33.3,
    rating: 1.8,
    description: 'Motor de alto rendimiento con transmisión de dos velocidades (0-450 y 1500 RPM).',
    primaryStore: {
      id: 'easy',
      name: 'Easy San Isidro',
      badgeColor: 'bg-amber-600'
    },
    otherStores: [
      { storeId: 'mercadolibre', storeName: 'Tienda Oficial DeWalt', storeLogo: 'MELI', storeColor: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-950/50', price: 155000, stock: true, lastUpdated: 'Hace 12 min' },
      { storeId: 'sodimac', storeName: 'Sodimac', storeLogo: 'SOD', storeColor: 'text-blue-700 bg-blue-100 dark:bg-blue-950/50', price: 162000, stock: true, lastUpdated: 'Hace 40 min' },
      { storeId: 'ferreteriacentro', storeName: 'Ferretería Industrial', storeLogo: 'FER', storeColor: 'text-stone-700 bg-stone-200 dark:bg-stone-800', price: 168000, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'easy', storeName: 'Easy', storeLogo: 'EASY', storeColor: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50', price: 220000, stock: true, lastUpdated: 'Hace 10 min' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 158000, minPrice: 150000 },
      { date: '10 Jul', avgPrice: 160000, minPrice: 152000 },
      { date: '20 Jul', avgPrice: 162000, minPrice: 154000 },
      { date: '30 Jul', avgPrice: 165000, minPrice: 155000 }
    ]
  },
  {
    id: 'prod-6',
    name: 'Zapatillas Running Nike Revolution 7 Unisex',
    brand: 'Nike',
    category: 'ropa',
    subcategory: 'Calzado Deportivo',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80',
    unit: 'Par (Talles 38 a 45)',
    currentPrice: 89999,
    avgMarketPrice: 115000,
    status: 'OFERTA',
    percentageDiff: -21.7,
    rating: 4.7,
    description: 'Amortiguación de espuma suave y flexibilidad para carreras urbanas y entrenamiento diario.',
    primaryStore: {
      id: 'nike-store',
      name: 'Solo Deportes',
      badgeColor: 'bg-rose-600'
    },
    otherStores: [
      { storeId: 'solodeportes', storeName: 'Solo Deportes', storeLogo: 'SD', storeColor: 'text-rose-600 bg-rose-100 dark:bg-rose-950/50', price: 89999, stock: true, lastUpdated: 'Hace 8 min' },
      { storeId: 'dexter', storeName: 'Dexter Deportes', storeLogo: 'DEX', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 104999, stock: true, lastUpdated: 'Hace 2 horas' },
      { storeId: 'digitalsport', storeName: 'Digital Sport', storeLogo: 'DS', storeColor: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/50', price: 119999, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'sportline', storeName: 'Sportline', storeLogo: 'SPL', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 125000, stock: true, lastUpdated: 'Hace 5 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 120000, minPrice: 99000 },
      { date: '10 Jul', avgPrice: 118000, minPrice: 95000 },
      { date: '20 Jul', avgPrice: 116000, minPrice: 92000 },
      { date: '30 Jul', avgPrice: 115000, minPrice: 89999 }
    ]
  },
  {
    id: 'prod-7',
    name: 'Alimento Balanceado Royal Canin Medium Adult 15kg',
    brand: 'Royal Canin',
    category: 'mascotas',
    subcategory: 'Perros Adultos',
    image: 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?auto=format&fit=crop&w=600&q=80',
    unit: 'Bolsa 15 kg sellada',
    currentPrice: 72500,
    avgMarketPrice: 73000,
    status: 'EN_PRECIO',
    percentageDiff: -0.7,
    rating: 4.6,
    description: 'Nutrición específica para perros adultos de raza mediana (11 a 25 kg) de 1 a 7 años.',
    primaryStore: {
      id: 'puppis',
      name: 'Puppis Mascotas',
      badgeColor: 'bg-amber-600'
    },
    otherStores: [
      { storeId: 'puppis', storeName: 'Puppis', storeLogo: 'PUP', storeColor: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50', price: 72500, stock: true, lastUpdated: 'Hace 15 min' },
      { storeId: 'tiendanube-pet', storeName: 'Pet Market BA', storeLogo: 'PMB', storeColor: 'text-purple-600 bg-purple-100 dark:bg-purple-950/50', price: 71000, stock: true, lastUpdated: 'Hace 3 horas' },
      { storeId: 'jumbo', storeName: 'Jumbo Mascotas', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 78500, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'coto', storeName: 'Coto Mascotas', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 79900, stock: true, lastUpdated: 'Hace 4 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 71000, minPrice: 69000 },
      { date: '10 Jul', avgPrice: 72000, minPrice: 70000 },
      { date: '20 Jul', avgPrice: 72500, minPrice: 70500 },
      { date: '30 Jul', avgPrice: 73000, minPrice: 71000 }
    ]
  },
  {
    id: 'prod-8',
    name: 'Leche Larga Vida Entera La Serenísima 1 Litro',
    brand: 'La Serenísima',
    category: 'supermercados',
    subcategory: 'Lácteos y Bebidas',
    image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=600&q=80',
    unit: 'Tetra Brik 1 L',
    currentPrice: 1520,
    avgMarketPrice: 1480,
    status: 'EN_PRECIO',
    percentageDiff: 2.7,
    rating: 4.3,
    description: 'Leche entera ultrapasteurizada fortificada con vitaminas A, D y calcio.',
    primaryStore: {
      id: 'carrefour',
      name: 'Carrefour Express',
      badgeColor: 'bg-blue-600'
    },
    otherStores: [
      { storeId: 'dia', storeName: 'Super Día%', storeLogo: 'Día', storeColor: 'text-red-500 bg-red-50 dark:bg-red-900/40', price: 1390, stock: true, lastUpdated: 'Hace 5 min' },
      { storeId: 'coto', storeName: 'Coto CISA', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 1450, stock: true, lastUpdated: 'Hace 20 min' },
      { storeId: 'carrefour', storeName: 'Carrefour', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 1520, stock: true, lastUpdated: 'Hace 10 min' },
      { storeId: 'jumbo', storeName: 'Jumbo Disco', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 1650, stock: true, lastUpdated: 'Hace 2 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 1380, minPrice: 1300 },
      { date: '10 Jul', avgPrice: 1420, minPrice: 1320 },
      { date: '20 Jul', avgPrice: 1450, minPrice: 1350 },
      { date: '30 Jul', avgPrice: 1480, minPrice: 1390 }
    ]
  },
  {
    id: 'prod-9',
    name: 'Detergente Lavavajillas Magistral Ultra Limón 500ml',
    brand: 'Magistral',
    category: 'supermercados',
    subcategory: 'Limpieza del Hogar',
    image: 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=600&q=80',
    unit: 'Botella 500 ml',
    currentPrice: 3200,
    avgMarketPrice: 2200,
    status: 'INFLADO',
    percentageDiff: 45.4,
    rating: 2.0,
    description: 'Fórmula rinde 5 veces más con activo desgrazante instantáneo.',
    primaryStore: {
      id: 'jumbo',
      name: 'Jumbo Belgrano',
      badgeColor: 'bg-emerald-600'
    },
    otherStores: [
      { storeId: 'dia', storeName: 'Super Día%', storeLogo: 'Día', storeColor: 'text-red-500 bg-red-50 dark:bg-red-900/40', price: 1950, stock: true, lastUpdated: 'Hace 10 min' },
      { storeId: 'coto', storeName: 'Coto CISA', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 2100, stock: true, lastUpdated: 'Hace 15 min' },
      { storeId: 'carrefour', storeName: 'Carrefour', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 2250, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'jumbo', storeName: 'Jumbo', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 3200, stock: true, lastUpdated: 'Hace 25 min' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 2000, minPrice: 1800 },
      { date: '10 Jul', avgPrice: 2100, minPrice: 1850 },
      { date: '20 Jul', avgPrice: 2150, minPrice: 1900 },
      { date: '30 Jul', avgPrice: 2200, minPrice: 1950 }
    ]
  },
  {
    id: 'prod-10',
    name: 'Crema Hidratante Facial Nivea Soft 200ml',
    brand: 'Nivea',
    category: 'farmacia',
    subcategory: 'Cuidado Facial',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=600&q=80',
    unit: 'Pote 200 ml',
    currentPrice: 4800,
    avgMarketPrice: 6200,
    status: 'OFERTA',
    percentageDiff: -22.5,
    rating: 4.9,
    description: 'Enriquecida con Aceite de Jojoba y Vitamina E de rápida absorción.',
    primaryStore: {
      id: 'farmacity',
      name: 'Farmacity Online',
      badgeColor: 'bg-teal-600'
    },
    otherStores: [
      { storeId: 'farmacity', storeName: 'Farmacity', storeLogo: 'FCT', storeColor: 'text-teal-600 bg-teal-100 dark:bg-teal-950/50', price: 4800, stock: true, lastUpdated: 'Hace 8 min' },
      { storeId: 'pigmento', storeName: 'Perfumerías Pigmento', storeLogo: 'PIG', storeColor: 'text-purple-600 bg-purple-100 dark:bg-purple-950/50', price: 5400, stock: true, lastUpdated: 'Hace 2 horas' },
      { storeId: 'coto', storeName: 'Coto Perfumería', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 6500, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'jumbo', storeName: 'Jumbo Perfumes', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 6800, stock: true, lastUpdated: 'Hace 3 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 6000, minPrice: 5000 },
      { date: '10 Jul', avgPrice: 6100, minPrice: 4900 },
      { date: '20 Jul', avgPrice: 6150, minPrice: 4850 },
      { date: '30 Jul', avgPrice: 6200, minPrice: 4800 }
    ]
  },
  {
    id: 'prod-11',
    name: 'Pintura Látex Interior AlbaMatte Blanco 20 Litros',
    brand: 'Alba',
    category: 'ferreteria',
    subcategory: 'Pinturas y Impermeabilizantes',
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=600&q=80',
    unit: 'Balde 20 L',
    currentPrice: 94000,
    avgMarketPrice: 96000,
    status: 'EN_PRECIO',
    percentageDiff: -2.1,
    rating: 4.4,
    description: 'Látex lavable antihongos de máximo cubritivo y acabo mate terciopelo.',
    primaryStore: {
      id: 'easy',
      name: 'Easy Avellaneda',
      badgeColor: 'bg-amber-600'
    },
    otherStores: [
      { storeId: 'easy', storeName: 'Easy', storeLogo: 'EASY', storeColor: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50', price: 94000, stock: true, lastUpdated: 'Hace 20 min' },
      { storeId: 'sodimac', storeName: 'Sodimac', storeLogo: 'SOD', storeColor: 'text-blue-700 bg-blue-100 dark:bg-blue-950/50', price: 92500, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'pintureria', storeName: 'Pinturerías Rex', storeLogo: 'REX', storeColor: 'text-rose-600 bg-rose-100 dark:bg-rose-950/50', price: 97000, stock: true, lastUpdated: 'Hace 3 horas' },
      { storeId: 'prestigio', storeName: 'Pinturerías Prestigio', storeLogo: 'PRE', storeColor: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/50', price: 101000, stock: true, lastUpdated: 'Hace 5 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 92000, minPrice: 89000 },
      { date: '10 Jul', avgPrice: 94000, minPrice: 90000 },
      { date: '20 Jul', avgPrice: 95000, minPrice: 91500 },
      { date: '30 Jul', avgPrice: 96000, minPrice: 92500 }
    ]
  },
  {
    id: 'prod-12',
    name: 'Campera Inflable Puffer Térmica Negra Hombre',
    brand: 'Montagne / Kebvingston',
    category: 'ropa',
    subcategory: 'Indumentaria Invierno',
    image: 'https://images.unsplash.com/photo-1544441893-675973e31985?auto=format&fit=crop&w=600&q=80',
    unit: '1 unidad (Talles S a XXL)',
    currentPrice: 115000,
    avgMarketPrice: 85000,
    status: 'SOBREPRECIO',
    percentageDiff: 35.3,
    rating: 1.9,
    description: 'Campera de abrigo ligera repelente al agua con relleno de plumas sintéticas.',
    primaryStore: {
      id: 'falabella-replica',
      name: 'Galería Shopping Center',
      badgeColor: 'bg-rose-600'
    },
    otherStores: [
      { storeId: 'mercadolibre', storeName: 'Mercado Libre Oficial', storeLogo: 'MELI', storeColor: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-950/50', price: 79000, stock: true, lastUpdated: 'Hace 10 min' },
      { storeId: 'zara', storeName: 'Zara Argentina', storeLogo: 'ZARA', storeColor: 'text-stone-900 bg-stone-100 dark:bg-stone-800', price: 89000, stock: true, lastUpdated: 'Hace 2 horas' },
      { storeId: 'dafiti', storeName: 'Dafiti Moda', storeLogo: 'DAF', storeColor: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-950/50', price: 82000, stock: true, lastUpdated: 'Hace 4 horas' },
      { storeId: 'galeria', storeName: 'Galería Shopping Center', storeLogo: 'GAL', storeColor: 'text-rose-600 bg-rose-100 dark:bg-rose-950/50', price: 115000, stock: true, lastUpdated: 'Hace 15 min' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 82000, minPrice: 75000 },
      { date: '10 Jul', avgPrice: 83500, minPrice: 76000 },
      { date: '20 Jul', avgPrice: 84000, minPrice: 78000 },
      { date: '30 Jul', avgPrice: 85000, minPrice: 79000 }
    ]
  },
  {
    id: 'prod-13',
    name: 'Smartphone Motorola Moto G54 5G 256GB Verde',
    brand: 'Motorola',
    category: 'electro',
    subcategory: 'Celulares y Smarphones',
    image: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80',
    unit: '1 unidad libre para cualquier empresa',
    currentPrice: 289999,
    avgMarketPrice: 340000,
    status: 'OFERTA',
    percentageDiff: -14.7,
    rating: 4.8,
    description: 'Pantalla 6.5" FHD+ 120Hz, cámara principal 50 MP con OIS y batería de 5000 mAh.',
    primaryStore: {
      id: 'fravega',
      name: 'Frávega',
      badgeColor: 'bg-indigo-600'
    },
    otherStores: [
      { storeId: 'fravega', storeName: 'Frávega', storeLogo: 'FRV', storeColor: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/50', price: 289999, stock: true, lastUpdated: 'Hace 5 min' },
      { storeId: 'personal', storeName: 'Tienda Personal', storeLogo: 'PER', storeColor: 'text-sky-600 bg-sky-100 dark:bg-sky-950/50', price: 310000, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'movistar', storeName: 'Tienda Movistar', storeLogo: 'MOV', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 335000, stock: true, lastUpdated: 'Hace 3 horas' },
      { storeId: 'coto', storeName: 'Coto Digital Electro', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 360000, stock: true, lastUpdated: 'Hace 2 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 355000, minPrice: 310000 },
      { date: '10 Jul', avgPrice: 350000, minPrice: 300000 },
      { date: '20 Jul', avgPrice: 345000, minPrice: 295000 },
      { date: '30 Jul', avgPrice: 340000, minPrice: 289999 }
    ]
  },
  {
    id: 'prod-14',
    name: 'Café Molido Cabrales Planta de Café 500g',
    brand: 'Cabrales',
    category: 'supermercados',
    subcategory: 'Almacén y Cafetería',
    image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=600&q=80',
    unit: 'Paquete 500 g',
    currentPrice: 7900,
    avgMarketPrice: 8100,
    status: 'EN_PRECIO',
    percentageDiff: -2.4,
    rating: 4.5,
    description: 'Café tostado molido equilibrio justo aroma intenso tostado medio.',
    primaryStore: {
      id: 'coto',
      name: 'Coto Flores',
      badgeColor: 'bg-red-600'
    },
    otherStores: [
      { storeId: 'coto', storeName: 'Coto CISA', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 7900, stock: true, lastUpdated: 'Hace 12 min' },
      { storeId: 'carrefour', storeName: 'Carrefour', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 8050, stock: true, lastUpdated: 'Hace 45 min' },
      { storeId: 'jumbo', storeName: 'Jumbo', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 8300, stock: true, lastUpdated: 'Hace 2 horas' },
      { storeId: 'dia', storeName: 'Super Día%', storeLogo: 'Día', storeColor: 'text-red-500 bg-red-50 dark:bg-red-900/40', price: 8200, stock: true, lastUpdated: 'Hace 1 hora' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 7800, minPrice: 7500 },
      { date: '10 Jul', avgPrice: 7950, minPrice: 7650 },
      { date: '20 Jul', avgPrice: 8050, minPrice: 7800 },
      { date: '30 Jul', avgPrice: 8100, minPrice: 7900 }
    ]
  },
  {
    id: 'prod-15',
    name: 'Shampoo Sedal Cerámicas 650ml con Dosificador',
    brand: 'Sedal',
    category: 'farmacia',
    subcategory: 'Higiene y Cabello',
    image: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&w=600&q=80',
    unit: 'Botella 650 ml',
    currentPrice: 5100,
    avgMarketPrice: 3400,
    status: 'INFLADO',
    percentageDiff: 50.0,
    rating: 1.7,
    description: 'Fórmula con Micro-Cerámicas que sellan las cutículas para brillo extremo.',
    primaryStore: {
      id: 'farmacity',
      name: 'Farmacity Recoleta',
      badgeColor: 'bg-teal-600'
    },
    otherStores: [
      { storeId: 'dia', storeName: 'Super Día%', storeLogo: 'Día', storeColor: 'text-red-500 bg-red-50 dark:bg-red-900/40', price: 3100, stock: true, lastUpdated: 'Hace 10 min' },
      { storeId: 'coto', storeName: 'Coto CISA', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 3250, stock: true, lastUpdated: 'Hace 25 min' },
      { storeId: 'carrefour', storeName: 'Carrefour', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 3500, stock: true, lastUpdated: 'Hace 1 hora' },
      { storeId: 'farmacity', storeName: 'Farmacity', storeLogo: 'FCT', storeColor: 'text-teal-600 bg-teal-100 dark:bg-teal-950/50', price: 5100, stock: true, lastUpdated: 'Hace 5 min' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 3100, minPrice: 2900 },
      { date: '10 Jul', avgPrice: 3200, minPrice: 3000 },
      { date: '20 Jul', avgPrice: 3300, minPrice: 3050 },
      { date: '30 Jul', avgPrice: 3400, minPrice: 3100 }
    ]
  },
  {
    id: 'prod-16',
    name: 'Juego de Sartenes Antiadherentes Tefal Cook & Clean 3 Pzs',
    brand: 'Tefal',
    category: 'supermercados',
    subcategory: 'Bazar y Cocina',
    image: 'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80',
    unit: 'Set 3 sartenes (20, 24 y 28cm)',
    currentPrice: 42900,
    avgMarketPrice: 56000,
    status: 'OFERTA',
    percentageDiff: -23.4,
    rating: 4.9,
    description: 'Indicador de temperatura Thermo-Signal y recubrimiento antiadherente de titanio.',
    primaryStore: {
      id: 'carrefour',
      name: 'Carrefour Hiper',
      badgeColor: 'bg-blue-600'
    },
    otherStores: [
      { storeId: 'carrefour', storeName: 'Carrefour', storeLogo: 'CRF', storeColor: 'text-blue-600 bg-blue-100 dark:bg-blue-950/50', price: 42900, stock: true, lastUpdated: 'Hace 15 min' },
      { storeId: 'coto', storeName: 'Coto CISA', storeLogo: 'Coto', storeColor: 'text-red-600 bg-red-100 dark:bg-red-950/50', price: 49900, stock: true, lastUpdated: 'Hace 30 min' },
      { storeId: 'easy', storeName: 'Easy Hogar', storeLogo: 'EASY', storeColor: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50', price: 58000, stock: true, lastUpdated: 'Hace 2 horas' },
      { storeId: 'jumbo', storeName: 'Jumbo Bazaar', storeLogo: 'JMB', storeColor: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50', price: 62000, stock: true, lastUpdated: 'Hace 4 horas' }
    ],
    priceHistory: [
      { date: '01 Jul', avgPrice: 58000, minPrice: 49000 },
      { date: '10 Jul', avgPrice: 57500, minPrice: 47000 },
      { date: '20 Jul', avgPrice: 56800, minPrice: 45000 },
      { date: '30 Jul', avgPrice: 56000, minPrice: 42900 }
    ]
  }
];

export const CITIES_LIST = [
  'Alta Gracia'
];
