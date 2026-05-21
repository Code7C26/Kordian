const express = require('express')
const cors = require('cors')

const supabase = require('./supabase')

const app = express()

app.use(cors())
app.use(express.json())

// =====================================
// PRODUCTS
// =====================================

// GET PRODUCTS

app.get('/products', async (req, res) => {

  const {
    data: products,
    error: productsError,
  } = await supabase
    .from('products')
    .select('*')

  if (productsError) {

    return res.status(500).json({
      error: productsError.message,
    })
  }

  const {
    data: offers,
    error: offersError,
  } = await supabase
    .from('offers')
    .select('*')

  if (offersError) {

    return res.status(500).json({
      error: offersError.message,
    })
  }

  const finalProducts =
    products.map((product) => ({

      ...product,

      offers:
        offers.filter(
          (offer) =>
            offer.product_id ===
            product.id
        ),
    }))

  res.json(finalProducts)
})

// =====================================
// CREATE PRODUCT / OFFER
// =====================================

app.post('/products', async (req, res) => {

  const {

    name,
    category,
    brand,
    rating,
    image,

    supermarket,
    cashPrice,

    installmentsQuantity,
    installmentPrice,

  } = req.body

  // =========================
  // SEARCH PRODUCT
  // =========================

  const {
    data: existingProducts,
    error: searchError,
  } = await supabase
    .from('products')
    .select('*')

  if (searchError) {

    return res.status(500).json({
      error: searchError.message,
    })
  }

  let existingProduct =
    existingProducts.find(
      (p) =>

        p.name?.trim().toLowerCase() ===
          name?.trim().toLowerCase()

        &&

        p.brand?.trim().toLowerCase() ===
          brand?.trim().toLowerCase()
    )

  let productId

  // =========================
  // CREATE PRODUCT
  // =========================

  if (!existingProduct) {

    const {
      data: newProduct,
      error,
    } = await supabase
      .from('products')
      .insert([
        {
          name,
          category,
          brand,
          rating,
          image,
        },
      ])
      .select()

    if (error) {

      return res.status(500).json({
        error: error.message,
      })
    }

    productId =
      newProduct[0].id

  } else {

    productId =
      existingProduct.id
  }

  // =========================
  // SEARCH OFFER
  // =========================

  const {
    data: existingOffers,
    error: offerSearchError,
  } = await supabase
    .from('offers')
    .select('*')

  if (offerSearchError) {

    return res.status(500).json({
      error:
        offerSearchError.message,
    })
  }

  const repeatedOffer =
    existingOffers.find(
      (offer) =>

        offer.product_id ===
          productId

        &&

        offer.supermarket
          ?.trim()
          .toLowerCase()

        ===

        supermarket
          ?.trim()
          .toLowerCase()
    )

  // =========================
  // UPDATE OFFER
  // =========================

  if (repeatedOffer) {

    const {
      error: updateError,
    } = await supabase
      .from('offers')
      .update({

        cash_price:
          cashPrice,

        installments_quantity:
          installmentsQuantity || null,

        installment_price:
          installmentPrice || null,
      })
      .eq(
        'id',
        repeatedOffer.id
      )

    if (updateError) {

      return res.status(500).json({
        error:
          updateError.message,
      })
    }

  }

  // =========================
  // CREATE OFFER
  // =========================

  else {

    const {
      error: insertOfferError,
    } = await supabase
      .from('offers')
      .insert([
        {
          product_id:
            productId,

          supermarket,

          cash_price:
            cashPrice,

          installments_quantity:
            installmentsQuantity || null,

          installment_price:
            installmentPrice || null,
        },
      ])

    if (insertOfferError) {

      return res.status(500).json({
        error:
          insertOfferError.message,
      })
    }
  }

  res.json({
    success: true,
  })
})

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

    res.json({
      success: true,
    })
  }
)

// =====================================
// ADMINS
// =====================================

// GET ADMINS

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

// CREATE ADMIN

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

  res.json({
    success: true,
  })
})

// LOGIN

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