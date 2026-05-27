const express = require('express')
const cors = require('cors')

const multer = require('multer')
const csv = require('csv-parser')
const fs = require('fs')

const supabase = require('./supabase')

const app = express()
// =====================================
// CACHE
// =====================================

let productsCache = null

let cacheTimestamp = 0

const CACHE_DURATION =
  30000 // 30 segundos
app.use(cors())
app.use(express.json())

// =====================================
// MULTER
// =====================================

const upload = multer({
  storage: multer.diskStorage({

    destination: function (
      req,
      file,
      cb
    ) {

      cb(null, 'uploads/')
    },

    filename: function (
      req,
      file,
      cb
    ) {

      cb(
        null,

        Date.now() +
          '-' +
          file.originalname
      )
    },
  }),
})

// =====================================
// PRODUCTS
// =====================================

// =====================================
// GET PRODUCTS
// PAGINATION + SEARCH + CACHE
// =====================================

app.get('/products', async (req, res) => {

  try {

    // =====================================
    // QUERY PARAMS
    // =====================================

    const page =
      parseInt(req.query.page) || 1

    const limit =
      parseInt(req.query.limit) || 20

    const search =
      req.query.search || ''

    const start =
      (page - 1) * limit

    const end =
      start + limit - 1

    // =====================================
    // CACHE KEY
    // =====================================

    const cacheKey =
      `${page}-${limit}-${search}`

    // =====================================
    // INIT CACHE OBJECT
    // =====================================

    if (!global.productsCache) {

      global.productsCache = {}
    }

    // =====================================
    // RETURN CACHE
    // =====================================

    const cache =
      global.productsCache[
        cacheKey
      ]

    if (

      cache &&

      Date.now() -
        cache.timestamp <
        30000

    ) {

      console.log(
        'RETURNING CACHE'
      )

      return res.json(
        cache.data
      )
    }

    // =====================================
    // GET PRODUCTS
    // =====================================

    let query = supabase

      .from('products')

      .select('*')

    // SEARCH

    if (search) {

      query =
        query.or(
          `name.ilike.%${search}%,
           brand.ilike.%${search}%`
        )
    }

    // PAGINATION

    query =
      query.range(
        start,
        end
      )

    const {
      data: products,
      error: productsError,
    } = await query

    if (productsError) {

      return res.status(500).json({
        error:
          productsError.message,
      })
    }

    // =====================================
    // GET OFFERS
    // =====================================

    const productIds =
      products.map(
        (p) => p.id
      )

    const {
      data: offers,
      error: offersError,
    } = await supabase

      .from('offers')

      .select('*')

      .in(
        'product_id',
        productIds
      )

    if (offersError) {

      return res.status(500).json({
        error:
          offersError.message,
      })
    }

    // =====================================
    // OFFERS MAP
    // =====================================

    const offersMap = {}

    offers.forEach((offer) => {

      if (
        !offersMap[
          offer.product_id
        ]
      ) {

        offersMap[
          offer.product_id
        ] = []
      }

      offersMap[
        offer.product_id
      ].push(offer)
    })

    // =====================================
    // FINAL PRODUCTS
    // =====================================

    const finalProducts =
      products.map((product) => ({

        ...product,

        offers:
          offersMap[
            product.id
          ] || [],
      }))

    // =====================================
    // SAVE CACHE
    // =====================================

    global.productsCache[
      cacheKey
    ] = {

      data:
        finalProducts,

      timestamp:
        Date.now(),
    }

    console.log(
      'CACHE UPDATED'
    )

    res.json(finalProducts)

  }

  catch (err) {

    console.log(err)

    res.status(500).json({
      error:
        'Internal server error',
    })
  }
})
// =====================================
// CSV UPLOAD
// =====================================

