require('dotenv').config()

const express = require('express')
const cors = require('cors')

const pool = require('./src/config/db')

const app = express()

app.use(cors())
app.use(express.json())

// =========================
// ENDPOINT PRINCIPAL
// =========================

app.get('/products', async (req, res) => {
  try {
    const { category, search } = req.query

    let query = 'SELECT * FROM products'
    let values = []

    // 🔍 filtro por categoría
    if (category && category !== 'Todas') {
      values.push(category)

      query += ` WHERE category = $${values.length}`
    }

    // 🔍 filtro por búsqueda
    if (search) {
      values.push(`%${search}%`)

      if (query.includes('WHERE')) {
        query += ` AND name ILIKE $${values.length}`
      } else {
        query += ` WHERE name ILIKE $${values.length}`
      }
    }

    const result = await pool.query(query, values)

    res.json(result.rows)

  } catch (error) {
    console.log(error)

    res.status(500).json({
      error: 'Error obteniendo productos'
    })
  }
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

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT} 🚀`)
})