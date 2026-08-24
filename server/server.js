const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors())
app.use(express.json())

const supabase = require('./supabase')

// GET /products - fetch from Supabase with simple filters + pagination
app.get('/products', async (req, res) => {
  try {
    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 20)
    const search = req.query.search || ''
    const category = req.query.category || ''
    const brand = req.query.brand || ''
    const supermarket = req.query.supermarket || ''

    // include related offers so frontend can compute prices
    let query = supabase.from('products').select('*, offers(*)')

    if (search) {
      // simple name ilike search
      query = query.ilike('name', `%${search}%`)
    }

    if (category) query = query.eq('category_id', category)
    if (brand) query = query.eq('brand_id', brand)
    if (supermarket) query = query.eq('supermarket', supermarket)

    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error } = await query.range(from, to)

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Error fetching products' })
    }

    const [{ data: categories }, { data: brands }] = await Promise.all([
      supabase.from('categories').select('id, name'),
      supabase.from('brands').select('id, name'),
    ])
    const categoriesById = new Map((categories || []).map((categoryItem) => [String(categoryItem.id), categoryItem]))
    const brandsById = new Map((brands || []).map((brandItem) => [String(brandItem.id), brandItem]))
    const normalizedProducts = (data || []).map((product) => ({
      ...product,
      categories: product.categories || categoriesById.get(String(product.category_id)) || (product['category.id'] ? { name: product['category.id'] } : null),
      brands: product.brands || brandsById.get(String(product.brand_id)) || (product.id_brands ? { name: product.id_brands } : null),
    }))

    res.json(normalizedProducts)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/upload-csv', (req, res) => {
  res.json({ success: true })
})

app.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('id, name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch (e) {
    res.status(500).json([])
  }
})

