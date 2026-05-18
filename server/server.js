const express = require('express')
const cors = require('cors')

const app = express()

app.use(cors())
app.use(express.json())

// =========================
// DATOS (TEMPORALES)
// luego esto va a PostgreSQL
// =========================

const products = [
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
      },
      {
        supermarket: 'Coto',
        cashPrice: 1390,
      },
      {
        supermarket: 'Jumbo',
        cashPrice: 1510,
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
      },
      {
        supermarket: 'Coto',
        cashPrice: 1990,
      },
      {
        supermarket: 'Jumbo',
        cashPrice: 2150,
      },
    ],
  },

  {
    id: 3,
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
    ],
  },
]

// =========================
// ENDPOINT PRINCIPAL
// =========================

app.get('/products', (req, res) => {
  const { category, supermarket, search } = req.query

  let result = products

  // 🔍 filtro por categoría
  if (category && category !== 'Todas') {
    result = result.filter(
      (p) => p.category === category
    )
  }

  // 🔍 filtro por búsqueda
  if (search) {
    result = result.filter((p) =>
      p.name
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  }

  // 🏪 filtro por supermercado
  if (supermarket && supermarket !== 'Todos') {
    result = result.filter((p) =>
      p.offers.some(
        (o) =>
          o.supermarket === supermarket
      )
    )
  }

  res.json(result)
})

// =========================
// TEST API
// =========================

app.get('/', (req, res) => {
  res.send('AR-PRICE API funcionando 🚀')
})

// =========================
// SERVER
// =========================

app.listen(3000, () => {
  console.log('Servidor en puerto 3000 🚀')
})