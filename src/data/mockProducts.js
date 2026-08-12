export const CITIES_LIST = [
  'Alta Gracia',
];

export const CATEGORIES = [
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

export const MOCK_PRODUCTS = [
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
    name: 'Smart TV Samsung 50" Crystal UHD 4K',
    brand: 'Samsung',
    category: 'electro',
    subcategory: 'Televisores',
    image: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=600&q=80',
    unit: '1 unidad',
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
  }
];
