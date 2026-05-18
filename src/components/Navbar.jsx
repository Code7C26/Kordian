function Navbar() {
  return (
    <nav
      style={{
        width: '100%',
        padding: '20px 40px',
        backgroundColor: '#111827',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <h1
        style={{
          color: 'white',
          fontSize: '28px',
          fontWeight: '700',
        }}
      >
        AR-PRICE
      </h1>

      <div
        style={{
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
        }}
      >
        <button
          style={{
            padding: '10px 20px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#2563EB',
            color: 'white',
            fontSize: '16px',
            cursor: 'pointer',
          }}
        >
          Ingresar
        </button>
      </div>
    </nav>
  )
}

export default Navbar