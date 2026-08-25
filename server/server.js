const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const app = express()

app.use(cors())
app.use(express.json())

const supabase = require('./supabase')
const { analyzeProduct } = require('./services/priceAnalysisService')
const analysisWriter = process.env.SUPABASE_SERVICE_ROLE_KEY ? require('./supabaseAdmin') : supabase
const sessionSecret = process.env.ADMIN_SESSION_SECRET || (
  process.env.NODE_ENV === 'production' ? null : 'arprice-local-dev-session-secret'
)

function encodeTokenPart(value) {
  return Buffer.from(value).toString('base64url')
}

function createAdminToken(username) {
  if (!sessionSecret) return null
  const payload = encodeTokenPart(JSON.stringify({ username, expiresAt: Date.now() + 8 * 60 * 60 * 1000 }))
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readAdminToken(token) {
  if (!sessionSecret || !token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url')
  const providedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return session.expiresAt > Date.now() ? session : null
  } catch {
    return null
  }
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const session = readAdminToken(token)
  if (!session) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  req.admin = session.username
  next()
}

function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim().replace(/\s/g, '')
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(?:\.\d{3})+$/.test(text)
      ? text.replace(/\./g, '')
      : text
  const price = Number(normalized)
  return Number.isFinite(price) ? price : null
}

app.get('/taxonomy', async (req, res) => {
  try {
    const [{ data: categories, error: categoriesError }, { data: subcategories, error: subcategoriesError }] = await Promise.all([
      supabase.from('categories').select('id, name').order('name'),
      supabase.from('subcategories').select('id, category_id, name').order('name'),
    ])
    if (categoriesError || subcategoriesError) return res.status(500).json({ error: 'Error fetching taxonomy' })
    const subcategoriesByCategory = new Map()
    for (const subcategory of subcategories || []) {
      const list = subcategoriesByCategory.get(String(subcategory.category_id)) || []
      list.push(subcategory)
      subcategoriesByCategory.set(String(subcategory.category_id), list)
    }
    res.json((categories || []).map((category) => ({ ...category, subcategories: subcategoriesByCategory.get(String(category.id)) || [] })))
  } catch (error) {
    console.error('Error fetching taxonomy', error)
    res.status(500).json({ error: 'Error fetching taxonomy' })
  }
})

