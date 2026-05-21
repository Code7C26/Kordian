import React, { useEffect, useState } from 'react'

export default function App() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('Todos')

  // =========================
  // TRAER DESDE API
  // =========================

  useEffect(() => {
    fetch('http://localhost:3000/products')
      .then((res) => res.json())
      .then((data) => setProducts(data))
  }, [])

  // =========================
  // CATEGORÍAS DINÁMICAS
  // =========================

  const categorias = [
    'Todos',
    ...new Set(products.map(p => p.category))
  ]

  // =========================
  // FILTRO
  // =========================

  const productosFiltrados = products.filter((p) => {
    const matchSearch =
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.toLowerCase().includes(search.toLowerCase())

    const matchFiltro =
      filtro === 'Todos' || p.category === filtro

    return matchSearch && matchFiltro
  })

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <h1 style={styles.title}>AR-PRICE</h1>

      <p style={styles.subtitle}>
        Compará precios entre supermercados
      </p>

      {/* SEARCH */}
      <input
        style={styles.search}
        placeholder="Buscar producto o marca..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* FILTROS */}
      <div style={styles.filters}>
        {categorias.map((cat) => (
          <button
            key={cat}
            onClick={() => setFiltro(cat)}
            style={{
              ...styles.button,
              backgroundColor:
                filtro === cat ? '#2563EB' : '#eee',
              color: filtro === cat ? '#fff' : '#000',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* PRODUCTOS */}
      <div style={styles.grid}>
        {productosFiltrados.map((p) => {
          
          // 🧠 MEJOR OFERTA
          const cheapest = p.offers.reduce((min, o) =>
            o.cashPrice < min.cashPrice ? o : min
          )

          const highest = p.offers.reduce((max, o) =>
            o.cashPrice > max.cashPrice ? o : max
          )

          const ahorro = highest.cashPrice - cheapest.cashPrice
          const porcentaje = ((ahorro / highest.cashPrice) * 100).toFixed(1)

          return (
            <div key={p.id} style={styles.card}>

              <div style={styles.category}>
                {p.category}
              </div>

              <h3>{p.name}</h3>

              <p style={{ color: '#666' }}>
                ⭐ {p.rating || 4.5} • {p.brand}
              </p>

              {/* MEJOR PRECIO */}
              <div style={styles.bestPrice}>
                <p>Mejor precio</p>
                <h2>${cheapest.cashPrice}</h2>
                <p>en {cheapest.supermarket}</p>
              </div>

              {/* AHORRO */}
              <div style={styles.savings}>
                Ahorrás ${ahorro} ({porcentaje}%)
              </div>

              {/* TODAS LAS OFERTAS */}
              <div style={{ marginTop: '10px' }}>
                {p.offers.map((o, i) => (
                  <div key={i} style={styles.offer}>
                    <strong>{o.supermarket}</strong> - ${o.cashPrice}
                  </div>
                ))}
              </div>

            </div>
          )
        })}
      </div>

    </div>
  )
}

const styles = {
  container: {
    padding: '30px',
    fontFamily: 'Arial',
    backgroundColor: '#F3F4F6',
    minHeight: '100vh',
  },
  title: {
    textAlign: 'center',
    fontSize: '3rem',
    fontWeight: '800',
    color: '#2563EB',
  },
  subtitle: {
    textAlign: 'center',
    color: '#6B7280',
    marginBottom: '20px',
  },
  search: {
    width: '100%',
    padding: '12px',
    margin: '20px 0',
    fontSize: '16px',
    borderRadius: '10px',
    border: '1px solid #ccc',
  },
  filters: {
    display: 'flex',
    gap: '10px',
    marginBottom: '25px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  button: {
    padding: '10px 14px',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '8px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: 'white',
    padding: '18px',
    borderRadius: '15px',
    boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
  },
  category: {
    fontSize: '12px',
    color: '#2563EB',
    fontWeight: 'bold',
  },
  bestPrice: {
    backgroundColor: '#DCFCE7',
    padding: '10px',
    borderRadius: '10px',
    marginTop: '10px',
  },
  savings: {
    marginTop: '10px',
    color: 'green',
    fontWeight: 'bold',
  },
  offer: {
    fontSize: '13px',
    marginTop: '5px',
    color: '#444',
  },
}