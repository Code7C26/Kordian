const express = require('express')
const cors = require('cors')

const app = express()

app.use(cors())
app.use(express.json())

// =========================
// BASE TEMPORAL
// =========================

let products = [
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
    ],
  },
]

// =========================
// GET PRODUCTS
// =========================

app.get('/products', (req, res) => {
  res.json(products)
})

// =========================
// CREATE PRODUCT
// =========================

app.post('/products', (req, res) => {
  const newProduct = req.body

  const existingProduct =
    products.find(
      (product) =>
        product.name
          .toLowerCase()
          .trim() ===
          newProduct.name
            .toLowerCase()
            .trim() &&

        product.brand
          .toLowerCase()
          .trim() ===
          newProduct.brand
            .toLowerCase()
            .trim()
    )

  // SI EXISTE

  if (existingProduct) {
    const newOffer =
      newProduct.offers[0]

    const alreadyExists =
      existingProduct.offers.some(
        (offer) =>
          offer.supermarket ===
          newOffer.supermarket
      )

    if (!alreadyExists) {
      existingProduct.offers.push(
        newOffer
      )
    }

    return res.json({
      message:
        'Oferta agregada',

      product:
        existingProduct,
    })
  }

  // SI NO EXISTE

  const productToCreate = {
    id: products.length + 1,

    ...newProduct,
  }

  products.push(productToCreate)

  res.json({
    message:
      'Producto creado',

    product: productToCreate,
  })
})

// =========================
// UPDATE PRODUCT
// =========================

app.put(
  '/products/:id',
  (req, res) => {
    const id = Number(
      req.params.id
    )

    const updatedProduct =
      req.body

    const productIndex =
      products.findIndex(
        (product) =>
          product.id === id
      )

    if (
      productIndex === -1
    ) {
      return res
        .status(404)
        .json({
          message:
            'Producto no encontrado',
        })
    }

    products[productIndex] =
      {
        ...products[
          productIndex
        ],

        ...updatedProduct,
      }

    res.json({
      message:
        'Producto actualizado',

      product:
        products[
          productIndex
        ],
    })
  }
)

// =========================
// DELETE PRODUCT
// =========================

app.delete(
  '/products/:id',
  (req, res) => {
    const id = Number(
      req.params.id
    )

    products = products.filter(
      (product) =>
        product.id !== id
    )

    res.json({
      message:
        'Producto eliminado',
    })
  }
)

// =========================
// SERVER
// =========================

app.listen(3000, () => {
  console.log(
    '🚀 SERVER RUNNING ON 3000'
  )
})