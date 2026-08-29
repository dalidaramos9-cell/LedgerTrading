// Genera los iconos PWA de Ledger a partir del favicon.svg (logo real).
// Requiere sharp como devDependencia.
//
// Salidas:
//   public/icons/favicon.svg          (ya existe, fuente del logo)
//   public/icons/icon-192.png          logo completo, 192x192
//   public/icons/icon-512.png          logo completo, 512x512
//   public/icons/maskable-512.png      logo dentro de la safe-zone maskable,
//                                      con fondo solido de relleno, 512x512
import sharp from 'sharp'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicIcons = resolve(__dirname, '..', 'public', 'icons')

const svgSource = readFileSync(resolve(publicIcons, 'favicon.svg'), 'utf-8')

// --- 1. Iconos normales: el logo completo a resolucion alta.
// Se renderiza el SVG a 512 para llegar a la maxima resolucion, y luego se
// redimensiona (el logo del favicon ya ocupa casi todo el 32x32 del viewBox).
async function normalIcon(size) {
  return sharp(Buffer.from(svgSource), { density: 512 }).resize(size, size).png().toBuffer()
}

// --- 2. Icono maskable: fondo solido + logo dentro de la safe-zone (~66%).
// El recorte de la mascara (circulo/redondeo) corta los bordes, por lo que el
// logo debe quedar dentro del 80% central. Se rellena todo el lienzo con el
// fondo del tema y se coloca el simbolo escalado y centrado.
async function maskableIcon(size = 512) {
  // Ruta del logo: rectangle + velas + tendencia. Se escala al 66% y se centra.
  // El viewBox original es 0 0 32 32; el elemento ocupa de (1,1) a (31,31).
  const margin = 0.17 // 17% de margen = logo al 66% del lienzo
  const scale = 1 - margin * 2
  const translate = margin * 32

  const maskedSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4f8cff"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <!-- Fondo solido que se extiende hasta los bordes de la mascara -->
  <rect width="32" height="32" fill="#0f172a"/>
  <!-- Logo escalado y centrado dentro de la safe-zone -->
  <g transform="translate(${translate} ${translate}) scale(${scale})">
    <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#g)"/>
    <g stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" fill="none">
      <path d="M8 23 L8 17 M7 18.6 L9 18.6 M8 20 L8 17" />
      <path d="M14 20 L14 11 M13 12.6 L15 12.6 M14 15 L14 11" />
      <path d="M20 16 L20 8 M19 9.6 L21 9.6" />
    </g>
    <path d="M8 18.4 L14 12.4 L20 11" stroke="#7ef0a0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
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