app.put('/products/:id/classification', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { subcategory_id } = req.body || {}
    if (!subcategory_id) return res.status(400).json({ error: 'subcategory_id is required' })
    const { data, error } = await supabase.from('products').update({
      subcategory_id,
      classification_source: 'manual',
      classification_confidence: 'manual',
    }).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: 'Error updating product classification' })
    res.json(data)
  } catch (error) {
    console.error('Error updating product classification', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

async function recordPriceHistory({ productId, offerId, cashPrice, source = 'admin' }) {
  const price = Number(cashPrice)
  if (!productId || !offerId || !Number.isFinite(price) || price <= 0) return

  const { error } = await supabase.from('price_history').insert({
    product_id: productId,
    offer_id: offerId,
    cash_price: price,
    source,
  })
  if (error) console.error('Error recording price history', error)
}

// GET /products - fetch from Supabase with simple filters + pagination
app.get('/products', async (req, res) => {
  try {
    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 20)
    const search = req.query.search || ''
    const category = req.query.category || ''
    const brand = req.query.brand || ''
    const supermarket = req.query.supermarket || ''

    // Include related catalog data so admin and storefront can display it.
    let query = supabase.from('products').select('*, offers(*), categories(id, name), subcategories(id, name), brands(id, name)')

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

    res.json(data || [])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /analysis/products - calculate the structured analysis from backend data
app.get('/analysis/products', async (req, res) => {
  try {
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*, offers(*), categories(name), subcategories(name), brands(name)')

    if (productsError) return res.status(500).json({ error: 'Error fetching products for analysis' })

    const productIds = (products || []).map((product) => product.id).filter(Boolean)
    const { data: history, error: historyError } = await supabase
      .from('price_history')
      .select('*')
      .in('product_id', productIds)
      .order('observed_at', { ascending: true })

    if (historyError) {
      return res.status(503).json({
        error: 'Price analysis migration is not available',
        detail: 'Apply server/migrations/20260822_price_analysis.sql before using this endpoint',
      })
    }

    const { data: updateLogs, error: updateLogsError } = await supabase
      .from('price_update_log')
      .select('updated_at, changes')
      .order('updated_at', { ascending: true })
    if (updateLogsError) console.error('Error fetching price update history', updateLogsError)

    const historyByProduct = new Map()
    for (const point of history || []) {
      const points = historyByProduct.get(String(point.product_id)) || []
      points.push(point)
      historyByProduct.set(String(point.product_id), points)
    }
    for (const update of updateLogs || []) {
      for (const change of Array.isArray(update.changes) ? update.changes : []) {
        if (!change.productId || !change.updatedCashPrice) continue
        const points = historyByProduct.get(String(change.productId)) || []
        const alreadyRecorded = points.some((point) => String(point.offer_id) === String(change.offerId)
          && Number(point.cash_price) === Number(change.updatedCashPrice))
        if (!alreadyRecorded) {
          points.push({
            product_id: change.productId,
            offer_id: change.offerId,
            observed_at: update.updated_at,
            cash_price: change.updatedCashPrice,
            source: 'bulk_admin_log',
          })
          historyByProduct.set(String(change.productId), points)
        }
      }
    }

    const analyses = await Promise.all((products || []).map((product) => analyzeProduct(
      product,
      products || [],
      historyByProduct.get(String(product.id)) || [],
      product.categories?.name || '',
    )))

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { error: persistenceError } = await analysisWriter.from('price_analysis').insert(analyses.map((analysis) => ({
        product_id: analysis.product.id,
        status: analysis.classification,
        anomaly_score: analysis.score || 0,
        offer_score: analysis.offerScore || 0,
        confidence: analysis.confidence || 'baja',
        indicators: {
          ...analysis.indicators,
          references: analysis.references,
          dataQuality: analysis.dataQuality,
        },
      })))
      if (persistenceError) console.error('Error persisting price analysis', persistenceError)
    }

    res.json(analyses)
  } catch (error) {
    console.error('Error calculating price analysis', error)
    res.status(500).json({ error: 'Error calculating price analysis' })
  }
})

app.post('/upload-csv', requireAdmin, (req, res) => {
  res.json({ success: true })
})

app.get('/categories', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('id, name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch {
    res.status(500).json([])
  }
})

app.post('/categories', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ error: 'Category name is required' })
    const { data, error } = await supabase.from('categories').insert({ name }).select().single()
    if (error) {
      console.error('Error creating category', error)
      return res.status(500).json({ error: 'Error creating category' })
    }
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/categories/:id', requireAdmin, async (req, res) => {
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
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { count: productCount, error: productsError } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
    if (productsError) {
      console.error('Error checking category products', productsError)
      return res.status(500).json({ error: 'No se pudo comprobar si la categoría tiene productos' })
    }
    if (productCount > 0) {
      return res.status(409).json({ error: 'No se puede eliminar: la categoría tiene productos asociados' })
    }
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) {
      console.error('Error deleting category', error)
      return res.status(500).json({ error: error.message || 'Error deleting category' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/subcategories', requireAdmin, async (req, res) => {
  try {
    const { name, category_id } = req.body || {}
    if (!name?.trim() || !category_id) return res.status(400).json({ error: 'Subcategory name and category are required' })
    const { data, error } = await supabase.from('subcategories').insert({ name: name.trim(), category_id }).select().single()
    if (error) {
      console.error('Error creating subcategory', error)
      return res.status(500).json({ error: 'Error creating subcategory' })
    }
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/subcategories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, category_id } = req.body || {}
    if (!name?.trim() || !category_id) return res.status(400).json({ error: 'Subcategory name and category are required' })
    const { data, error } = await supabase.from('subcategories').update({ name: name.trim(), category_id }).eq('id', req.params.id).select().single()
    if (error) {
      console.error('Error updating subcategory', error)
      return res.status(500).json({ error: 'Error updating subcategory' })
    }
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/subcategories/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('subcategories').delete().eq('id', req.params.id)
    if (error) {
      console.error('Error deleting subcategory', error)
      return res.status(500).json({ error: 'Error deleting subcategory' })
    }
    res.json({ success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/brands', async (req, res) => {
  try {
    const { data, error } = await supabase.from('brands').select('id, name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch {
    res.status(500).json([])
  }
})

app.post('/brands', requireAdmin, async (req, res) => {
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

app.put('/brands/:id', requireAdmin, async (req, res) => {
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

app.delete('/brands/:id', requireAdmin, async (req, res) => {
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

app.get('/supermarkets', async (req, res) => {
  try {
    const { data, error } = await supabase.from('supermarkets').select('id, name, image').order('name')
    if (error) return res.status(500).json([])
    res.json(data || [])
  } catch {
    res.status(500).json([])
  }
})

app.post('/supermarkets', requireAdmin, async (req, res) => {
  try {
    const { name, image } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'Supermarket name is required' })
    const { data, error } = await supabase.from('supermarkets').insert({ name: name.trim(), image: image?.trim() || null }).select().single()
    if (error) {
      console.error('Error creating supermarket', error)
      return res.status(500).json({ error: 'Error creating supermarket' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/supermarkets/:id', requireAdmin, async (req, res) => {
  try {
    const { name, image } = req.body || {}
    if (!name?.trim()) return res.status(400).json({ error: 'Supermarket name is required' })
    const { data, error } = await supabase.from('supermarkets').update({ name: name.trim(), image: image?.trim() || null }).eq('id', req.params.id).select().single()
    if (error) {
      console.error('Error updating supermarket', error)
      return res.status(500).json({ error: 'Error updating supermarket' })
    }
    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/supermarkets/:id', requireAdmin, async (req, res) => {
  try {
    const { error } = await supabase.from('supermarkets').delete().eq('id', req.params.id)
    if (error) {
      console.error('Error deleting supermarket', error)
      return res.status(500).json({ error: 'Error deleting supermarket' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/products', requireAdmin, async (req, res) => {
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
      subcategory_id,
    } = req.body || {}

    if (!name) return res.status(400).json({ error: 'Product name is required' })

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        name,
        category_id,
        brand_id,
        rating,
        image,
        subcategory_id: subcategory_id || null,
        classification_source: subcategory_id ? 'manual' : null,
        classification_confidence: subcategory_id ? 'manual' : null,
      })
      .select()
      .single()
    if (productError) {
      console.error('Error creating product', productError)
      return res.status(500).json({ error: 'Error creating product' })
    }

    let offer = null
    if (supermarket || cashPrice || installmentsQuantity || installmentPrice) {
      const normalizedCashPrice = parsePrice(cashPrice)
      const normalizedInstallmentsQuantity = parsePrice(installmentsQuantity)
      const normalizedInstallmentPrice = parsePrice(installmentPrice)
      if (cashPrice && (!normalizedCashPrice || normalizedCashPrice <= 0)) {
        await supabase.from('products').delete().eq('id', product.id)
        return res.status(400).json({ error: 'El precio contado debe ser un número mayor que cero' })
      }
      const { data: newOffer, error: offerError } = await supabase
        .from('offers')
        .insert({
          product_id: product.id,
          supermarket: supermarket || 'Sin supermercado',
          cash_price: normalizedCashPrice,
          installments_quantity: normalizedInstallmentsQuantity,
          installment_price: normalizedInstallmentPrice,
        })
        .select()
        .single()

      if (offerError) {
        console.error('Error creating offer', offerError)
        await supabase.from('products').delete().eq('id', product.id)
        return res.status(500).json({ error: offerError.message || 'Error creating offer' })
      }
      offer = newOffer
      await recordPriceHistory({ productId: product.id, offerId: newOffer.id, cashPrice: newOffer.cash_price })
    }

    const responsePayload = { ...product, offers: offer ? [offer] : [] }
    res.json(responsePayload)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/products/:id', requireAdmin, async (req, res) => {
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

app.delete('/products/:id', requireAdmin, async (req, res) => {
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

app.post('/offers', requireAdmin, async (req, res) => {
  try {
    const { 
      product_id,
      supermarket,
      cash_price,
      installments_quantity,
      installment_price,
    } = req.body || {}

    if (!product_id) return res.status(400).json({ error: 'product_id is required' })

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

    await recordPriceHistory({ productId: data.product_id, offerId: data.id, cashPrice: data.cash_price })

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.put('/offers/:id', requireAdmin, async (req, res) => {
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

    await recordPriceHistory({ productId: data.product_id, offerId: data.id, cashPrice: data.cash_price })

    res.json(data)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/offers/:id', requireAdmin, async (req, res) => {
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

app.get('/admins', requireAdmin, async (req, res) => {
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

app.get('/admin/price-history', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_history')
      .select('id, product_id, offer_id, observed_at, cash_price, source')
      .order('observed_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Error fetching price history', error)
      return res.status(500).json({ error: 'Error fetching price history' })
    }

    const productIds = [...new Set((data || []).map((entry) => entry.product_id).filter(Boolean))]
    const offerIds = [...new Set((data || []).map((entry) => entry.offer_id).filter(Boolean))]
    const [{ data: products }, { data: offers }] = await Promise.all([
      productIds.length ? supabase.from('products').select('id, name').in('id', productIds) : { data: [] },
      offerIds.length ? supabase.from('offers').select('id, supermarket').in('id', offerIds) : { data: [] },
    ])
    const productsById = new Map((products || []).map((product) => [String(product.id), product]))
    const offersById = new Map((offers || []).map((offer) => [String(offer.id), offer]))

    res.json((data || []).map((entry) => ({
      ...entry,
      product_name: productsById.get(String(entry.product_id))?.name || 'Producto eliminado',
      supermarket: offersById.get(String(entry.offer_id))?.supermarket || 'Sin supermercado',
    })))
  } catch (error) {
    console.error('Error fetching price history', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/admin/price-updates', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('price_update_log')
      .select('id, updated_at, admin_username, filters, percentage, products_updated')
      .order('updated_at', { ascending: false })
      .limit(200)
    if (error) return res.status(500).json({ error: 'Error fetching price updates' })
    res.json(data || [])
  } catch (error) {
    console.error('Error fetching price updates', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.delete('/admin/price-updates/:id', requireAdmin, async (req, res) => {
  try {
    const { data: update, error: fetchError } = await supabase
      .from('price_update_log')
      .select('id, changes')
      .eq('id', req.params.id)
      .single()
    if (fetchError) return res.status(fetchError.code === 'PGRST116' ? 404 : 500).json({ error: 'Error fetching price update' })

    const changes = Array.isArray(update.changes) ? update.changes : []
    if (!changes.length) {
      const { error: deleteEmptyError } = await supabase.from('price_update_log').delete().eq('id', req.params.id)
      if (deleteEmptyError) return res.status(500).json({ error: 'Error deleting price update' })
      return res.json({ success: true, restored: 0 })
    }

    for (const change of changes) {
      const { error: restoreError } = await supabase
        .from('offers')
        .update({ cash_price: change.previousCashPrice })
        .eq('id', change.offerId)
      if (restoreError) {
        console.error('Error restoring offer', change.offerId, restoreError)
        return res.status(500).json({ error: 'The operation could not be fully reverted' })
      }
      await recordPriceHistory({
        productId: change.productId,
        offerId: change.offerId,
        cashPrice: change.previousCashPrice,
        source: 'bulk_admin_revert',
      })
    }

    const { error } = await supabase.from('price_update_log').delete().eq('id', req.params.id)
    if (error) return res.status(500).json({ error: 'Prices restored, but the operation could not be deleted' })
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting price update', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

app.post('/admins', requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
    const existing = await supabase.from('admins').select('id').eq('username', username).single()
    if (existing.error && existing.error.code !== 'PGRST116') {
      console.error('Error checking admin', existing.error)
      return res.status(500).json({ error: 'Error checking admin' })
    }
    if (existing.data) return res.status(400).json({ error: 'Admin already exists' })
    const passwordHash = await bcrypt.hash(password, 12)
    const { data, error } = await supabase.from('admins').insert({ username, password: passwordHash }).select('id, username').single()
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
    const isBcryptHash = data?.password?.startsWith('$2')
    const validPassword = data && (isBcryptHash
      ? await bcrypt.compare(password, data.password)
      : data.password === password)
    if (error || !data || !validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (!isBcryptHash) {
      await supabase.from('admins').update({ password: await bcrypt.hash(password, 12) }).eq('username', username)
    }
    const token = createAdminToken(data.username)
    if (!token) return res.status(503).json({ error: 'ADMIN_SESSION_SECRET is not configured' })
    res.json({ success: true, token })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Admin: update offers prices by category with a percentage
app.post('/admin/update-prices', requireAdmin, async (req, res) => {
  try {
    const { categoryId, brandId, supermarket, percentage, updatedAt } = req.body || {}
    if ((!categoryId && !brandId && !supermarket) || typeof percentage !== 'number') {
      return res.status(400).json({ error: 'categoryId, brandId or supermarket and numeric percentage required' })
    }
    if (percentage === 0) return res.json({ updated: 0 })
    let operationDate
    if (updatedAt) {
      operationDate = new Date(`${updatedAt}T12:00:00`)
      if (Number.isNaN(operationDate.getTime())) return res.status(400).json({ error: 'Invalid update date' })
    }

    // fetch products with offers and filter locally by multiple possible category fields
    const { data: allProducts, error: allErr } = await supabase.from('products').select('*, offers(*)')
    if (allErr) {
      console.error('Error fetching products', allErr)
      return res.status(500).json({ error: 'Error fetching products' })
    }

    const products = (allProducts || []).filter((p) => {
      if (categoryId) {
        const catCandidates = []
        if (p.category_id) catCandidates.push(p.category_id)
        if (p.category) catCandidates.push(p.category)
        if (p['category.id']) catCandidates.push(p['category.id'])
        if (p['category.name']) catCandidates.push(p['category.name'])
        if (p.categories && p.categories.name) catCandidates.push(p.categories.name)
        if (!catCandidates.some((c) => c && String(c) === String(categoryId))) return false
      }
      if (brandId) {
        const brandCandidates = []
        if (p.brand_id) brandCandidates.push(p.brand_id)
        if (p.brand) brandCandidates.push(p.brand)
        if (p['brand.id']) brandCandidates.push(p['brand.id'])
        if (p['brand.name']) brandCandidates.push(p['brand.name'])
        if (p.brands && p.brands.name) brandCandidates.push(p.brands.name)
        if (!brandCandidates.some((b) => b && String(b) === String(brandId))) return false
      }
      return true
    })

    const productIds = products.map((p) => p.id).filter(Boolean)
    if (!productIds.length) {
      return res.json({ updated: 0 })
    }

    // fetch offers for these products
    const { data: allOffers, error: offersErr } = await supabase.from('offers').select('*').in('product_id', productIds)
    if (offersErr) {
      console.error('Error fetching offers', offersErr)
      return res.status(500).json({ error: 'Error fetching offers' })
    }
    const offers = (allOffers || []).filter((offer) => !supermarket || offer.supermarket === supermarket)
    if (!offers.length) return res.json({ updated: 0 })

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
        changes.push({
          offerId: offer.id,
          productId: offer.product_id,
          previousCashPrice: current,
          updatedCashPrice: newPrice,
        })
      }
    }

    const { error: logError } = await supabase.from('price_update_log').insert({
      admin_username: req.admin,
      ...(operationDate ? { updated_at: operationDate.toISOString() } : {}),
      filters: { categoryId: categoryId || null, brandId: brandId || null, supermarket: supermarket || null },
      percentage,
      products_updated: updatedCount,
      changes,
    })
    if (logError) {
      console.error('Error recording price update', logError)
      return res.status(500).json({ error: 'Prices updated, but the operation could not be recorded' })
    }

    res.json({ updated: updatedCount })
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
