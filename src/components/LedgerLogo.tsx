// Logo vectorial de Ledger (P&L / velas ascendentes sobre gradiente de marca).
// Se usa en la marca de la app y en el login. El redondeo y el relleno se
// controlan con el tamaño (el SVG se escala manteniendo proporción).
export default function LedgerLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Ledger">
      <defs>
        <linearGradient id="lg-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f8cff" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#lg-grad)" />
      <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none">
        <path d="M8 23 L8 17 M7 18.6 L9 18.6 M8 20 L8 17" />
        <path d="M14 20 L14 11 M13 12.6 L15 12.6 M14 15 L14 11" />
        <path d="M20 16 L20 8 M19 9.6 L21 9.6" />
      </g>
      <path d="M8 18.4 L14 12.4 L20 11" stroke="#7ef0a0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}
