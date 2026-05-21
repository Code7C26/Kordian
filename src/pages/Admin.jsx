import {
  useEffect,
  useState,
} from 'react'

import { useNavigate } from 'react-router-dom'

export default function Admin() {
  const navigate = useNavigate()

  // =========================
  // AUTH
  // =========================

  const logout = () => {
    localStorage.removeItem(
      'adminAuth'
    )

    navigate('/login')
  }

  // =========================
  // ADMIN USERS
  // =========================

  const savedAdmins =
    JSON.parse(
      localStorage.getItem(
        'admins'
      )
    ) || [
      {
        username: 'admin',
        password: '1234',
      },
    ]

  const [admins, setAdmins] =
    useState(savedAdmins)

  const [
    newAdminUser,
    setNewAdminUser,
  ] = useState('')

  const [
    newAdminPassword,
    setNewAdminPassword,
  ] = useState('')

  const createAdmin = () => {
    if (
      !newAdminUser ||
      !newAdminPassword
    ) {
      return
    }

    const updatedAdmins = [
      ...admins,

      {
        username:
          newAdminUser,

        password:
          newAdminPassword,
      },
    ]

    setAdmins(updatedAdmins)

    localStorage.setItem(
      'admins',
      JSON.stringify(
        updatedAdmins
      )
    )

    setNewAdminUser('')
    setNewAdminPassword('')
  }

  // =========================
  // PRODUCT STATES
  // =========================

  const [products, setProducts] =
    useState([])

  const [editingId, setEditingId] =
    useState(null)

  const [name, setName] =
    useState('')

  const [brand, setBrand] =
    useState('')

  const [category, setCategory] =
    useState('Canasta Básica')

  const [rating, setRating] =
    useState('5')

  const [
    supermarket,
    setSupermarket,
  ] = useState('Carrefour')

  const [cashPrice, setCashPrice] =
    useState('')

  const [
    installmentsQuantity,
    setInstallmentsQuantity,
  ] = useState('')

  const [
    installmentPrice,
    setInstallmentPrice,
  ] = useState('')

  const [message, setMessage] =
    useState('')

  // =========================
  // GET PRODUCTS
  // =========================

  const fetchProducts = async () => {
    const response = await fetch(
      'http://localhost:3000/products'
    )

    const data =
      await response.json()

    setProducts(data)
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  // =========================
  // SUBMIT PRODUCT
  // =========================

  const handleSubmit = async (
    e
  ) => {
    e.preventDefault()

    const productData = {
      name,
      brand,
      category,
      rating: Number(rating),

      offers: [
        {
          supermarket,

          cashPrice:
            Number(cashPrice),

          installments:
            installmentsQuantity &&
            installmentPrice
              ? {
                  quantity:
                    Number(
                      installmentsQuantity
                    ),

                  installmentPrice:
                    Number(
                      installmentPrice
                    ),
                }
              : null,
        },
      ],
    }

    try {
      // =========================
      // EDIT
      // =========================

      if (editingId) {
        await fetch(
          `http://localhost:3000/products/${editingId}`,
          {
            method: 'PUT',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              productData
            ),
          }
        )

        setMessage(
          '✅ Producto actualizado'
        )

        setEditingId(null)
      }

      // =========================
      // CREATE
      // =========================

      else {
        await fetch(
          'http://localhost:3000/products',
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(
              productData
            ),
          }
        )

        setMessage(
          '✅ Producto agregado'
        )
      }

      // =========================
      // RESET
      // =========================

      setName('')
      setBrand('')
      setCategory(
        'Canasta Básica'
      )
      setRating('5')
      setCashPrice('')
      setInstallmentsQuantity(
        ''
      )
      setInstallmentPrice('')

      fetchProducts()

      setTimeout(() => {
        setMessage('')
      }, 3000)
    } catch (error) {
      console.log(error)

      setMessage(
        '❌ Error'
      )
    }
  }

  // =========================
  // DELETE
  // =========================

  const deleteProduct = async (
    id
  ) => {
    await fetch(
      `http://localhost:3000/products/${id}`,
      {
        method: 'DELETE',
      }
    )

    fetchProducts()
  }

  // =========================
  // UI
  // =========================

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor:
          '#F3F4F6',
        padding: '40px',
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: 'flex',
          justifyContent:
            'space-between',
          alignItems: 'center',
          marginBottom: '40px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '42px',
              color: '#2563EB',
              fontWeight: '800',
            }}
          >
            PANEL ADMIN
          </h1>

          <p
            style={{
              color: '#6B7280',
              marginTop: '10px',
              fontSize: '18px',
            }}
          >
            Gestioná productos y
            ofertas
          </p>
        </div>

        <button
          onClick={logout}
          style={{
            padding: '12px 20px',
            backgroundColor:
              '#DC2626',
            border: 'none',
            borderRadius: '10px',
            color: 'white',
            fontWeight: '700',
            cursor: 'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>

      {/* CREATE ADMIN */}

      <div
        style={{
          backgroundColor:
            'white',
          padding: '30px',
          borderRadius: '20px',
          marginBottom: '40px',
          boxShadow:
            '0 4px 20px rgba(0,0,0,0.08)',
        }}
      >
        <h2
          style={{
            marginBottom: '20px',
          }}
        >
          Crear nuevo admin
        </h2>

        <div
          style={{
            display: 'flex',
            gap: '15px',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            placeholder="Usuario"
            value={newAdminUser}
            onChange={(e) =>
              setNewAdminUser(
                e.target.value
              )
            }
            style={inputStyle}
          />

          <input
            type="password"
            placeholder="Contraseña"
            value={
              newAdminPassword
            }
            onChange={(e) =>
              setNewAdminPassword(
                e.target.value
              )
            }
            style={inputStyle}
          />

          <button
            onClick={createAdmin}
            style={{
              backgroundColor:
                '#2563EB',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding:
                '14px 20px',
              cursor: 'pointer',
              fontWeight: '700',
            }}
          >
            Crear admin
          </button>
        </div>
      </div>

      {/* PRODUCT FORM */}

      <div
        style={{
          backgroundColor:
            'white',
          maxWidth: '900px',
          borderRadius: '25px',
          padding: '35px',
          boxShadow:
            '0 8px 25px rgba(0,0,0,0.08)',
        }}
      >
        <form
          onSubmit={handleSubmit}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                '1fr 1fr',
              gap: '20px',
            }}
          >
            <div>
              <label>
                Nombre del
                producto
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) =>
                  setName(
                    e.target.value
                  )
                }
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label>
                Marca
              </label>

              <input
                type="text"
                value={brand}
                onChange={(e) =>
                  setBrand(
                    e.target.value
                  )
                }
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label>
                Categoría
              </label>

              <select
                value={category}
                onChange={(e) =>
                  setCategory(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option>
                  Canasta Básica
                </option>

                <option>
                  Carnes
                </option>

                <option>
                  Verdulería
                </option>

                <option>
                  Bebidas
                </option>

                <option>
                  Limpieza
                </option>

                <option>
                  Electrodomésticos
                </option>

                <option>
                  Tecnología
                </option>

                <option>
                  Ropa
                </option>

                <option>
                  Hogar
                </option>

                <option>
                  Farmacia
                </option>

                <option>
                  Mascotas
                </option>
              </select>
            </div>

            <div>
              <label>
                Rating
              </label>

              <select
                value={rating}
                onChange={(e) =>
                  setRating(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option>
                  5
                </option>

                <option>
                  4.5
                </option>

                <option>
                  4
                </option>

                <option>
                  3.5
                </option>

                <option>
                  3
                </option>
              </select>
            </div>

            <div>
              <label>
                Supermercado
              </label>

              <select
                value={
                  supermarket
                }
                onChange={(e) =>
                  setSupermarket(
                    e.target.value
                  )
                }
                style={inputStyle}
              >
                <option>
                  Carrefour
                </option>

                <option>
                  Coto
                </option>

                <option>
                  Disco
                </option>

                <option>
                  Jumbo
                </option>

                <option>
                  Frávega
                </option>

                <option>
                  Musimundo
                </option>

                <option>
                  Mercado Libre
                </option>
              </select>
            </div>

            <div>
              <label>
                Precio contado
              </label>

              <input
                type="number"
                value={cashPrice}
                onChange={(e) =>
                  setCashPrice(
                    e.target.value
                  )
                }
                required
                style={inputStyle}
              />
            </div>
          </div>

          <button
            type="submit"
            style={{
              marginTop: '35px',
              width: '100%',
              padding: '18px',
              border: 'none',
              borderRadius: '15px',
              backgroundColor:
                editingId
                  ? '#F59E0B'
                  : '#2563EB',
              color: 'white',
              fontSize: '18px',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            {editingId
              ? 'Guardar cambios'
              : 'Agregar producto'}
          </button>

          {message && (
            <p
              style={{
                marginTop: '20px',
                textAlign: 'center',
                fontWeight: '600',
              }}
            >
              {message}
            </p>
          )}
        </form>
      </div>

      {/* PRODUCTS */}

      <div
        style={{
          marginTop: '40px',
        }}
      >
        <h2
          style={{
            marginBottom: '20px',
          }}
        >
          Productos cargados
        </h2>

        <div
          style={{
            display: 'grid',
            gap: '20px',
          }}
        >
          {products.map(
            (product) => (
              <div
                key={product.id}
                style={{
                  backgroundColor:
                    'white',
                  padding: '20px',
                  borderRadius:
                    '15px',
                  boxShadow:
                    '0 4px 10px rgba(0,0,0,0.08)',
                }}
              >
                <h3>
                  {product.name}
                </h3>

                <p>
                  {product.brand}
                </p>

                <p>
                  {product.category}
                </p>

                <div
                  style={{
                    marginTop:
                      '15px',
                    display:
                      'flex',
                    gap: '10px',
                  }}
                >
                  <button
                    onClick={() => {
                      setEditingId(
                        product.id
                      )

                      setName(
                        product.name
                      )

                      setBrand(
                        product.brand
                      )

                      setCategory(
                        product.category
                      )

                      setRating(
                        product.rating
                      )
                    }}
                    style={{
                      backgroundColor:
                        '#F59E0B',
                      border:
                        'none',
                      color:
                        'white',
                      padding:
                        '10px 15px',
                      borderRadius:
                        '10px',
                      cursor:
                        'pointer',
                    }}
                  >
                    Editar
                  </button>

                  <button
                    onClick={() =>
                      deleteProduct(
                        product.id
                      )
                    }
                    style={{
                      backgroundColor:
                        '#DC2626',
                      border:
                        'none',
                      color:
                        'white',
                      padding:
                        '10px 15px',
                      borderRadius:
                        '10px',
                      cursor:
                        'pointer',
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '14px',
  marginTop: '8px',
  borderRadius: '12px',
  border: '1px solid #D1D5DB',
  fontSize: '15px',
  outline: 'none',
  boxSizing: 'border-box',
}