app.post(
  '/upload-csv',
  upload.single('file'),

  async (req, res) => {

    const results = []

    fs.createReadStream(req.file.path)
      .pipe(csv({
        separator: ';',
        skipLines: 0
      }))
      .on('data', (data) => {
        results.push(data)
      })
      .on('end', async () => {

        try {

          const { data: allProducts } =
            await supabase.from('products').select('*')

          const { data: allOffers } =
            await supabase.from('offers').select('*')

          for (const row of results) {

            // =====================================
            // VALIDACIÓN REAL
            // =====================================

            const name = row.name?.trim()
            const brand = row.brand?.trim()
            const category = row.category?.trim()
            const rating = row.rating
            const image = row.image
            const supermarket = row.supermarket?.trim()
            const cashPrice = row.cashPrice
            const installmentsQuantity = row.installmentsQuantity
            const installmentPrice = row.installmentPrice

            if (!name || !brand || !supermarket) {
              console.log('FILA INVALIDA IGNORADA')
              continue
            }

            // =====================================
            // PRODUCTO EXISTENTE
            // =====================================

            let existingProduct = allProducts.find(
              (p) =>
                p.name?.toLowerCase() === name.toLowerCase() &&
                p.brand?.toLowerCase() === brand.toLowerCase()
            )

            let productId

            // =====================================
            // CREAR PRODUCTO
            // =====================================

            if (!existingProduct) {

              const { data: newProduct, error } =
                await supabase.from('products')
                  .insert([{
                    name,
                    category,
                    brand,
                    rating,
                    image
                  }])
                  .select()

              if (error || !newProduct?.length) {
                console.log('ERROR PRODUCTO:', error)
                continue
              }

              productId = newProduct[0].id

            } else {
              productId = existingProduct.id
            }

            // =====================================
            // OFFER EXISTENTE
            // =====================================

            let repeatedOffer = allOffers.find(
              (o) =>
                o.product_id === productId &&
                o.supermarket?.toLowerCase() === supermarket.toLowerCase()
            )

            // =====================================
            // UPDATE OFFER
            // =====================================

            if (repeatedOffer) {

              await supabase
                .from('offers')
                .update({
                  cash_price: cashPrice,
                  installments_quantity: installmentsQuantity || null,
                  installment_price: installmentPrice || null,
                })
                .eq('id', repeatedOffer.id)

            } else {

              // =====================================
              // CREATE OFFER
              // =====================================

              await supabase
                .from('offers')
                .insert([{
                  product_id: productId,
                  supermarket,
                  cash_price: cashPrice,
                  installments_quantity: installmentsQuantity || null,
                  installment_price: installmentPrice || null,
                }])
            }
          }

          fs.unlinkSync(req.file.path)

          global.productsCache = {}

          res.json({ success: true })

        } catch (err) {
          console.log(err)
          res.status(500).json({ error: err.message })
        }
      })
  }
)

// =====================================
// UPDATE PRODUCT
// =====================================

app.put(
  '/products/:id',

  async (req, res) => {

    const { id } = req.params

    const {

      name,
      category,
      brand,
      rating,
      image,

    } = req.body

    const { error } =
      await supabase
        .from('products')
        .update({

          name,
          category,
          brand,
          rating,
          image,
        })
        .eq('id', id)

    if (error) {

      return res.status(500).json({
        error: error.message,
      })
    }
    global.productsCache = {}
    res.json({
      success: true,
    })
  }
)

// =====================================
// DELETE PRODUCT
// =====================================

app.delete(
  '/products/:id',

  async (req, res) => {

    const { id } = req.params

    await supabase
      .from('offers')
      .delete()
      .eq(
        'product_id',
        id
      )

    await supabase
      .from('products')
      .delete()
      .eq('id', id)
    global.productsCache = {}
    res.json({
      success: true,
    })
  }
)

// =====================================
// UPDATE OFFER
// =====================================

app.put(
  '/offers/:id',

  async (req, res) => {

    const { id } = req.params

    const {

      cash_price,
      installments_quantity,
      installment_price,

    } = req.body

    const { error } =
      await supabase
        .from('offers')
        .update({

          cash_price,

          installments_quantity,

          installment_price,
        })
        .eq('id', id)

    if (error) {

      return res.status(500).json({
        error: error.message,
      })
    }
    global.productsCache = {}
    res.json({
      success: true,
    })
  }
)

// =====================================
// DELETE OFFER
// =====================================

app.delete(
  '/offers/:id',

  async (req, res) => {

    const { id } = req.params

    await supabase
      .from('offers')
      .delete()
      .eq('id', id)
    global.productsCache = {}
    res.json({
      success: true,
    })
  }
)

// =====================================
// ADMINS
// =====================================

app.get('/admins', async (req, res) => {

  const {
    data,
    error,
  } = await supabase
    .from('admins')
    .select('*')

  if (error) {

    return res.status(500).json({
      error: error.message,
    })
  }

  res.json(data)
})

app.post('/admins', async (req, res) => {

  const {
    username,
    password,
  } = req.body

  const { error } =
    await supabase
      .from('admins')
      .insert([
        {
          username,
          password,
        },
      ])

  if (error) {

    return res.status(500).json({
      error: error.message,
    })
  }
  global.productsCache = {}
  res.json({
    success: true,
  })
})

// =====================================
// LOGIN
// =====================================

app.post('/login', async (req, res) => {

  const {
    username,
    password,
  } = req.body

  const {
    data,
    error,
  } = await supabase
    .from('admins')
    .select('*')
    .eq(
      'username',
      username
    )
    .eq(
      'password',
      password
    )

  if (error) {

    return res.status(500).json({
      error: error.message,
    })
  }

  if (data.length === 0) {

    return res.status(401).json({
      error:
        'Credenciales incorrectas',
    })
  }
  global.productsCache = {}
  res.json({
    success: true,
  })
})

// =====================================
// SERVER
// =====================================

app.listen(3000, () => {

  console.log(
    'SERVER RUNNING ON PORT 3000'
  )
})