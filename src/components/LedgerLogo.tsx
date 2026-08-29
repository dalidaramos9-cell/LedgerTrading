// Logo de marca de Ledger: el simbolo "Ledger card + total" - un unico elemento
// que evoca el registro/balance contable de la app (un rectangulo redondeado con
// un nodo central y el doble rasgo contable al pie). Paleta REAL de la app:
// fondo azul marino #0b1220, acento azul #4f8cff y azul claro #7aa8ff.
// Al ser un trazo simple (sin gradiente) se lee con claridad a tamaño pequeno.
export default function LedgerLogo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Ledger">
      <rect x="5" y="7" width="22" height="18" rx="6" fill="#0b1220" stroke="#4f8cff" strokeWidth="3" />
      <circle cx="16" cy="13.5" r="3.6" fill="#7aa8ff" />
      <path
        d="M8.5 22.5 H23.5 M8.5 25.2 H23.5"
        stroke="#4f8cff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
