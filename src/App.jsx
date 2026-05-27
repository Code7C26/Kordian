import React, { useEffect, useMemo, useState } from 'react'

function App() {
  // =========================
  // STATES
  // =========================

  const [products, setProducts] = useState([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('Todos')

  // =========================
  // GET PRODUCTS
  // =========================

  const getProducts = async (reset = false) => {
    try {
      setLoading(true)

      const currentPage = reset ? 1 : page

      const response = await fetch(
        `http://localhost:3000/products?page=${currentPage}&limit=20&search=${search}`
      )

      const data = await response.json()

      if (reset) {
        setProducts(data)
        setPage(2)
      } else {
        setProducts((prev) => [...prev, ...data])
        setPage((prev) => prev + 1)
      }
    } catch (err) {
      console.log(err)
    } finally {
      setLoading(false)
    }
  }

  // =========================
  // LOAD INITIAL
  // =========================

  useEffect(() => {
    getProducts(true)
  }, [])

  // =========================
  // SEARCH
  // =========================

  useEffect(() => {
    const timeout = setTimeout(() => {
      getProducts(true)
    }, 500)

    return () => clearTimeout(timeout)
  }, [search])

  // =========================
  // FILTER
  // =========================

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchSearch = product.name
        ?.toLowerCase()
        .includes(search.toLowerCase())

      const matchFilter =
        filter === 'Todos' || product.category === filter

      return matchSearch && matchFilter
    })
  }, [products, search, filter])

  // =========================
  // UI
  // =========================

  return (
    <div style={styles.page}>
      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.logo}>ARPRICE</h1>
          <p style={styles.subtitle}>
            Compará precios entre supermercados
          </p>
        </div>
      </div>

      {/* SEARCH */}
      <input
        type="text"
        placeholder="Buscar productos"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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
            onClick={() => setFilter(cat)}
            style={{
              ...styles.filterButton,
              background: filter === cat ? '#2563EB' : 'white',
              color: filter === cat ? 'white' : '#111827',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* PRODUCTS */}
      <div style={styles.grid}>
        {filteredProducts.map((product) => {
          const sortedOffers = [...(product.offers || [])].sort(
            (a, b) => a.cash_price - b.cash_price
          )

          const cheapest = sortedOffers[0]
          const secondCheapest = sortedOffers[1]

          let savings = 0
          let savingsPercent = 0

          if (cheapest && secondCheapest) {
            savings = secondCheapest.cash_price - cheapest.cash_price
            savingsPercent =
              (savings / secondCheapest.cash_price) * 100
          }

          return (
            <div key={product.id} style={styles.card}>
              <img
                src={
                  product.image ||
                  'https://placehold.co/400x300'
                }
                alt={product.name}
                style={styles.image}
              />

              <div style={styles.info}>
                <h2 style={styles.name}>{product.name}</h2>
                <p style={styles.brand}>{product.brand}</p>
                <p style={styles.category}>{product.category}</p>
                <p style={styles.rating}>⭐ {product.rating}</p>

                {cheapest && (
                  <div style={styles.bestPrice}>
                    Mejor precio:{' '}
                    <strong>${cheapest.cash_price}</strong>
                    <div>{cheapest.supermarket}</div>
                  </div>
                )}

                {secondCheapest && (
                  <div style={styles.savings}>
                    Ahorrás:{' '}
                    <strong>${savings}</strong> (
                    {savingsPercent.toFixed(1)}%)
                  </div>
                )}

                <div style={{ marginTop: '20px' }}>
                  {sortedOffers.map((offer) => {
                    const total =
                      (offer.installments_quantity || 0) *
                      (offer.installment_price || 0)

                    return (
                      <div key={offer.id} style={styles.offer}>
                        <div>
                          <strong>{offer.supermarket}</strong>
                          <div>
                            Contado: ${offer.cash_price}
                          </div>

                          {offer.installments_quantity && (
                            <div style={{ marginTop: 6 }}>
                              {offer.installments_quantity} cuotas de $
                              {offer.installment_price}
                              <div style={{ color: '#2563EB' }}>
                                Total: ${total}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =========================
// STYLES
// =========================

const styles = {
  page: {
    background: '#F3F4F6',
    minHeight: '100vh',
    padding: '40px',
    fontFamily: 'Arial',
  },
  header: {
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
    border: '1px solid #D1D5DB',
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
    padding: '12px 18px',
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
    boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
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
    background: '#DCFCE7',
    padding: '14px',
    borderRadius: '14px',
  },
  savings: {
    marginTop: '14px',
    background: '#DBEAFE',
    padding: '14px',
    borderRadius: '14px',
  },
  offer: {
    background: '#F9FAFB',
    padding: '14px',
    borderRadius: '14px',
    marginBottom: '12px',
  },
}

export default App