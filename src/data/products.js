const products = [
  // =========================
  // CANASTA BÁSICA
  // =========================

  {
    id: 1,
    name: 'Leche La Serenísima 1L',
    category: 'Canasta Básica',
    brand: 'La Serenísima',
    rating: 4.8,

    offers: [
      {
        supermarket: 'Carrefour',
        cashPrice: 1450,
        installments: null,
      },

      {
        supermarket: 'Coto',
        cashPrice: 1390,
        installments: null,
      },

      {
        supermarket: 'Disco',
        cashPrice: 1490,
        installments: null,
      },

      {
        supermarket: 'Jumbo',
        cashPrice: 1510,
        installments: null,
      },
    ],
  },

  {
    id: 2,
    name: 'Arroz Gallo Oro 1Kg',
    category: 'Canasta Básica',
    brand: 'Gallo',
    rating: 4.7,

    offers: [
      {
        supermarket: 'Carrefour',
        cashPrice: 2100,
        installments: null,
      },

      {
        supermarket: 'Coto',
        cashPrice: 1990,
        installments: null,
      },

      {
        supermarket: 'Disco',
        cashPrice: 2200,
        installments: null,
      },

      {
        supermarket: 'Jumbo',
        cashPrice: 2150,
        installments: null,
      },
    ],
  },

  {
    id: 3,
    name: 'Aceite Natura 1.5L',
    category: 'Canasta Básica',
    brand: 'Natura',
    rating: 4.9,

    offers: [
      {
        supermarket: 'Carrefour',
        cashPrice: 4800,
        installments: null,
      },

      {
        supermarket: 'Coto',
        cashPrice: 4550,
        installments: null,
      },

      {
        supermarket: 'Disco',
        cashPrice: 4990,
        installments: null,
      },

      {
        supermarket: 'Jumbo',
        cashPrice: 5100,
        installments: null,
      },
    ],
  },

  // =========================
  // ELECTRODOMÉSTICOS
  // =========================

  {
    id: 4,
    name: 'Heladera Samsung No Frost',
    category: 'Electrodomésticos',
    brand: 'Samsung',
    rating: 4.9,

    offers: [
      {
        supermarket: 'Frávega',
        cashPrice: 1250000,

        installments: {
          quantity: 12,
          installmentPrice: 145000,
        },
      },

      {
        supermarket: 'Musimundo',
        cashPrice: 1190000,

        installments: {
          quantity: 9,
          installmentPrice: 160000,
        },
      },

      {
        supermarket: 'Coto',
        cashPrice: 1215000,

        installments: {
          quantity: 6,
          installmentPrice: 230000,
        },
      },
    ],
  },

  {
    id: 5,
    name: 'Heladera LG Smart Cooling',
    category: 'Electrodomésticos',
    brand: 'LG',
    rating: 4.8,

    offers: [
      {
        supermarket: 'Frávega',
        cashPrice: 1320000,

        installments: {
          quantity: 12,
          installmentPrice: 152000,
        },
      },

      {
        supermarket: 'Musimundo',
        cashPrice: 1280000,

        installments: {
          quantity: 9,
          installmentPrice: 171000,
        },
      },
    ],
  },

  {
    id: 6,
    name: 'Microondas BGH QuickHeat',
    category: 'Electrodomésticos',
    brand: 'BGH',
    rating: 4.6,

    offers: [
      {
        supermarket: 'Frávega',
        cashPrice: 210000,

        installments: {
          quantity: 12,
          installmentPrice: 24000,
        },
      },

      {
        supermarket: 'Musimundo',
        cashPrice: 199000,

        installments: {
          quantity: 6,
          installmentPrice: 39000,
        },
      },

      {
        supermarket: 'Carrefour',
        cashPrice: 205000,

        installments: {
          quantity: 3,
          installmentPrice: 76000,
        },
      },
    ],
  },

  {
    id: 7,
    name: 'Pava Eléctrica Philips',
    category: 'Electrodomésticos',
    brand: 'Philips',
    rating: 4.7,

    offers: [
      {
        supermarket: 'Carrefour',
        cashPrice: 85000,

        installments: {
          quantity: 6,
          installmentPrice: 16500,
        },
      },

      {
        supermarket: 'Coto',
        cashPrice: 79900,

        installments: {
          quantity: 3,
          installmentPrice: 29500,
        },
      },

      {
        supermarket: 'Frávega',
        cashPrice: 89000,

        installments: {
          quantity: 12,
          installmentPrice: 9800,
        },
      },
    ],
  },

  {
    id: 8,
    name: 'Notebook Lenovo IdeaPad',
    category: 'Tecnología',
    brand: 'Lenovo',
    rating: 4.9,

    offers: [
      {
        supermarket: 'Frávega',
        cashPrice: 1750000,

        installments: {
          quantity: 12,
          installmentPrice: 198000,
        },
      },

      {
        supermarket: 'Musimundo',
        cashPrice: 1690000,

        installments: {
          quantity: 9,
          installmentPrice: 215000,
        },
      },

      {
        supermarket: 'Carrefour',
        cashPrice: 1720000,

        installments: {
          quantity: 6,
          installmentPrice: 320000,
        },
      },
    ],
  },
]

export default products