import LedgerLogo from './LedgerLogo'

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
        <div style={{ margin: '0 auto 12px', width: 'fit-content' }}>
          <LedgerLogo size={42} />
        </div>
        <div style={{ animation: 'pulse 1.2s infinite' }}>Cargando Ledger…</div>
      </div>
    </div>
  )
}
