import React,
{
  useEffect,
  useMemo,
  useState,
} from 'react'

function App() {

  const [products, setProducts] =
    useState([])

  const [search, setSearch] =
    useState('')

  const [filter, setFilter] =
    useState('Todos')

  // =========================
  // LOAD PRODUCTS
  // =========================

  useEffect(() => {

    fetch(
      'http://localhost:3000/products'
    )
      .then((res) => res.json())
      .then((data) =>
        setProducts(data)
      )

  }, [])

  // =========================
  // FILTER PRODUCTS
  // =========================

  const filteredProducts =
    useMemo(() => {

      return products.filter(
        (product) => {

          const matchSearch =

            product.name
              ?.toLowerCase()
              .includes(
                search.toLowerCase()
              )

          const matchFilter =

            filter === 'Todos'

            ||

            product.category ===
              filter

          return (
            matchSearch &&
            matchFilter
          )
        }
      )

    }, [
      products,
      search,
      filter,
    ])

  // =========================
  // UI
  // =========================

  return (

    <div style={styles.page}>

      {/* HEADER */}

      <div style={styles.header}>

        <div>

          <h1 style={styles.logo}>
            ARPRICE
          </h1>

          <p style={styles.subtitle}>
            Compará precios
            entre supermercados
          </p>

        </div>
      </div>

      {/* SEARCH */}

      <input
        placeholder='Buscar producto...'

        value={search}

        onChange={(e) =>
          setSearch(
            e.target.value
          )
        }

        style={styles.search}
      />

      {/* FILTERS */}

      <div style={styles.filters}>

        {[
          'Todos',
          'Canasta Básica',
          'Higiene',
          'Electrónica',
          'Bebidas',
        ].map((cat) => (

          <button
            key={cat}

            onClick={() =>
              setFilter(cat)
            }

            style={{
              ...styles.filterButton,

              background:
                filter === cat
                  ? '#2563EB'
                  : 'white',

              color:
                filter === cat
                  ? 'white'
                  : '#111827',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* PRODUCTS */}

      <div style={styles.grid}>

        {filteredProducts.map(
          (product) => {

            // =====================
            // SORT OFFERS
            // =====================

            const sortedOffers =

              [...product.offers]

                .sort(
                  (a, b) =>

                    a.cash_price -
                    b.cash_price
                )

            const cheapest =
              sortedOffers[0]

            const secondCheapest =
              sortedOffers[1]

            // =====================
            // SAVINGS
            // =====================

            let savings = 0
            let savingsPercent = 0

            if (
              cheapest &&
              secondCheapest
            ) {

              savings =

                secondCheapest.cash_price

                -

                cheapest.cash_price

              savingsPercent =

                (
                  savings /

                  secondCheapest.cash_price
                )

                * 100
            }

            return (

              <div
                key={product.id}
                style={styles.card}
              >

                {/* IMAGE */}

                <img

                  src={
                    product.image ||

                    'https://placehold.co/400x300'
                  }

                  alt={product.name}

                  style={styles.image}
                />

                {/* INFO */}

                <div style={styles.info}>

                  <h2 style={styles.name}>
                    {product.name}
                  </h2>

                  <p style={styles.brand}>
                    {product.brand}
                  </p>

                  <p style={styles.category}>
                    {product.category}
                  </p>

                  <p style={styles.rating}>
                    ⭐ {product.rating}
                  </p>

                  {/* BEST PRICE */}

                  {cheapest && (

                    <div
                      style={styles.bestPrice}
                    >

                      Mejor precio:

                      <strong>

                        {' '}
                        $

                        {
                          cheapest.cash_price
                        }
                      </strong>

                      <div>

                        {
                          cheapest.supermarket
                        }

                      </div>
                    </div>
                  )}

                  {/* SAVINGS */}

                  {secondCheapest && (

                    <div
                      style={styles.savings}
                    >

                      Ahorrás:

                      <strong>

                        {' '}
                        $

                        {
                          savings
                        }

                      </strong>

                      {' '}
                      (

                      {
                        savingsPercent.toFixed(
                          1
                        )
                      }

                      %)

                    </div>
                  )}

                  {/* OFFERS */}

                  <div
                    style={{
                      marginTop: '20px',
                    }}
                  >

                    {sortedOffers.map(
                      (offer) => {

                        const financedTotal =

                          offer.installments_quantity

                          *

                          offer.installment_price

                        return (

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

                              <div>

                                Contado:

                                {' '}

                                $

                                {
                                  offer.cash_price
                                }
                              </div>

                              {/* INSTALLMENTS */}

                              {offer.installments_quantity && (

                                <div
                                  style={{
                                    marginTop: '6px',
                                  }}
                                >

                                  {

                                    offer.installments_quantity
                                  }

                                  {' '}
                                  cuotas de

                                  {' '}
                                  $

                                  {
                                    offer.installment_price
                                  }

                                  <div
                                    style={{
                                      color:
                                        '#2563EB',
                                    }}
                                  >

                                    Total:

                                    {' '}

                                    $

                                    {
                                      financedTotal
                                    }
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                </div>
              </div>
            )
          }
        )}
      </div>
    </div>
  )
}

// =========================
// STYLES
// =========================

const styles = {

  page: {

    background:
      '#F3F4F6',

    minHeight: '100vh',

    padding: '40px',

    fontFamily:
      'Arial',
  },

  header: {

    display: 'flex',

    justifyContent:
      'space-between',

    alignItems: 'center',

    marginBottom: '30px',
  },

  logo: {

    fontSize: '52px',

    color: '#2563EB',

    margin: 0,
  },

  subtitle: {

    color: '#6B7280',

    marginTop: '8px',
  },

  search: {

    width: '100%',

    padding: '18px',

    borderRadius: '16px',

    border:
      '1px solid #D1D5DB',

    marginBottom: '25px',

    fontSize: '16px',
  },

  filters: {

    display: 'flex',

    gap: '12px',

    flexWrap: 'wrap',

    marginBottom: '30px',
  },

  filterButton: {

    padding:
      '12px 18px',

    borderRadius: '12px',

    border: 'none',

    cursor: 'pointer',

    fontWeight: 'bold',
  },

  grid: {

    display: 'grid',

    gridTemplateColumns:
      'repeat(auto-fit,minmax(340px,1fr))',

    gap: '24px',
  },

  card: {

    background: 'white',

    borderRadius: '24px',

    overflow: 'hidden',

    boxShadow:
      '0 4px 18px rgba(0,0,0,0.08)',
  },

  image: {

    width: '100%',

    height: '260px',

    objectFit: 'cover',
  },

  info: {

    padding: '24px',
  },

  name: {

    margin: 0,

    fontSize: '28px',
  },

  brand: {

    color: '#6B7280',

    marginTop: '8px',
  },

  category: {

    color: '#2563EB',

    marginTop: '6px',
  },

  rating: {

    marginTop: '10px',
  },

  bestPrice: {

    marginTop: '18px',

    background:
      '#DCFCE7',

    padding: '14px',

    borderRadius: '14px',
  },

  savings: {

    marginTop: '14px',

    background:
      '#DBEAFE',

    padding: '14px',

    borderRadius: '14px',
  },

  offer: {

    background:
      '#F9FAFB',

    padding: '14px',

    borderRadius: '14px',

    marginBottom: '12px',
  },
}

export default App