// Genera los iconos PWA de Ledger a partir del simbolo de marca definido aqui.
// Requiere sharp como devDependencia.
//
// Simbolo "Ledger card + total": un unico elemento que evoca el registro/balance
// contable de la app - un rectangulo redondeado (ledger card) con un nodo central
// (el total/registro) y el doble rasgo contable al pie. Paleta REAL de la app:
// fondo azul marino #0b1220 + acento azul #4f8cff + azul claro #7aa8ff.
//
// Salidas:
//   public/icons/icon-192.png     simbolo completo, 192x192
//   public/icons/icon-512.png     simbolo completo, 512x512
//   public/icons/maskable-512.png simbolo dentro de la safe-zone, 512x512
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicIcons = resolve(__dirname, '..', 'public', 'icons')

const BG = '#0b1220' // fondo azul marino real de la app (--bg dark)
const ACCENT = '#4f8cff' // --accent real (azul)
const ACCENT_STRONG = '#7aa8ff' // --accent-strong real (azul claro)

// Simbolo base (viewBox 0 0 32 32). Para iconos "any" ocupa casi todo el lienzo.
function symbolSvg({ full = true } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect x="5" y="7" width="22" height="18" rx="6" fill="${BG}" stroke="${ACCENT}" stroke-width="3"/>
  <circle cx="16" cy="13.5" r="3.6" fill="${ACCENT_STRONG}"/>
  <path d="M8.5 22.5 H23.5 M8.5 25.2 H23.5" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round"/>
</svg>`
}

function normalIcon(size) {
  return sharp(Buffer.from(symbolSvg())).resize(size, size).png().toBuffer()
}

async function maskableIcon(size = 512) {
  // Logo reducido al ~70% y centrado dentro de la safe-zone, sobre el mismo
  // fondo solido de la marca que se extiende hasta los bordes de la mascara.
  const scale = 0.7
  const translate = (32 - 32 * scale) / 2
  const maskedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <rect width="32" height="32" fill="${BG}"/>
  <g transform="translate(${translate} ${translate}) scale(${scale})">
    ${symbolSvg().replace(/^<svg[^>]*>|<\/svg>$/g, '')}
  </g>
</svg>`
  return sharp(Buffer.from(maskedSvg)).resize(size, size).png().toBuffer()
}

const out = {
  'icon-192.png': await normalIcon(192),
  'icon-512.png': await normalIcon(512),
  'maskable-512.png': await maskableIcon(512),
}

for (const [name, buffer] of Object.entries(out)) {
  writeFileSync(resolve(publicIcons, name), buffer)
  console.log('generated', name, buffer.length, 'bytes')
}
console.log('Done.')