app.post('/categories', async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ error: 'Category name is required' })
    const { data, error } = await supabase.from('categories').insert({ name }).select().single()
    if (error) {
      console.error('Error creating category', error)
      return res.status(500).json({ error: 'Error creating category' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/categories/:id', async (req, res) => {
  try {
    const { name } = req.body || {}
    const { id } = req.params
    if (!name) return res.status(400).json({ error: 'Category name is required' })
    const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select().single()
    if (error) {
      console.error('Error updating category', error)
      return res.status(500).json({ error: 'Error updating category' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/categories/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      console.error('Error deleting category', error)
      return res.status(500).json({ error: 'Error deleting category' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/brands', async (req, res) => {
  try {
    const { data, error } = await supabase.from('brands').select('id, name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch (e) {
    res.status(500).json([])
  }
})

app.get('/supermarkets', async (req, res) => {
  try {
    const { data, error } = await supabase.from('offers').select('supermarket')
    if (error) {
      console.error('Error fetching supermarkets', error)
      return res.status(500).json({ error: 'Error fetching supermarkets' })
    }

    const supermarkets = [...new Set((data || []).map((offer) => offer.supermarket).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second))
      .map((name) => ({ id: name, name }))
    res.json(supermarkets)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/supermarkets/:name', async (req, res) => {
  try {
    const oldName = req.params.name
    const { name } = req.body || {}
    if (!name || !name.trim()) return res.status(400).json({ error: 'Supermarket name is required' })

    const { data, error } = await supabase
      .from('offers')
      .update({ supermarket: name.trim() })
      .eq('supermarket', oldName)
      .select('id, supermarket')
    if (error) {
      console.error('Error updating supermarket', error)
      return res.status(500).json({ error: 'Error updating supermarket' })
    }
    res.json({ name: name.trim(), updated: data?.length || 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/supermarkets/:name', async (req, res) => {
  try {
    const supermarketName = req.params.name
    const { data, error } = await supabase
      .from('offers')
      .delete()
      .eq('supermarket', supermarketName)
      .select('id')
    if (error) {
      console.error('Error deleting supermarket offers', error)
      return res.status(500).json({ error: 'Error deleting supermarket' })
    }
    res.json({ deleted: data?.length || 0 })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/brands', async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ error: 'Brand name is required' })
    const { data, error } = await supabase.from('brands').insert({ name }).select().single()
    if (error) {
      console.error('Error creating brand', error)
      return res.status(500).json({ error: 'Error creating brand' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/brands/:id', async (req, res) => {
  try {
    const { name } = req.body || {}
    const { id } = req.params
    if (!name) return res.status(400).json({ error: 'Brand name is required' })
    const { data, error } = await supabase.from('brands').update({ name }).eq('id', id).select().single()
    if (error) {
      console.error('Error updating brand', error)
      return res.status(500).json({ error: 'Error updating brand' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/brands/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('brands').delete().eq('id', id)
    if (error) {
      console.error('Error deleting brand', error)
      return res.status(500).json({ error: 'Error deleting brand' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

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
    } = req.body || {}

    if (!name || !category_id || !brand_id || !supermarket || cashPrice === undefined || cashPrice === null || Number(cashPrice) <= 0) {
      return res.status(400).json({ error: 'Name, category, brand, supermarket and a valid cash price are required' })
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        name,
        category_id,
        brand_id,
        rating,
        image,
      })
      .select()
      .single()

    if (productError) {
      console.error('Error creating product', productError)
      return res.status(500).json({ error: 'Error creating product' })
    }

    let offer = null
    if (supermarket || cashPrice || installmentsQuantity || installmentPrice) {
      const { data: newOffer, error: offerError } = await supabase
        .from('offers')
        .insert({
          product_id: product.id,
          supermarket: supermarket || 'Sin supermercado',
          cash_price: cashPrice || null,
          installments_quantity: installmentsQuantity || null,
          installment_price: installmentPrice || null,
        })
        .select()
        .single()

      if (offerError) {
        console.error('Error creating offer', offerError)
        return res.status(500).json({ error: 'Error creating offer' })
      }
      offer = newOffer
    }

    const responsePayload = { ...product, offers: offer ? [offer] : [] }
    res.json(responsePayload)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, category_id, brand_id, rating, image } = req.body || {}
    const { data, error } = await supabase
      .from('products')
      .update({ name, category_id, brand_id, rating, image })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating product', error)
      return res.status(500).json({ error: 'Error updating product' })
    }

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params
    await supabase.from('offers').delete().eq('product_id', id)
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) {
      console.error('Error deleting product', error)
      return res.status(500).json({ error: 'Error deleting product' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/offers', async (req, res) => {
  try {
    const {
      product_id,
      supermarket,
      cash_price,
      installments_quantity,
      installment_price,
    } = req.body || {}

    if (!product_id) return res.status(400).json({ error: 'product_id is required' })

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('id', product_id)
      .maybeSingle()

    if (productError) {
      console.error('Error checking product for offer', productError)
      return res.status(500).json({ error: 'Error checking product' })
    }
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const { data, error } = await supabase
      .from('offers')
      .insert({
        product_id,
        supermarket: supermarket || 'Sin supermercado',
        cash_price: cash_price || null,
        installments_quantity: installments_quantity || null,
        installment_price: installment_price || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating offer', error)
      return res.status(500).json({ error: 'Error creating offer' })
    }

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/offers/:id', async (req, res) => {
  try {
    const { id } = req.params
    const {
      supermarket,
      cash_price,
      installments_quantity,
      installment_price,
    } = req.body || {}

    const { data, error } = await supabase
      .from('offers')
      .update({ supermarket, cash_price, installments_quantity, installment_price })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating offer', error)
      return res.status(500).json({ error: 'Error updating offer' })
    }

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/offers/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await supabase.from('offers').delete().eq('id', id)
    if (error) {
      console.error('Error deleting offer', error)
      return res.status(500).json({ error: 'Error deleting offer' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/admins', async (req, res) => {
  try {
    const { data, error } = await supabase.from('admins').select('id, username')
    if (error) {
      console.error('Error fetching admins', error)
      return res.status(500).json([])
    }
    res.json(data || [])
  } catch (e) {
    console.error(e)
    res.status(500).json([])
  }
})

app.post('/admins', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
    const existing = await supabase.from('admins').select('id').eq('username', username).single()
    if (existing.error && existing.error.code !== 'PGRST116') {
      console.error('Error checking admin', existing.error)
      return res.status(500).json({ error: 'Error checking admin' })
    }
    if (existing.data) return res.status(400).json({ error: 'Admin already exists' })
    const { data, error } = await supabase.from('admins').insert({ username, password }).select('id, username').single()
    if (error) {
      console.error('Error creating admin', error)
      return res.status(500).json({ error: 'Error creating admin' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
    const { data, error } = await supabase.from('admins').select('username, password').eq('username', username).single()
    if (error || !data || data.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin: update offers prices by category with a percentage
app.post('/admin/update-prices', async (req, res) => {
  try {
    const { categoryId, brandId, supermarket, percentage } = req.body || {}
    const targetCount = [categoryId, brandId, supermarket].filter(Boolean).length
    if (!targetCount || typeof percentage !== 'number') {
      return res.status(400).json({ error: 'At least one filter and numeric percentage required' })
    }

    // fetch products with offers and filter locally by multiple possible category fields
    const { data: allProducts, error: allErr } = await supabase.from('products').select('*, offers(*)')
    if (allErr) {
      console.error('Error fetching products', allErr)
      return res.status(500).json({ error: 'Error fetching products' })
    }

    const products = (allProducts || []).filter((p) => {
      let categoryMatches = true
      let brandMatches = true
      if (categoryId) {
        const targetCandidates = []
        if (p.category_id) targetCandidates.push(p.category_id)
        if (p.category) targetCandidates.push(p.category)
        if (p['category.id']) targetCandidates.push(p['category.id'])
        if (p['category.name']) targetCandidates.push(p['category.name'])
        if (p.categories && p.categories.name) targetCandidates.push(p.categories.name)
        categoryMatches = targetCandidates.some((candidate) => candidate && String(candidate) === String(categoryId))
      }
      if (brandId) {
        const targetCandidates = []
        if (p.brand_id) targetCandidates.push(p.brand_id)
        if (p.brand) targetCandidates.push(p.brand)
        if (p['brand.id']) targetCandidates.push(p['brand.id'])
        if (p['brand.name']) targetCandidates.push(p['brand.name'])
        if (p.brands && p.brands.name) targetCandidates.push(p.brands.name)
        brandMatches = targetCandidates.some((candidate) => candidate && String(candidate) === String(brandId))
      }
      const supermarketMatches = !supermarket || (p.offers || []).some((offer) => String(offer.supermarket) === String(supermarket))
      return categoryMatches && brandMatches && supermarketMatches
    })

    const productIds = products.map((p) => p.id).filter(Boolean)
    if (!productIds.length) return res.json({ updated: 0, changes: [] })

    // fetch offers for these products
    let offersQuery = supabase.from('offers').select('*').in('product_id', productIds)
    if (supermarket) offersQuery = offersQuery.eq('supermarket', supermarket)
    const { data: offers, error: offersErr } = await offersQuery
    if (offersErr) {
      console.error('Error fetching offers', offersErr)
      return res.status(500).json({ error: 'Error fetching offers' })
    }

    // update each offer individually with the new price
    let updatedCount = 0
    const changes = []
    for (const offer of offers || []) {
      const current = Number(offer.cash_price || 0)
      const newPrice = Math.round(current * (1 + percentage / 100))
      const { error: upErr } = await supabase.from('offers').update({ cash_price: newPrice }).eq('id', offer.id)
      if (upErr) console.error('Error updating offer', offer.id, upErr)
      else {
        updatedCount++
        changes.push({ offerId: offer.id, previousCashPrice: offer.cash_price, updatedCashPrice: newPrice })
      }
    }

    res.json({ updated: updatedCount, changes })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/admin/rollback-price-update', async (req, res) => {
  try {
    const { changes } = req.body || {}
    if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes array required' })

    const offerIds = changes.map((change) => change?.offerId).filter(Boolean)
    const { data: currentOffers, error: fetchError } = offerIds.length
      ? await supabase.from('offers').select('id, cash_price').in('id', offerIds)
      : { data: [], error: null }
    if (fetchError) {
      console.error('Error checking current offer prices', fetchError)
      return res.status(500).json({ error: 'Error checking current prices' })
    }

    let restoredCount = 0
    let skippedCount = 0
    for (const change of changes) {
      if (!change?.offerId) continue
      const currentOffer = currentOffers.find((offer) => String(offer.id) === String(change.offerId))
      if (!currentOffer || Number(currentOffer.cash_price || 0) !== Number(change.updatedCashPrice || 0)) {
        skippedCount++
        continue
      }
      const { error } = await supabase
        .from('offers')
        .update({ cash_price: change.previousCashPrice })
        .eq('id', change.offerId)
      if (error) {
        console.error('Error restoring offer', change.offerId, error)
        return res.status(500).json({ error: 'Error restoring prices' })
      }
      restoredCount++
    }

    res.json({ restored: restoredCount, skipped: skippedCount })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const desiredPort = process.env.PORT ? Number(process.env.PORT) : 3000
let server = app.listen(desiredPort, () => {
  const actual = server.address().port
  console.log(`Server running on port ${actual}`)
})

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.warn(`Port ${desiredPort} in use; falling back to an ephemeral port`)
    server = app.listen(0, () => {
      const actual = server.address().port
      console.log(`Server running on fallback port ${actual}`)
    })
    server.on('error', (e) => console.error('Server error:', e.message))
  } else {
    console.error('Server error:', err && err.message)
  }
})
