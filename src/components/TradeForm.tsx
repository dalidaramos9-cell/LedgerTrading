import { useEffect, useState } from 'react'
import { Modal, Field, Button } from './ui'
import { useData } from '../contexts/DataContext'
import { SESSIONS, DIRECTIONS, Trade } from '../lib/types'
import { isoDate } from '../lib/fmt'

// Devuelve "YYYY-MM-DD" respetando el día literal sin saltos de zona horaria.
// - Si el input ya empieza con "YYYY-MM-DD", lo devolvemos tal cual.
// - De lo contrario, formateamos con Date.
function toDateInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = new Date(value)
  return isNaN(d.getTime()) ? isoDate(new Date()) : isoDate(d)
}

export default function TradeForm({
  accountId,
  defaultDate,
  initial,
  open,
  onClose,
}: {
  accountId: string
  defaultDate?: string
  initial?: Trade | null
  open: boolean
  onClose: () => void
}) {
  const { addTrade, updateTrade } = useData()
  const [date, setDate] = useState(isoDate(new Date()))
  const [instrument, setInstrument] = useState('')
  const [direction, setDirection] = useState<'long' | 'short'>('long')
  const [session, setSession] = useState<(typeof SESSIONS)[number]['value']>('london')
  const [rPlanned, setRPlanned] = useState('1')
  const [rResult, setRResult] = useState('0')
  const [pnl, setPnl] = useState('')
  const [result, setResult] = useState<'win' | 'loss' | 'be'>('win')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null)
    if (initial) {
      setDate(toDateInput(initial.date))
      setInstrument(initial.instrument)
      setDirection(initial.direction)
      setSession(initial.session)
      setRPlanned(String(initial.r_planned))
      setRResult(String(initial.r_result))
      setPnl(String(initial.pnl))
      setResult(initial.result)
      setNotes(initial.notes)
    } else {
      setDate(toDateInput(defaultDate ?? new Date().toISOString()))
      setInstrument('')
      setDirection('long')
      setSession('london')
      setRPlanned('1')
      setRResult('0')
      setPnl('')
      setResult('win')
      setNotes('')
    }
  }, [open, initial, defaultDate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    const pnlNum = parseFloat(pnl)
    if (Number.isNaN(pnlNum)) {
      setErr('Ingresa el P&L en $ (puede ser negativo o 0).')
      setSaving(false)
      return
    }
    // El usuario tiene el control del "Resultado" (es la fuente de verdad).
    // La interfaz mantiene el Resultado sincronizado con el signo del P&L
    // al escribir el monto, así que aquí simplemente respetamos lo elegido.
    const finalResult = result
    if (finalResult === 'win' && pnlNum < 0) {
      setErr('Marcaste "Ganadora" pero el P&L es negativo. Revisa el signo.')
      setSaving(false)
      return
    }
    if (finalResult === 'loss' && pnlNum > 0) {
      setErr('Marcaste "Perdedora" pero el P&L es positivo. Revisa el signo.')
      setSaving(false)
      return
    }
    const payload = {
      account_id: accountId,
      date: new Date(date + 'T12:00:00').toISOString(),
      instrument: instrument.trim() || 'Sin instrumento',
      direction,
      session,
      r_planned: Number.isNaN(parseFloat(rPlanned)) ? 0 : parseFloat(rPlanned),
      r_result: Number.isNaN(parseFloat(rResult)) ? 0 : parseFloat(rResult),
      pnl: pnlNum,
      result: finalResult,
      notes: notes.trim(),
    }
    try {
      if (initial) {
        await updateTrade({ ...initial, ...payload })
      } else {
        await addTrade(payload)
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  // Al escribir el P&L, mantenemos el "Resultado" coherente con el signo:
  // positivo → Ganadora, negativo → Perdedora, 0 → Break-even.
  // El usuario puede ajustarlo manualmente después; en el guardado prevalece
  // su elección (con validación de que el signo sea coherente).
  function handlePnlChange(v: string) {
    setPnl(v)
    const n = parseFloat(v)
    if (Number.isNaN(n)) return
    if (n > 0) setResult('win')
    else if (n < 0) setResult('loss')
    else setResult('be')
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar operación' : 'Nueva operación'} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Fecha">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Instrumento">
            <input className="input" placeholder="EJ: EURUSD, NQ, XAUUSD" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
          </Field>
          <Field label="Dirección">
            <select className="select" value={direction} onChange={(e) => setDirection(e.target.value as 'long' | 'short')}>
              {DIRECTIONS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Sesión">
            <select className="select" value={session} onChange={(e) => setSession(e.target.value as typeof session)}>
              {SESSIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="R planeado">
            <input type="number" step="0.1" className="input" value={rPlanned} onChange={(e) => setRPlanned(e.target.value)} />
          </Field>
          <Field label="R resultado">
            <input type="number" step="0.1" className="input" value={rResult} onChange={(e) => setRResult(e.target.value)} />
          </Field>
          <Field label="P&L ($)">
            <input type="number" step="0.01" className="input" placeholder="0.00" value={pnl} onChange={(e) => handlePnlChange(e.target.value)} required />
          </Field>
          <Field label="Resultado">
            <div style={{ display: 'flex', gap: 8 }}>
              {(
                [
                  ['win', 'Ganadora'],
                  ['loss', 'Perdedora'],
                  ['be', 'Break-even'],
                ] as const
              ).map(([v, l]) => (
                <label
                  key={v}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    cursor: 'pointer',
                    background: result === v ? 'var(--accent-soft)' : 'var(--bg-elev)',
                  }}
                >
                  <input type="radio" name="result" checked={result === v} onChange={() => setResult(v)} />
                  {l}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Notas" hint="Opcional">
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Setup, contexto, emociones…" />
          </Field>
        </div>
        {err ? <div className="auth-error" style={{ marginTop: 12 }}>{err}</div> : null}
        <div className="form-actions">
          <Button variant="subtle" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Agregar operación'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
