import React, { useEffect, useMemo, useState } from 'react'

function App() {
  // =========================
  // STATES
  // =========================

  const [products, setProducts] = useState([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Todos')
  const [loading, setLoading] = useState(false)

  // =========================
  // FETCH PRODUCTS
  // =========================

  const getProducts = async (reset = false) => {
    try {
      setLoading(true)

      const currentPage = reset ? 1 : page

      const res = await fetch(
        `http://localhost:3000/products?page=${currentPage}&limit=20&search=${search}`
      )

      const data = await res.json()

      if (!Array.isArray(data)) return

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
  // INIT
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
    }, 400)

    return () => clearTimeout(timeout)
  }, [search])

  // =========================
  // FILTER
  // =========================

  const filteredProducts = useMemo(() => {
    return (products || []).filter((product) => {
      const matchSearch =
        product.name?.toLowerCase().includes(search.toLowerCase())

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

      <div style={styles.header}>
        <h1 style={styles.logo}>ARPRICE</h1>
        <p style={styles.subtitle}>
          Compará precios entre supermercados
        </p>
      </div>

      <input
        style={styles.search}
        value={search}
        placeholder="Buscar productos"
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={styles.filters}>
        {['Todos', 'Canasta Básica', 'Higiene', 'Electrónica', 'Bebidas'].map(
          (cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                ...styles.filterButton,
                background: filter === cat ? '#2563EB' : 'white',
                color: filter === cat ? 'white' : '#111',
              }}
            >
              {cat}
            </button>
          )
        )}
      </div>

      <div style={styles.grid}>
        {filteredProducts.map((product) => {
          const sortedOffers = [...(product.offers || [])].sort(
            (a, b) => a.cash_price - b.cash_price
          )

          const cheapest = sortedOffers[0]
          const second = sortedOffers[1]

          let savings = 0
          let percent = 0

          if (cheapest && second) {
            savings = second.cash_price - cheapest.cash_price
            percent = (savings / second.cash_price) * 100
          }

          return (
            <div key={product.id} style={styles.card}>

              <img
                src={product.image || 'https://placehold.co/400x300'}
                style={styles.image}
                alt={product.name}
              />

              <div style={styles.info}>
                <h2>{product.name}</h2>
                <p>{product.brands?.name}</p>
                <p>{product.categories?.name}</p>

                <p>⭐ {product.rating}</p>

                {/* MEJOR PRECIO */}
                {cheapest && (
                  <div style={styles.bestPrice}>
                    Mejor precio: <b>${cheapest.cash_price}</b>
                    <div>{cheapest.supermarket}</div>
                  </div>
                )}

                {/* AHORRO */}
                {second && (
                  <div style={styles.savings}>
                    Ahorrás: <b>${savings}</b> ({percent.toFixed(1)}%)
                  </div>
                )}

                {/* TODAS LAS OFERTAS */}
                <div style={{ marginTop: '15px' }}>
                  <h4>Opciones:</h4>

                  {sortedOffers.map((offer) => (
                    <div key={offer.id} style={styles.offer}>
                      <div>
                        <strong>{offer.supermarket}</strong>

                        <div>
                          Contado: ${offer.cash_price}
                        </div>

                        {offer.installments_quantity && (
                          <div>
                            {offer.installments_quantity} cuotas de ${offer.installment_price}
                            <div>
                              Total: $
                              {offer.installments_quantity * offer.installment_price}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
  },
  search: {
    width: '100%',
    padding: '18px',
    borderRadius: '16px',
    border: '1px solid #D1D5DB',
    marginBottom: '20px',
  },
  filters: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '30px',
  },
  filterButton: {
    padding: '10px 16px',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))',
    gap: '20px',
  },
  card: {
    background: 'white',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  image: {
    width: '100%',
    height: '220px',
    objectFit: 'cover',
  },
  info: {
    padding: '20px',
  },
  bestPrice: {
    marginTop: '10px',
    background: '#DCFCE7',
    padding: '10px',
    borderRadius: '10px',
  },
  savings: {
    marginTop: '10px',
    background: '#DBEAFE',
    padding: '10px',
    borderRadius: '10px',
  },
  offer: {
    background: '#F9FAFB',
    padding: '12px',
    borderRadius: '12px',
    marginBottom: '10px',
  },
}

export default App