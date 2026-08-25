export default function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 42,
            height: 42,
            margin: '0 auto 12px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent), #22d3ee)',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 20,
          }}
        >
          ⛁
        </div>
        <div style={{ animation: 'pulse 1.2s infinite' }}>Cargando Ledger…</div>
      </div>
    </div>
  )
}
