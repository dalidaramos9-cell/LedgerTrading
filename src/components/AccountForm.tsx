import { useEffect, useState } from 'react'
import { Modal, Field, Button } from './ui'
import { useData } from '../contexts/DataContext'
import {
  Account,
  AccountType,
  AccountStatus,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_STATUS_LABELS,
  BROKERS,
  AxiRules,
  randId,
} from '../lib/types'
import { rulesForType } from '../lib/rules'
import { isoDate } from '../lib/fmt'

const isoToday = () => isoDate(new Date())

export default function AccountForm({
  initial,
  open,
  onClose,
}: {
  initial?: Account | null
  open: boolean
  onClose: () => void
}) {
  const { addAccount, updateAccount } = useData()
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('cfd')
  const [broker, setBroker] = useState('FTMO')
  const [initialBalance, setInitialBalance] = useState('100000')
  const [riskPct, setRiskPct] = useState('1')
  const [startDate, setStartDate] = useState(isoToday())
  const [status, setStatus] = useState<AccountStatus>('evaluation')
  const [rules, setRules] = useState(rulesForType('cfd'))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null)
    if (initial) {
      setName(initial.name)
      setType(initial.type)
      setBroker(initial.broker)
      setInitialBalance(String(initial.initial_balance))
      setRiskPct(String(initial.risk_per_trade))
      setStartDate(isoDate(new Date(initial.start_date)))
      setStatus(initial.status)
      setRules(initial.rules)
    } else {
      setName('')
      setType('cfd')
      setBroker('FTMO')
      setInitialBalance('100000')
      setRiskPct('1')
      setStartDate(isoToday())
      setStatus('evaluation')
      setRules(rulesForType('cfd'))
    }
  }, [open, initial])

  function changeType(t: AccountType) {
    setType(t)
    if (t === 'cfd' || t === 'futures' || t === 'axi') setRules(rulesForType(t))
    else setRules({} as never)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    const bal = parseFloat(initialBalance)
    if (Number.isNaN(bal) || bal <= 0) {
      setErr('El balance inicial debe ser mayor a 0.')
      setSaving(false)
      return
    }
    let finalRules = rules
    // Para Axi Select, asegura la fecha de inicio de la fase actual (si falta).
    if (type === 'axi' && rules.type === 'axi' && !rules.current_stage_start_date) {
      finalRules = { ...rules, current_stage_start_date: new Date(startDate + 'T12:00:00').toISOString() }
    }
    const payload = {
      name: name.trim() || 'Mi cuenta',
      type,
      broker: broker || 'Otro',
      initial_balance: bal,
      risk_per_trade: Number.isNaN(parseFloat(riskPct)) ? 0 : parseFloat(riskPct),
      start_date: new Date(startDate + 'T12:00:00').toISOString(),
      status,
      rules: finalRules,
      current_stage_index: initial?.current_stage_index ?? 0,
      // Punto de partida de la etapa actual: al crear arranca en 0;
      // al editar se conserva a menos que cambie el tipo de programa.
      stage_start_pnl: !initial || initial.type !== type || initial.rules.type !== rules.type ? 0 : initial.stage_start_pnl ?? 0,
      archived: initial?.archived ?? false,
    }
    try {
      if (initial) await updateAccount({ ...initial, ...payload })
      else await addAccount(payload)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar la cuenta.')
    } finally {
      setSaving(false)
    }
  }

  // ---- Editores de reglas ----
  function renderRules() {
    if (type === 'own') {
      return (
        <div className="panel" style={{ marginTop: 6 }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Las cuentas de capital propio no tienen reglas de programa: solo seguimiento de balance y operaciones.
          </p>
        </div>
      )
    }
    if (type === 'cfd') return renderCfd()
    if (type === 'futures') return renderFutures()
    return renderAxi()
  }

  function renderCfd() {
    const r = rules as Extract<Account['rules'], { type: 'cfd' }>
    return (
      <div className="stack" style={{ marginTop: 6 }}>
        <div className="grid-2">
          <div className="form-grid" style={{ marginBottom: 6 }}>
            <Field label="Nº de fases">
              <select
                className="select"
                value={r.phases.length}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  const phases = Array.from({ length: n }, (_, i) => r.phases[i] ?? {
                    id: randId(), label: `Fase ${i + 1}`, targetUSD: i === 0 ? 8000 : 5000, stage: i + 1,
                  })
                  setRules({ ...r, phases })
                }}
              >
                <option value={1}>1 fase</option>
                <option value={2}>2 fases</option>
              </select>
            </Field>
            <Field label="Daily loss (%)">
              <input type="number" step="0.1" className="input" value={r.dailyLossPct} onChange={(e) => setRules({ ...r, dailyLossPct: parseFloat(e.target.value) || 0 })} />
            </Field>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Fases y objetivos</span></div>
          {r.phases.map((ph) => (
            <div className="stage-row" key={ph.id}>
              <input className="input" style={{ width: 110 }} value={ph.label} onChange={(e) => {
                setRules({ ...r, phases: r.phases.map((p) => (p.id === ph.id ? { ...p, label: e.target.value } : p)) })
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <span className="muted">Objetivo ($)</span>
                <input type="number" step="100" className="input" value={ph.targetUSD} onChange={(e) => {
                  setRules({ ...r, phases: r.phases.map((p) => (p.id === ph.id ? { ...p, targetUSD: parseFloat(e.target.value) || 0 } : p)) })
                }} />
              </div>
            </div>
          ))}
        </div>
        <div className="grid-3">
          <Field label="Max drawdown % (estático)">
            <input type="number" step="0.1" className="input" value={r.maxDrawdownPct} onChange={(e) => setRules({ ...r, maxDrawdownPct: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Profit split %">
            <input type="number" step="1" className="input" value={r.profitSplit} onChange={(e) => setRules({ ...r, profitSplit: parseFloat(e.target.value) || 0 })} />
          </Field>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Objetivos de fase en $ (ganancia neta a lograr dentro de esa fase). Límites en $ calculados sobre el balance inicial ({initialBalance}): drawdown máximo = {(parseFloat(initialBalance) * (r.maxDrawdownPct / 100)).toFixed(0)} $, daily loss = {(parseFloat(initialBalance) * (r.dailyLossPct / 100)).toFixed(0)} $. Tras las fases, la cuenta pasa a «Fondeada».
        </p>
      </div>
    )
  }

  function renderFutures() {
    const r = rules as Extract<Account['rules'], { type: 'futures' }>
    return (
      <div className="stack" style={{ marginTop: 6 }}>
        <div className="grid-3">
          <Field label="Objetivo evaluación ($)">
            <input type="number" step="100" className="input" value={r.evaluationTarget} onChange={(e) => setRules({ ...r, evaluationTarget: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Objetivo colchón ($)">
            <input type="number" step="100" className="input" value={r.cushionTarget} onChange={(e) => setRules({ ...r, cushionTarget: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Tipo de drawdown">
            <select className="select" value={r.ddType} onChange={(e) => setRules({ ...r, ddType: e.target.value as 'static' | 'trailing-eod' })}>
              <option value="static">Estático</option>
              <option value="trailing-eod">Trailing / EOD</option>
            </select>
          </Field>
        </div>
        <div className="grid-3">
          <Field label="Daily loss (%)">
            <input type="number" step="0.1" className="input" value={r.dailyLossPct} onChange={(e) => setRules({ ...r, dailyLossPct: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Max drawdown (%)">
            <input type="number" step="0.1" className="input" value={r.maxDrawdownPct} onChange={(e) => setRules({ ...r, maxDrawdownPct: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Consistencia (máx % por día)">
            <input type="number" step="1" className="input" value={r.consistencyPct} onChange={(e) => setRules({ ...r, consistencyPct: parseFloat(e.target.value) || 0 })} />
          </Field>
        </div>
        <Field label="Profit split (%)">
          <input type="number" step="1" className="input" value={r.profitSplit} onChange={(e) => setRules({ ...r, profitSplit: parseFloat(e.target.value) || 0 })} />
        </Field>
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Ruta (Evaluación → Colchón → Fondeo)</span></div>
          {(['Evaluación', 'Colchón', 'Fondeo'] as const).map((s, i) => (
            <div className="stage-row" key={s}>
              <div className={`stage-ring ${i <= 0 ? 'ok' : ''}`}>{i + 1}</div>
              <div className="stage-meta">
                <div className="stage-label">{s}</div>
                <div className="stage-stat-row">
                  <span>Objetivo: {i === 0 ? `$${r.evaluationTarget.toLocaleString()}` : i === 1 ? `$${r.cushionTarget.toLocaleString()}` : '—'}</span>
                  <span>{i === 2 ? 'Cuenta fondeada' : s === 'Colchón' ? 'Tras evaluación' : 'Inicio'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderAxi() {
    const r = rules as AxiRules
    const update = (id: string, patch: Partial<typeof r.stages[number]>) =>
      setRules({ ...r, stages: r.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) })

    return (
      <div className="stack" style={{ marginTop: 6 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Etapas Axi Select (Seed → Pro M)</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th className="num">Equity mín</th>
                  <th className="num">Fondeo</th>
                  <th className="num">Edge</th>
                  <th className="num">Mult</th>
                  <th className="num">Split</th>
                  <th className="num">Target</th>
                  <th className="num">Días min</th>
                  <th className="num">Ops min</th>
                  <th>Apalanc.</th>
                  <th className="num">Pérdida máx</th>
                </tr>
              </thead>
              <tbody>
                {r.stages.map((st) => (
                  <tr key={st.id}>
                    <td>
                      <strong>{st.label}</strong>
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 76 }} type="number" step="100" value={st.minEquity} title="Equity mínimo $" onChange={(e) => update(st.id, { minEquity: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 88 }} type="number" step="1000" value={st.funded} title="Fondeo asignado $" onChange={(e) => update(st.id, { funded: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 48 }} type="number" step="1" value={st.edgeScore} title="Edge Score" onChange={(e) => update(st.id, { edgeScore: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 48 }} type="number" step="1" value={st.multiplier} title="Multiplicador x" onChange={(e) => update(st.id, { multiplier: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 52 }} type="number" step="1" value={st.profitSplit} title="Profit split %" onChange={(e) => update(st.id, { profitSplit: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 52 }} type="number" step="0.5" value={st.targetPct} title="Profit target % (0 = N/A)" onChange={(e) => update(st.id, { targetPct: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 52 }} type="number" step="1" value={st.minDays} title="Duración mínima en días (0 = N/A)" onChange={(e) => update(st.id, { minDays: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 48 }} type="number" step="1" value={st.minTrades} title="Operaciones mínimas (0 = N/A)" onChange={(e) => update(st.id, { minTrades: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <input className="input" style={{ minWidth: 60 }} value={st.leverage} title="Apalancamiento" onChange={(e) => update(st.id, { leverage: e.target.value })} />
                    </td>
                    <td className="num">
                      <input className="input" style={{ minWidth: 52 }} type="number" step="0.5" value={st.maxLossPct} title="Pérdida máxima permitida %" onChange={(e) => update(st.id, { maxLossPct: parseFloat(e.target.value) || 0 })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          «Edge» = Edge Score · «Mult» = multiplicador del fondeo · «Target» = profit target % · «Días min»/«Ops min» = requisitos de duración y operaciones (0 = N/A).
        </p>
      </div>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Editar cuenta' : 'Nueva cuenta'} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <Field label="Nombre de la cuenta">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="FTMO 100K, Apex 50K, Personal…" />
          </Field>
          <Field label="Tipo de cuenta">
            <select className="select" value={type} onChange={(e) => changeType(e.target.value as AccountType)}>
              {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Broker / Prop firm">
            <select className="select" value={broker} onChange={(e) => setBroker(e.target.value)}>
              {BROKERS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="Balance inicial ($)">
            <input type="number" step="100" className="input" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} required />
          </Field>
          <Field label="Riesgo por operación (%)">
            <input type="number" step="0.1" className="input" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
          </Field>
          <Field label="Fecha de inicio">
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Estado">
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)}>
              {(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((s) => (
                <option key={s} value={s}>{ACCOUNT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </Field>
        </div>

        {renderRules()}

        {err ? <div className="auth-error" style={{ marginTop: 12 }}>{err}</div> : null}
        <div className="form-actions">
          <Button variant="subtle" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear cuenta'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
