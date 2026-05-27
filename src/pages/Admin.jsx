import React,
{
  useEffect,
  useState,
} from 'react'

export default function Admin() {

  // ====================================
  // STATES
  // ====================================

  const [products, setProducts] =
    useState([])

  const [admins, setAdmins] =
    useState([])

  const [editingProduct, setEditingProduct] =
    useState(null)

  const [form, setForm] =
    useState({

      name: '',
      brand: '',
      category: 'Canasta Básica',
      rating: 5,
      image: '',

      supermarket: 'Carrefour',

      cashPrice: '',

      installmentsQuantity: '',

      installmentPrice: '',
    })

  const [adminForm, setAdminForm] =
    useState({

      username: '',
      password: '',
    })

  // ====================================
  // LOAD DATA
  // ====================================

  const loadProducts =
    async () => {

      const res =
        await fetch(
          'http://localhost:3000/products'
        )

      const data =
        await res.json()

      setProducts(data)
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

  useEffect(() => {

    loadProducts()
    loadAdmins()

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
        brand: '',
        category:
          'Canasta Básica',
        rating: 5,
        image: '',

        supermarket:
          'Carrefour',

        cashPrice: '',

        installmentsQuantity:
          '',

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

  const startEdit =
    (product) => {

      setEditingProduct({

        id: product.id,

        name: product.name,
        brand: product.brand,
        category:
          product.category,
        rating:
          product.rating,
        image:
          product.image,
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

          <input
            placeholder='Marca'

            value={form.brand}

            onChange={(e) =>
              setForm({

                ...form,

                brand:
                  e.target.value,
              })
            }

            style={styles.input}
          />

          <select
            value={form.category}

            onChange={(e) =>
              setForm({

                ...form,

                category:
                  e.target.value,
              })
            }

            style={styles.input}
          >

            <option>
              Canasta Básica
            </option>

            <option>
              Higiene
            </option>

            <option>
              Electrónica
            </option>

            <option>
              Bebidas
            </option>

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
                  {product.brand}
                </p>

                <p>
                  Categoría:
                  {' '}
                  {product.category}
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

                   <button
                    onClick={() =>
                      getProducts()
                    }
                  >

                    Cargar más

                  </button>
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

              <input
                value={
                  editingProduct.brand
                }

                onChange={(e) =>
                  setEditingProduct({

                    ...editingProduct,

                    brand:
                      e.target.value,
                  })
                }

                style={styles.input}
              />

              <input
                value={
                  editingProduct.category
                }

                onChange={(e) =>
                  setEditingProduct({

                    ...editingProduct,

                    category:
                      e.target.value,
                  })
                }

                style={styles.input}
              />

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