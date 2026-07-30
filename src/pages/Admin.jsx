import React,
{
  useEffect,
  useState,
} from 'react'

export default function Admin() 
{

// ====================================
// STATES
// ====================================

const [products, setProducts] =
  useState([])

const [admins, setAdmins] =
  useState([])

const [categories, setCategories] =
  useState([])

const [brands, setBrands] =
  useState([])

const [editingProduct, setEditingProduct] =
  useState(null)

const [adminForm, setAdminForm] =
  useState({
    username: '',
    password: '',
  })

const [form, setForm] =
  useState({

    name: '',

    category_id: '',

    brand_id: '',

    rating: 5,

    image: '',

    supermarket: 'Carrefour',

    cashPrice: '',

    installmentsQuantity: '',

    installmentPrice: '',
  })

const [newCategory, setNewCategory] =
  useState('')

const [newBrand, setNewBrand] =
  useState('')

 // ====================================
// LOAD DATA
// ====================================

const loadProducts =
  async () => {

    try {

      const res =
        await fetch(
          'http://localhost:3000/products'
        )

      const data =
        await res.json()

      setProducts(data)

    } catch (error) {

      console.error(error)

    }
  }
const loadAdmins =
  async () => {

    const res =
      await fetch(
        'http://localhost:3000/admins'
      )

    const data =
      await res.json()

    setAdmins(data)
  }

const loadCategories =
  async () => {

    const res =
      await fetch(
        'http://localhost:3000/categories'
      )

    const data =
      await res.json()

    setCategories(data)
  }

const loadBrands =
  async () => {

    const res =
      await fetch(
        'http://localhost:3000/brands'
      )

    const data =
      await res.json()

    setBrands(data)
  }

useEffect(() => {

  loadProducts()
  loadAdmins()
  loadCategories()
  loadBrands()

}, [])
    // ====================================
    // CREATE PRODUCT/OFFER
    // ====================================

    const createProduct =
      async () => {

        await fetch(
          'http://localhost:3000/products',

          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(form),
          }
        )

      setForm({

        name: '',

        category_id: '',

        brand_id: '',

        rating: 5,

        image: '',

        supermarket: 'Carrefour',

        cashPrice: '',

        installmentsQuantity: '',

        installmentPrice: '',
      })

        loadProducts()
      }

    // ====================================
    // DELETE PRODUCT
    // ====================================

    const deleteProduct =
      async (id) => {

        await fetch(
          `http://localhost:3000/products/${id}`,

          {
            method: 'DELETE',
          }
        )

        loadProducts()
      }

    // ====================================
    // DELETE OFFER
    // ====================================
      <button
        onClick={() =>
          deleteOffer(offer.id)
        }
        style={styles.deleteSmall}
      >
        X
      </button> 
    const deleteOffer =
      async (id) => {

        await fetch(
          `http://localhost:3000/offers/${id}`,

          {
            method: 'DELETE',
          }
        )

        loadProducts()
      }

    // ====================================
    // EDIT PRODUCT
    // ====================================

    const startEdit = (product) => {

      setEditingProduct({

        id: product.id,

        name: product.name,

        brand_id: product.brand_id,

        category_id: product.category_id,

        rating: product.rating,

        image: product.image,
})
    }

    const saveEdit =
      async () => {

        await fetch(

          `http://localhost:3000/products/${editingProduct.id}`,

          {
            method: 'PUT',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              editingProduct
            ),
          }
        )

        setEditingProduct(null)

        loadProducts()
      }

    // ====================================
    // CREATE ADMIN
    // ====================================

    const createAdmin =
      async () => {

        await fetch(
          'http://localhost:3000/admins',

          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              adminForm
            ),
          }
        )

        setAdminForm({

          username: '',
          password: '',
        })

        loadAdmins()
      }
// ====================================
// CREATE CATEGORY
// ====================================

const createCategory = async () => {

  if (!newCategory) return

  const res = await fetch(
    'http://localhost:3000/categories',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: newCategory,
      }),
    }
  )

  const data = await res.json()

  console.log(data)

  if (!res.ok) {
    alert(data.error)
    return
  }

  setNewCategory('')

  loadCategories()
}

