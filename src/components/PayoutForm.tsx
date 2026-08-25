import { useEffect, useState } from 'react'
import { Modal, Field, Button } from './ui'
import { useData } from '../contexts/DataContext'
import { PAYOUT_STATUS_LABELS, Payout } from '../lib/types'
import { isoDate, money } from '../lib/fmt'

export default function PayoutForm({
  account,
  initial,
  open,
  onClose,
}: {
  account: { id: string; type: string; rules: unknown; initial_balance?: number }
  initial?: Payout | null
  open: boolean
  onClose: () => void
}) {
  const { addPayout, updatePayout } = useData()
  const [date, setDate] = useState(isoDate(new Date()))
  const [gross, setGross] = useState('')
  const [split, setSplit] = useState('80')
  const [status, setStatus] = useState<Payout['status']>('requested')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [yourCut, setYourCut] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null)
    let splitPct = 80
    const r = account.rules as { profitSplit?: number; type?: string; stages?: { profitSplit: number }[] }
    if (r && r.profitSplit) splitPct = r.profitSplit
    else if (r && r.type === 'axi' && r.stages && r.stages.length) {
      splitPct = r.stages[r.stages.length - 1].profitSplit
    }
    if (initial) {
      setDate(isoDate(new Date(initial.date)))
      setGross(String(initial.gross))
      setSplit(String(initial.split_pct))
      setStatus(initial.status)
      setNote(initial.note || '')
      setYourCut((initial.gross * initial.split_pct) / 100)
    } else {
      setDate(isoDate(new Date()))
      setGross('')
      setSplit(String(splitPct))
      setStatus('requested')
      setNote('')
      setYourCut(null)
    }
  }, [open, initial, account])

  useEffect(() => {
    const g = parseFloat(gross)
    const s = parseFloat(split)
    if (!Number.isNaN(g) && !Number.isNaN(s)) setYourCut((g * s) / 100)
    else setYourCut(null)
  }, [gross, split])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    const g = parseFloat(gross)
    const s = parseFloat(split)
    if (Number.isNaN(g) || g < 0) {
      setErr('Ingresa un monto bruto válido.')
      setSaving(false)
      return
    }
    const payload = {
      account_id: account.id,
      date: new Date(date + 'T12:00:00').toISOString(),
      gross: g,
      split_pct: Number.isNaN(s) ? 0 : s,
      status,
      note: note.trim(),
    }
    try {
      if (initial) await updatePayout({ ...initial, ...payload })
      else await addPayout(payload)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar payout' : 'Registrar payout'}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Fecha">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Monto bruto ($)">
            <input type="number" step="0.01" min="0" className="input" value={gross} onChange={(e) => setGross(e.target.value)} required />
          </Field>
          <Field label="Split (%)">
            <input type="number" step="1" min="0" max="100" className="input" value={split} onChange={(e) => setSplit(e.target.value)} required />
          </Field>
          <Field label="Estado">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as Payout['status'])}>
              {(Object.keys(PAYOUT_STATUS_LABELS) as Payout['status'][]).map((s) => (
                <option key={s} value={s}>{PAYOUT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        {yourCut !== null ? (
          <div className="panel" style={{ marginTop: 14, textAlign: 'center' }}>
            <div className="page-sub" style={{ marginTop: 0 }}>Tu parte (split)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)' }}>{money(yourCut)}</div>
          </div>
        ) : null}
        <div style={{ marginTop: 14 }}>
          <Field label="Nota" hint="Opcional">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referencia…" />
          </Field>
        </div>
        {err ? <div className="auth-error" style={{ marginTop: 12 }}>{err}</div> : null}
        <div className="form-actions">
          <Button variant="subtle" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Registrar payout'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
