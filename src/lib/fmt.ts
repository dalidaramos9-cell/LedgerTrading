import { SESSIONS } from './types'

// Utilidades de formato (moneda, fecha, números) compartidas

const currencyFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const currencyFmtCents = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function money(v: number): string {
  if (!isFinite(v)) return currencyFmt.format(0)
  if (Math.abs(v) >= 1000 && Number.isInteger(v)) return currencyFmt.format(v)
  return currencyFmtCents.format(Math.round(v * 100) / 100)
}

export function pct(v: number, digits = 1): string {
  return `${formatNum(v, digits)}%`
}

export function formatNum(v: number, digits = 2): string {
  if (!isFinite(v)) return '0'
  if (Number.isInteger(v)) return v.toLocaleString('es-MX')
  return v.toLocaleString('es-MX', { maximumFractionDigits: digits })
}

export function signedMoney(v: number): string {
  if (v > 0) return '+' + money(v)
  if (v < 0) return '-' + money(Math.abs(v))
  return money(0)
}

export function signedPct(v: number): string {
  return `${v > 0 ? '+' : ''}${pct(v)}`
}

export function signedNum(v: number, digits = 2): string {
  if (v > 0) return '+' + formatNum(v, digits)
  if (v < 0) return '-' + formatNum(Math.abs(v), digits)
  return '0'
}

export function shortDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function shortDateNoYear(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function weekdayLabel(day: number): string {
  const names = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  return names[day] ?? ''
}

export function monthName(year: number, month: number): string {
  const names = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${names[month - 1]} ${year}`
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const SESSION_LABEL: Record<string, string> = Object.fromEntries(
  SESSIONS.map((s) => [s.value, s.label]),
)

export function sessionLabel(s: string): string {
  return SESSION_LABEL[s] ?? s
}