// ====================================
// CREATE BRAND
// ====================================
const createBrand = async () => {

  if (!newBrand) return

  const res = await fetch(
    'http://localhost:3000/brands',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: newBrand,
      }),
    }
  )

  const data = await res.json()

  console.log(data)

  if (!res.ok) {
    alert(data.error)
    return
  }

  setNewBrand('')

  loadBrands()
}
    // ====================================
    // UI
    // ====================================

    return (

      <div style={styles.page}>

        {/* HEADER */}

        <div style={styles.header}>

          <h1 style={styles.title}>
            PANEL ADMIN
          </h1>

        </div>
{/* ================================= */}
{/* CATEGORIES */}
{/* ================================= */}

<div style={styles.section}>

  <h2>
    Categorías
  </h2>

  <div style={styles.grid}>

    <input
      placeholder="Nueva categoría"
      value={newCategory}
      onChange={(e) =>
        setNewCategory(
          e.target.value
        )
      }
      style={styles.input}
    />

  </div>

  <button
    onClick={createCategory}
    style={styles.button}
  >
    Agregar categoría
  </button>

  <div
    style={{
      marginTop: '20px',
    }}
  >
    {categories.map((cat) => (

      <div
        key={cat.id}
        style={styles.adminCard}
      >
        {cat.name}
      </div>

    ))}
  </div>

</div>

{/* ================================= */}
{/* BRANDS */}
{/* ================================= */}

<div style={styles.section}>

  <h2>
    Marcas
  </h2>

  <div style={styles.grid}>

    <input
      placeholder="Nueva marca"
      value={newBrand}
      onChange={(e) =>
        setNewBrand(
          e.target.value
        )
      }
      style={styles.input}
    />

  </div>

  <button
    onClick={createBrand}
    style={styles.button}
  >
    Agregar marca
  </button>

  <div
    style={{
      marginTop: '20px',
    }}
  >
    {brands.map((brand) => (

      <div
        key={brand.id}
        style={styles.adminCard}
      >
        {brand.name}
      </div>

    ))}
  </div>

</div>
        {/* ================================= */}
        {/* CREATE PRODUCT */}
        {/* ================================= */}

        <div style={styles.section}>

          <h2>
            Agregar Producto / Oferta
          </h2>
  <div
    style={{
      marginBottom: '20px',
      background: '#fff',
      padding: '15px',
      borderRadius: '12px',
    }}
  >

    <h3>
      Importar CSV
    </h3>

    <input
      type='file'

      accept='.csv'

      onChange={async (e) => {

        const file =
          e.target.files[0]

        if (!file) return

        const formData =
          new FormData()

        formData.append(
          'file',
          file
        )

        try {

          const response =
            await fetch(

              'http://localhost:3000/upload-csv',

              {
                method: 'POST',
                body: formData,
              }
            )

          const data =
            await response.json()

          if (data.success) {

            alert(
              'CSV importado correctamente'
            )

            window.location.reload()

          } else {

            alert(
              'Error importando CSV'
            )
          }

        } catch (err) {

          console.log(err)

          alert(
            'Error subiendo archivo'
          )
        }
      }}
    />
  </div>
          <div style={styles.grid}>

            <input
              placeholder='Nombre'

              value={form.name}

              onChange={(e) =>
                setForm({

                  ...form,

                  name:
                    e.target.value,
                })
              }

              style={styles.input}
            />

            <select
              value={form.brand_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  brand_id: e.target.value,
                })
              }
              style={styles.input}
            >

              <option value=''>
                Seleccionar marca
              </option>

              {brands.map((brand) => (

                <option
                  key={brand.id}
                  value={brand.id}
                >
                  {brand.name}
                </option>

              ))}

            </select>

            <select
              value={form.category_id}

              onChange={(e) =>
                setForm({

                  ...form,

                  category_id:
                    e.target.value,
                })
              }

              style={styles.input}
            >

              <option value=''>
                Seleccionar categoría
              </option>

              {categories.map((category) => (

                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>

              ))}

            </select>

            <input
              type='number'

              placeholder='Calificación'

              value={form.rating}

              onChange={(e) =>
                setForm({

                  ...form,

                  rating:
                    e.target.value,
                })
              }

              style={styles.input}
            />

            <input
              placeholder='URL Imagen'

              value={form.image}

              onChange={(e) =>
                setForm({

                  ...form,

                  image:
                    e.target.value,
                })
              }

              style={styles.input}
            />

            <select
              value={form.supermarket}

              onChange={(e) =>
                setForm({

                  ...form,

                  supermarket:
                    e.target.value,
                })
              }

              style={styles.input}
            >

              <option>
                Carrefour
              </option>

              <option>
                Coto
              </option>

              <option>
                Jumbo
              </option>

              <option>
                Disco
              </option>

            </select>

            <input
              type='number'

              placeholder='Precio contado'

              value={form.cashPrice}

              onChange={(e) =>
                setForm({

                  ...form,

                  cashPrice:
                    e.target.value,
                })
              }

              style={styles.input}
            />

            <input
              type='number'

              placeholder='Cantidad cuotas'

              value={
                form.installmentsQuantity
              }

              onChange={(e) =>
                setForm({

                  ...form,

                  installmentsQuantity:
                    e.target.value,
                })
              }

              style={styles.input}
            />

            <input
              type='number'

              placeholder='Valor cuota'

              value={
                form.installmentPrice
              }

              onChange={(e) =>
                setForm({

                  ...form,

                  installmentPrice:
                    e.target.value,
                })
              }

              style={styles.input}
            />
          </div>

          {/* TOTAL */}

          {form.installmentsQuantity &&
            form.installmentPrice && (

              <div
                style={styles.totalBox}
              >

                Total financiado:

                <strong>

                  {' '}
                  $

                  {
                    Number(
                      form.installmentsQuantity
                    )

                    *

                    Number(
                      form.installmentPrice
                    )
                  }
                </strong>
              </div>
            )}

          <button
            onClick={createProduct}

            style={styles.button}
          >
            Agregar producto
          </button>
        </div>

        {/* ================================= */}
        {/* PRODUCTS */}
        {/* ================================= */}

        <div style={styles.section}>

          <h2>
            Productos
          </h2>

          {products.map((product) => (

            <div
              key={product.id}
              style={styles.productCard}
            >

              <div style={styles.productTop}>

                <img
                  src={
                    product.image ||
                    'https://placehold.co/300x200'
                  }

                  alt={product.name}

                  style={styles.image}
                />

                <div>

                  <h2>
                    {product.name}
                  </h2>

                  <p>
                    Marca:
                    {' '}
                    {product.brands?.name}
                  </p>

                  <p>
                    Categoría:
                    {' '}
                    {product.categories?.name}
                  </p>

                  <p>
                    ⭐
                    {' '}
                    {product.rating}
                  </p>

                </div>
              </div>

              {/* OFFERS */}

              <div
                style={{
                  marginTop: '20px',
                }}
              >

                {product.offers?.map(
                  (offer) => (

                    <div
                      key={offer.id}
                      style={styles.offer}
                    >

                      <div>

                        <strong>
                          {
                            offer.supermarket
                          }
                        </strong>

                        <p>
                          Contado:
                          {' '}
                          $
                          {
                            offer.cash_price
                          }
                        </p>

                        {offer.installments_quantity && (

                          <p>

                            {
                              offer.installments_quantity
                            }

                            x $

                            {
                              offer.installment_price
                            }

                            {' '}
                            = $

                            {
                              offer.installments_quantity *

                              offer.installment_price
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* ACTIONS */}

              <div style={styles.actions}>

                <button
                  onClick={() =>
                    startEdit(product)
                  }

                  style={styles.editButton}
                >
                  Editar
                </button>

                <button
                  onClick={() =>
                    deleteProduct(
                      product.id
                    )
                  }

                  style={
                    styles.deleteButton
                  }
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ================================= */}
        {/* EDIT MODAL */}
        {/* ================================= */}

        {editingProduct && (

          <div style={styles.modal}>

            <div
              style={styles.modalContent}
            >

              <h2>
                Editar Producto
              </h2>

              <div style={styles.grid}>

                <input
                  value={
                    editingProduct.name
                  }

                  onChange={(e) =>
                    setEditingProduct({

                      ...editingProduct,

                      name:
                        e.target.value,
                    })
                  }

                  style={styles.input}
                />

                <select
                  value={editingProduct.brand_id}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      brand_id: Number(e.target.value),
                    })
                  }
                  style={styles.input}
                >

                  {brands.map((brand) => (

                    <option
                      key={brand.id}
                      value={brand.id}
                    >
                      {brand.name}
                    </option>

                  ))}

                </select>

                <select
                  value={editingProduct.category_id}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      category_id: Number(e.target.value),
                    })
                  }
                  style={styles.input}
                >

                  {categories.map((category) => (

                    <option
                      key={category.id}
                      value={category.id}
                    >
                      {category.name}
                    </option>

                  ))}

                </select>

                <input
                  type='number'

                  value={
                    editingProduct.rating
                  }

                  onChange={(e) =>
                    setEditingProduct({

                      ...editingProduct,

                      rating:
                        e.target.value,
                    })
                  }

                  style={styles.input}
                />

                <input
                  value={
                    editingProduct.image
                  }

                  onChange={(e) =>
                    setEditingProduct({

                      ...editingProduct,

                      image:
                        e.target.value,
                    })
                  }

                  style={styles.input}
                />
              </div>

              <div style={styles.actions}>

                <button
                  onClick={saveEdit}

                  style={styles.button}
                >
                  Guardar
                </button>

                <button
                  onClick={() =>
                    setEditingProduct(
                      null
                    )
                  }

                  style={
                    styles.deleteButton
                  }
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================= */}
        {/* ADMINS */}
        {/* ================================= */}

        <div style={styles.section}>

          <h2>
            Administradores
          </h2>

          <div style={styles.grid}>

            <input
              placeholder='Usuario'

              value={
                adminForm.username
              }

              onChange={(e) =>
                setAdminForm({

                  ...adminForm,

                  username:
                    e.target.value,
                })
              }

              style={styles.input}
            />

            <input
              placeholder='Contraseña'

              value={
                adminForm.password
              }

              onChange={(e) =>
                setAdminForm({

                  ...adminForm,

                  password:
                    e.target.value,
                })
              }

              style={styles.input}
            />
          </div>

          <button
            onClick={createAdmin}

            style={styles.button}
          >
            Crear admin
          </button>

          <div
            style={{
              marginTop: '20px',
            }}
          >

            {admins.map((admin) => (

              <div
                key={admin.id}
                style={styles.adminCard}
              >

                👤 {admin.username}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const styles = {

    page: {

      padding: '40px',

      background:
        '#F3F4F6',

      minHeight: '100vh',

      fontFamily:
        'Arial',
    },

    header: {

      display: 'flex',

      justifyContent:
        'space-between',

      alignItems: 'center',
    },

    title: {

      fontSize: '44px',

      color: '#2563EB',
    },

    section: {

      background: 'white',

      padding: '30px',

      borderRadius: '24px',

      marginTop: '30px',

      boxShadow:
        '0 4px 16px rgba(0,0,0,0.08)',
    },

    grid: {

      display: 'grid',

      gridTemplateColumns:
        'repeat(auto-fit,minmax(220px,1fr))',

      gap: '16px',

      marginTop: '20px',
    },

    input: {

      padding: '14px',

      borderRadius: '12px',

      border:
        '1px solid #D1D5DB',
    },

    button: {

      marginTop: '20px',

      background:
        '#2563EB',

      color: 'white',

      border: 'none',

      padding:
        '14px 20px',

      borderRadius: '12px',

      cursor: 'pointer',
    },

    totalBox: {

      marginTop: '20px',

      background:
        '#DCFCE7',

      padding: '14px',

      borderRadius: '12px',
    },

    productCard: {

      background:
        '#F9FAFB',

      padding: '24px',

      borderRadius: '18px',

      marginTop: '20px',
    },

    productTop: {

      display: 'flex',

      gap: '20px',
    },

    image: {

      width: '160px',

      height: '160px',

      objectFit: 'cover',

      borderRadius: '16px',
    },

    offer: {

      background:
        'white',

      padding: '14px',

      borderRadius: '12px',

      marginBottom: '10px',

      display: 'flex',

      justifyContent:
        'space-between',

      alignItems: 'center',
    },

    deleteSmall: {

      background:
        '#EF4444',

      color: 'white',

      border: 'none',

      width: '34px',

      height: '34px',

      borderRadius: '8px',

      cursor: 'pointer',
    },

    actions: {

      display: 'flex',

      gap: '12px',

      marginTop: '20px',
    },

    editButton: {

      background:
        '#F59E0B',

      color: 'white',

      border: 'none',

      padding:
        '12px 16px',

      borderRadius: '10px',

      cursor: 'pointer',
    },

    deleteButton: {

      background:
        '#DC2626',

      color: 'white',

      border: 'none',

      padding:
        '12px 16px',

      borderRadius: '10px',

      cursor: 'pointer',
    },

    modal: {

      position: 'fixed',

      inset: 0,

      background:
        'rgba(0,0,0,0.5)',

      display: 'flex',

      justifyContent:
        'center',

      alignItems: 'center',
    },

    modalContent: {

      background: 'white',

      padding: '30px',

      borderRadius: '20px',

      width: '700px',

      maxWidth: '95%',
    },

    adminCard: {

      background:
        '#EFF6FF',

      padding: '14px',

      borderRadius: '10px',

      marginBottom: '10px',
    },
}
