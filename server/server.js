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

    .select(`
      *,
      categories (
        id,
        name
      ),
      brands (
        id,
        name
      )
    `)

    // SEARCH

    query =
      query.ilike(
        'name',
        `%${search}%`
      )

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
// PRODUCTOS AGRUPADOS
// =====================================

  const groupedProducts = []

  for (const product of products) {

    const existing = groupedProducts.find(
      (p) =>
        p.name.trim().toLowerCase() ===
        product.name.trim().toLowerCase()
    )

    if (!existing) {

      groupedProducts.push({
        ...product,
        offers: offersMap[product.id] || [],
      })

    } else {

      existing.offers.push(
        ...(offersMap[product.id] || [])
      )

    }

  }

// =====================================
// SAVE CACHE
// =====================================

global.productsCache[cacheKey] = {
  data: groupedProducts,
  timestamp: Date.now(),
}

console.log("CACHE UPDATED")

res.json(groupedProducts)

} catch (err) {

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

          console.log("FILA CSV RECIBIDA:")
          console.log(data)

          results.push(data)
        })
      .on('end', async () => {

        try {

          const { data: allProducts } =
            await supabase.from('products').select('*')
          const { data: allOffers } =
            await supabase.from('offers').select('*')
          const { data: allBrands } =
            await supabase
              .from('brands')
              .select('*')
          const { data: allCategories } =
            await supabase
              .from('categories')
              .select('*')
          for (const row of results) {

            // =====================================
            // VALIDACIÓN REAL
            // =====================================
            console.log(Object.keys(row))
            const name =
              (row.name ||
              row['\uFEFFname'])?.trim()
            const brand = row.brand?.trim()
            const category = row.category?.trim()
// =====================================
// BRAND
// =====================================

      let existingBrand =
        allBrands.find(
          (b) =>
            b.name?.toLowerCase() ===
            brand.toLowerCase()
        )

      if (!existingBrand) {

        const {
          data: newBrand,
          error: brandError,
        } = await supabase

          .from('brands')

          .insert([
            {
              name: brand,
            },
          ])

          .select()

          .single()

        if (brandError) {

          console.log(
            "ERROR CREANDO MARCA:"
          )

          console.log(
            brandError.message
          )

          continue
        }

        existingBrand = newBrand

        allBrands.push(newBrand)
      }

      const brand_id =
        existingBrand.id

// =====================================
// CATEGORY
// =====================================

      let existingCategory =
        allCategories.find(
          (c) =>
            c.name?.toLowerCase() ===
            category.toLowerCase()
        )

      if (!existingCategory) {

        const {
          data: newCategory,
          error: categoryError,
        } = await supabase

          .from('categories')

          .insert([
            {
              name: category,
            },
          ])

          .select()

          .single()

        if (categoryError) {

          console.log(
            "ERROR CREANDO CATEGORIA:"
          )

          console.log(
            categoryError.message
          )

          continue
        }

        existingCategory = newCategory

        allCategories.push(newCategory)
      }

      const category_id =
        existingCategory.id
            const rating =
              row.rating
                ? Number(
                    row.rating.replace(',', '.')
                  )
                : null
            const image = row.image
            const supermarket = row.supermarket?.trim()
            const cashPrice = row.cashPrice
            const installmentsQuantity = row.installmentsQuantity
            const installmentPrice = row.installmentPrice

            console.log({
              name,
              brand,
              supermarket
          })

          console.log("name vacío:", !name)
          console.log("brand vacío:", !brand)
          console.log("supermarket vacío:", !supermarket)

          if (!name || !brand || !supermarket) {
              console.log("FILA INVALIDA IGNORADA")
              continue
}

            // =====================================
            // PRODUCTO EXISTENTE
            // =====================================
            console.log(
              "PASO MARCA Y CATEGORIA OK"
            )

            console.log({
              name,
              brand_id,
              category_id,
              rating
            })
          
            console.log("TODOS LOS PRODUCTOS:");
            console.log(allProducts);

            console.log("CANTIDAD:");
            console.log(allProducts.length);
            console.log("BUSCANDO:", name)

            const existingProduct = allProducts.find((p) => {
              console.log("----------------");
              console.log("BD:", p.name);
              console.log("CSV:", name);
              console.log(
                p.name?.trim().toLowerCase() ===
                name.trim().toLowerCase()
              );

              return (
                p.name?.trim().toLowerCase() ===
                name.trim().toLowerCase()
              );
            });

            console.log("ENCONTRADO:")
            console.log(existingProduct)
            let productId

            // =====================================
            // CREAR PRODUCTO
            // =====================================

            if (!existingProduct) {

             const { 
                data: newProduct, 
                error 
              } =
              await supabase
                .from('products')
                .insert([{
                  name,
                  category_id,
                  brand_id,
                  rating,
                  image
                }])
                .select()

              console.log("INTENTO CREAR PRODUCTO")
              console.log({
                name,
                category_id,
                brand_id,
                rating,
                image
              })

              console.log("RESULTADO PRODUCTO")
              console.log(newProduct)

              console.log("ERROR PRODUCTO")
              console.log(error)
              if (error || !newProduct?.length) {
                console.log('ERROR PRODUCTO:', error)
                continue
              }

              productId = newProduct[0].id
              allProducts.push(newProduct[0])
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

    try {

      const { id } = req.params

      const {

        name,
        category_id,
        brand_id,
        rating,
        image,

      } = req.body

      const { error } =
        await supabase

          .from('products')

          .update({

            name,
            category_id,
            brand_id,
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

    catch (err) {

      console.log(err)

      res.status(500).json({
        error: err.message,
      })

    }

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
// CREATE PRODUCT
// =====================================

app.post('/products', async (req, res) => {

  try {

    const {

      name,
      category_id,
      brand_id,
      rating,
      image,

      supermarket,
      cashPrice,

      installmentsQuantity,
      installmentPrice,

    } = req.body

    // ============================
    // CREATE PRODUCT
    // ============================

    const {
      data: product,
      error: productError,
    } = await supabase

      .from('products')

      .insert([
        {
          name,
          category_id,
          brand_id,
          rating,
          image,
        },
      ])

      .select()

      .single()

    if (productError) {

      return res.status(500).json({
        error:
          productError.message,
      })
    }

    // ============================
    // CREATE OFFER
    // ============================

    const {
      error: offerError,
    } = await supabase

      .from('offers')

      .insert([
        {
          product_id:
            product.id,

          supermarket,

          cash_price:
            cashPrice,

          installments_quantity:
            installmentsQuantity || null,

          installment_price:
            installmentPrice || null,
        },
      ])

    if (offerError) {

      return res.status(500).json({
        error:
          offerError.message,
      })
    }

    global.productsCache = {}

    res.json({
      success: true,
    })

  }

  catch (err) {

    console.log(err)

    res.status(500).json({
      error:
        err.message,
    })
  }
})
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
// CATEGORIES
// =====================================

app.get('/categories', async (req, res) => {

  const { data, error } =
    await supabase
      .from('categories')
      .select('*')
      .order('name')

  if (error) {

    return res.status(500).json({
      error: error.message,
    })
  }

  res.json(data)
})

app.post('/categories', async (req, res) => {

  const { name } = req.body

  const { error } =
    await supabase
      .from('categories')
      .insert([
        { name }
      ])

  if (error) {

    return res.status(500).json({
      error: error.message,
    })
  }

  res.json({
    success: true,
  })
})
// =====================================
// BRANDS
// =====================================

app.get('/brands', async (req, res) => {

  const { data, error } =
    await supabase
      .from('brands')
      .select('*')
      .order('name')

  if (error) {

    return res.status(500).json({
      error: error.message,
    })
  }

  res.json(data)
})

app.post('/brands', async (req, res) => {

  const { name } = req.body

  const { error } =
    await supabase
      .from('brands')
      .insert([
        { name }
      ])

  if (error) {

    return res.status(500).json({
      error: error.message,
    })
  }

  res.json({
    success: true,
  })
})
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