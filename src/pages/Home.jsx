import {
  useEffect,
  useState,
} from 'react'

export default function Home() {
  // =========================
  // STATES
  // =========================

  const [products, setProducts] =
    useState([])

  const [search, setSearch] =
    useState('')

  const [
    supermarketFilter,
    setSupermarketFilter,
  ] = useState('Todos')

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState('Todas')

  // =========================
  // API CALL
  // =========================

  useEffect(() => {
    fetch(
      'http://localhost:3000/products'
    )
      .then((res) => res.json())
      .then((data) => {
        console.log(data)

        setProducts(data)
      })
      .catch((error) =>
        console.log(error)
      )
  }, [])

  // =========================
  // CATEGORÍAS ÚNICAS
  // =========================

  const categories = [
    'Todas',

    ...new Set(
      products.map(
        (product) =>
          product.category
      )
    ),
  ]

  // =========================
  // FILTRADO
  // =========================

  const filteredProducts =
    products.filter((product) => {
      const matchesSearch =
        product.name
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||

        product.brands?.name
          ?.toLowerCase()
          .includes(search.toLowerCase()) ||

        product.categories?.name
          ?.toLowerCase()
          .includes(search.toLowerCase())

      const matchesSupermarket =
        supermarketFilter ===
          'Todos' ||
        product.offers?.some(
          (offer) =>
            offer.supermarket ===
            supermarketFilter
        )

      const matchesCategory =
        categoryFilter ===
          'Todas' ||
        product.category ===
          categoryFilter

      return (
        matchesSearch &&
        matchesSupermarket &&
          'http://localhost:62752/products'
      )
    })

  // =========================
  // UI
  // =========================

  return (
    <div
      style={{
        backgroundColor:
          '#F3F4F6',

        minHeight: '100vh',
      }}
    >
      {/* NAVBAR */}

      <div
        style={{
          backgroundColor:
            'white',

          padding: '20px 40px',

          display: 'flex',

          justifyContent:
            'space-between',

          alignItems: 'center',

          flexWrap: 'wrap',

          gap: '20px',

          boxShadow:
            '0 2px 10px rgba(0,0,0,0.08)',

          position: 'sticky',

          top: 0,

          zIndex: 100,
        }}
      >
        <h1
          style={{
            fontSize: '38px',

            color: '#2563EB',

            fontWeight: '800',
          }}
        >
          AR-PRICE
        </h1>

        <div
          style={{
            display: 'flex',

            gap: '15px',

            flexWrap: 'wrap',
          }}
        >
          {/* BUSCADOR */}

          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            style={{
              padding: '12px',

              borderRadius:
                '10px',

              border:
                '1px solid #D1D5DB',

              width: '240px',
            }}
          />

          {/* FILTRO SUPERMERCADO */}

          <select
            value={
              supermarketFilter
            }
            onChange={(e) =>
              setSupermarketFilter(
                e.target.value
              )
            }
            style={{
              padding: '12px',

              borderRadius:
                '10px',

              border:
                '1px solid #D1D5DB',
            }}
          >
            <option>
              Todos
            </option>

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
          </select>

          {/* FILTRO CATEGORÍA */}

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(
                e.target.value
              )
            }
            style={{
              padding: '12px',

              borderRadius:
                '10px',

              border:
                '1px solid #D1D5DB',
            }}
          >
            {categories.map(
              (category) => (
                <option
                  key={category}
                >
                  {category}
                </option>
              )
            )}
          </select>
        </div>
      </div>

      {/* HERO */}

      <div
        style={{
          padding:
            '60px 40px 20px',
        }}
      >
        <h2
          style={{
            fontSize: '52px',

            marginBottom:
              '15px',
          }}
        >
          Compará precios
          inteligentes
        </h2>

        <p
          style={{
            fontSize: '20px',

            color: '#6B7280',
          }}
        >
          Encontrá el mejor
          precio y ahorrá
          automáticamente.
        </p>
      </div>

      {/* PRODUCTOS */}

      <div
        style={{
          padding: '20px 40px',

          display: 'grid',

          gridTemplateColumns:
            'repeat(auto-fit, minmax(350px, 1fr))',

          gap: '25px',
        }}
      >
        {filteredProducts.map(
          (product) => {
            const cheapestOffer =
              product.offers?.reduce(
                (
                  min,
                  offer
                ) =>
                  offer.cashPrice <
                  min.cashPrice
                    ? offer
                    : min
              )

            const highestOffer =
              product.offers?.reduce(
                (
                  max,
                  offer
                ) =>
                  offer.cashPrice >
                  max.cashPrice
                    ? offer
                    : max
              )

            if (
              !cheapestOffer ||
              !highestOffer
            ) {
              return null
            }

            const savings =
              highestOffer.cashPrice -
              cheapestOffer.cashPrice

            const savingsPercentage =
              (
                (savings /
                  highestOffer.cashPrice) *
                100
              ).toFixed(1)

            return (
              <div
                key={product.id}
                style={{
                  backgroundColor:
                    'white',

                  padding: '25px',

                  borderRadius:
                    '20px',

                  boxShadow:
                    '0 4px 12px rgba(0,0,0,0.08)',
                }}
              >
                <p
                  style={{
                    color:
                      '#2563EB',

                    fontWeight:
                      '600',

                    marginBottom:
                      '10px',
                  }}
                >
                  {
                    product.category
                  }
                </p>

                <h2
                  style={{
                    fontSize:
                      '26px',

                    marginBottom:
                      '10px',
                  }}
                >
                  {product.name}
                </h2>

                <p
                  style={{
                    marginBottom:
                      '20px',

                    color:
                      '#666',
                  }}
                >
                  ⭐ {product.rating} {' '}
                  •
                  {' '}
                  {product.brands?.name}
                </p>

                {/* MEJOR PRECIO */}

                <div
                  style={{
                    backgroundColor:
                      '#DCFCE7',

                    padding:
                      '15px',

                    borderRadius:
                      '14px',

                    marginBottom:
                      '20px',
                  }}
                >
                  <p>
                    Mejor
                    precio
                  </p>

                  <h3
                    style={{
                      fontSize:
                        '32px',

                      color:
                        '#16A34A',
                    }}
                  >
                    $
                    {
                      cheapestOffer.cashPrice
                    }
                  </h3>

                  <p>
                    en{' '}
                    {
                      cheapestOffer.supermarket
                    }
                  </p>

                  <p
                    style={{
                      marginTop:
                        '10px',

                      fontWeight:
                        '600',

                      color:
                        '#15803D',
                    }}
                  >
                    Ahorrás $
                    {savings} (
                    {
                      savingsPercentage
                    }
                    %)
                  </p>
                </div>

                {/* OFERTAS */}

                {product.offers?.map(
                  (
                    offer,
                    index
                  ) => {
                    const totalInstallments =
                      offer.installments
                        ? offer
                            .installments
                            .quantity *
                          offer
                            .installments
                            .installmentPrice
                        : null

                    return (
                      <div
                        key={index}
                        style={{
                          marginBottom:
                            '15px',

                          padding:
                            '15px',

                          backgroundColor:
                            '#F9FAFB',

                          borderRadius:
                            '12px',
                        }}
                      >
                        <div
                          style={{
                            display:
                              'flex',

                            justifyContent:
                              'space-between',
                          }}
                        >
                          <strong>
                            {
                              offer.supermarket
                            }
                          </strong>

                          <strong>
                            $
                            {
                              offer.cashPrice
                            }
                          </strong>
                        </div>

                        {offer.installments && (
                          <>
                            <p
                              style={{
                                marginTop:
                                  '10px',
                              }}
                            >
                              {
                                offer
                                  .installments
                                  .quantity
                              }{' '}
                              cuotas
                              de $
                              {
                                offer
                                  .installments
                                  .installmentPrice
                              }
                            </p>

                            <p
                              style={{
                                fontWeight:
                                  '600',
                              }}
                            >
                              Total: $
                              {
                                totalInstallments
                              }
                            </p>
                          </>
                        )}
                      </div>
                    )
                  }
                )}
              </div>
            )
          }
        )}
      </div>
    </div>
  )
}