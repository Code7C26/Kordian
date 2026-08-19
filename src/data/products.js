const API_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:3000'

// =====================================
// GET PRODUCTS
// =====================================

export async function getProducts({
  page = 1,
  limit = 20,
  search = '',
  category = '',
  brand = '',
  supermarket = '',
} = {}) {

  const params = new URLSearchParams({
    page,
    limit,
  })

  if (search)
    params.append('search', search)

  if (category)
    params.append('category', category)

  if (brand)
    params.append('brand', brand)

  if (supermarket)
    params.append(
      'supermarket',
      supermarket
    )

  const response = await fetch(
    `${API_URL}/products?${params.toString()}`
  )

  if (!response.ok) {
    throw new Error(
      'Error cargando productos'
    )
  }

  return await response.json()
}

// =====================================
// CREATE PRODUCT
// =====================================

export async function createProduct(product) {

  const response = await fetch(
    `${API_URL}/products`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(product),
    }
  )

  return await response.json()
}

// =====================================
// UPDATE PRODUCT
// =====================================

export async function updateProduct(
  id,
  product
) {

  const response = await fetch(
    `${API_URL}/products/${id}`,
    {
      method: 'PUT',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(product),
    }
  )

  return await response.json()
}

// =====================================
// DELETE PRODUCT
// =====================================

export async function deleteProduct(id) {

  const response = await fetch(
    `${API_URL}/products/${id}`,
    {
      method: 'DELETE',
    }
  )

  return await response.json()
}
