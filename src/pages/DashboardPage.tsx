import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell,
} from 'recharts'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { useActivePhase } from '../contexts/ActivePhaseContext'
import { analyzeAccount } from '../lib/engine'
import { SESSIONS, AxiStageHistory } from '../lib/types'
import { money, signedMoney, signedNum, formatNum, weekdayLabel, shortDate } from '../lib/fmt'
import { EmptyState, ProgressBar } from '../components/ui'

const GREEN = '#16a34a'
const RED = '#dc2626'

export default function DashboardPage() {
  const { trades, payouts } = useData()
  const account = useRouteAccount()
  const { activePhase, selectCurrent, selectHistory } = useActivePhase()

  // Color principal del Dashboard: sigue el acento global de la marca
  // (rojo para cuentas Axi, azul para el resto), aplicado via data-brand en CSS.
  const primaryColor = 'var(--accent)'

  const accountTrades = account ? trades.filter((t) => t.account_id === account.id) : []
  const accountPayouts = account ? payouts.filter((p) => p.account_id === account.id) : []

  // Historial de fases de Axi (para el selector de fase en el Dashboard).
  const axiHistory: AxiStageHistory[] =
    account?.type === 'axi' && account.rules.type === 'axi' ? account.rules.stage_history ?? [] : []

  // Filtra los trades según la fase seleccionada (actual o una histórica).
  // Aquí el Dashboard decide el rango por su cuenta, sin depender del contexto,
  // para garantizar que muestre siempre la fase correcta.
  const phaseTrades = useMemo(() => {
    if (activePhase?.kind === 'history') {
      const start = activePhase.startDate.slice(0, 10)
      const end = activePhase.endDate.slice(0, 10)
      return accountTrades.filter((t) => {
        const d = t.date.slice(0, 10)
        return d >= start && d <= end
      })
    }
    // Fase actual (activePhase null o 'current'): rango desde el inicio de la
    // fase actual en adelante.
    const start =
      account?.type === 'axi' && account.rules.type === 'axi'
        ? (account.rules.current_stage_start_date ?? account.start_date).slice(0, 10)
        : account?.start_date.slice(0, 10)
    if (!start) return accountTrades
    return accountTrades.filter((t) => t.date.slice(0, 10) >= start)
  }, [activePhase, accountTrades, account])

  // Análisis de la fase seleccionada (filtrado por fecha).
  const analysis = useMemo(
    () =>
      account
        ? analyzeAccount(account, phaseTrades, accountPayouts)
        : null,
    [account, phaseTrades, accountPayouts],
  )
  // Análisis con TODOS los trades de la cuenta (sin filtrar por fase activa),
  // para que el "Balance actual" coincida con el panel "Capital de la cuenta"
  // de la pestaña Etapas (balance total: trades de todas las fases + capital
  // agregado − payouts).
  const totalAnalysis = useMemo(
    () =>
      account
        ? analyzeAccount(account, accountTrades, accountPayouts)
        : null,
    [account, accountTrades, accountPayouts],
  )
  if (!account || !analysis) {
    return (
      <EmptyState icon="📊" title="Cuenta no encontrada">
        Elige una cuenta de la barra lateral para ver su dashboard.
      </EmptyState>
    )
  }

  // Capital agregado manualmente (depósitos) — no forma parte del rendimiento.
  const totalCapital =
    account?.type === 'axi' && account.rules.type === 'axi'
      ? account.rules.stage_capital_total ?? 0
      : 0

  // La fase ACTUAL sí muestra el balance con el capital agregado (el dinero real
  // con el que se opera ahora). Al visualizar una fase PASADA, se muestra solo
  // capital inicial + rendimiento de esa fase (en su momento ese depósito no
  // existía).
  const isCurrentView = !activePhase || activePhase.kind === 'current'

  const s = analysis.stats
  // Rentabilidad de la vista seleccionada. En la fase actual se mide sobre el
  // capital con que se opera (inicial + depósito); en las fases pasadas sobre el
  // capital inicial (rendimiento puro del trading de esa fase).
  const rentBase = isCurrentView ? account.initial_balance + totalCapital : account.initial_balance
  const rentabilidad = (s.totalPnl / Math.max(rentBase, 1)) * 100
  const balanceForView = isCurrentView ? s.currentBalance + totalCapital : s.currentBalance
  const equityData = analysis.equity.map((p) => ({
    label: p.date.slice(5),
    balance: p.balance,
  }))

  // ---- Desempeño de la Cuenta de Asignación (solo Axi Select) ----
  // La cuenta apalancada replica la rentabilidad de la cuenta real: tanto el
  // capital como la ganancia se multiplican por el multiplicador de la fase.
  // Así el % de rendimiento de la asignación es el MISMO que el de la cuenta base.
  // La base de la cuenta incluye el capital agregado al pasar de fase, para que
  // el desempeño se actualice al aportar capital.
  // Fase mostrada: sigue la selección del Dashboard (fase actual o una histórica
  // en "modo vista"). Cuando vuelves a una fase anterior, el desempeño se
  // actualiza a ESA fase.
  const viewIndex =
    activePhase?.kind === 'history' && account.rules.type === 'axi'
      ? account.rules.stages.findIndex((st) => st.label === activePhase.label)
      : account.current_stage_index
  const axiStage =
    account.rules.type === 'axi' && viewIndex >= 0 ? account.rules.stages[viewIndex] : null
  const assignMult = axiStage?.multiplier ?? 1
  // Base de capital de la fase mostrada: en una fase histórica se usa el balance
  // de entrada guardado en el historial; en la fase actual, el capital con aportes.
  const viewHist =
    activePhase?.kind === 'history' && account.rules.type === 'axi'
      ? axiHistory.find((h) => h.stageLabel === activePhase.label)
      : null
  const assignBaseCap =
    activePhase?.kind === 'history' && account.rules.type === 'axi'
      ? viewHist?.startBalance ?? account.initial_balance
      : account.initial_balance +
        (account.rules.type === 'axi' ? account.rules.stage_capital_total ?? 0 : 0)
  const assignBase = assignBaseCap * assignMult // capital apalancado
  const assignGain = s.totalPnl * assignMult // ganancia escalada (P&L de la fase vista)
  const assignEquity = assignBase + assignGain
  // Rendimiento en %: sobre el capital base de la fase vista → coincide con la
  // rentabilidad mostrada (mismo %).
  const assignReturn = assignBaseCap > 0 ? (s.totalPnl / assignBaseCap) * 100 : 0
  const assignDayReturn = assignBaseCap > 0 ? (todayPnl(analysis.days) / assignBaseCap) * 100 : 0
  // Ganancia Mensual Proyectada: lo que cobra el trader por los beneficios del
  // mes en curso sobre la cuenta apalancada, según su profit split de la fase.
  // En Seed el profit split es 0 (no se cobra) → resultado 0.
  const assignSplitPct = axiStage?.profitSplit ?? 0
  const nowDate = new Date()
  const currentMonthPnl = analysis.monthly.find(
    (m) => m.year === nowDate.getFullYear() && m.month === nowDate.getMonth() + 1,
  )?.pnl ?? 0
  // Ganancia mensual del mes escalada al patrimonio apalancado (× multiplicador)
  // sobre la que se aplica el profit split del trader.
  const projectedMonthly = (currentMonthPnl * assignMult * assignSplitPct) / 100

  // Dominio del eje vertical: se ajusta al rango real de los datos con un
  // pequeño margen arriba/abajo, para que la variación de la cuenta se aprecie
  // aunque sea de unos pocos cientos de dólares (en vez de forzar el 0).
  const equityDomain = (() => {
    if (!equityData.length) return [0, 1]
    let min = Infinity
    let max = -Infinity
    for (const d of equityData) {
      if (d.balance < min) min = d.balance
      if (d.balance > max) max = d.balance
    }
    if (!isFinite(min) || !isFinite(max) || min === max) return [min - 1, max + 1]
    const pad = Math.max((max - min) * 0.1, 1)
    return [Math.floor((min - pad) * 100) / 100, Math.ceil((max + pad) * 100) / 100]
  })()

  const sessionData = analysis.bySession.map((x) => ({
    name: SESSIONS.find((sess) => sess.value === x.session)?.label ?? x.session,
    pnl: Math.round(x.pnl * 100) / 100,
  }))

  const weekdayData = [1, 2, 3, 4, 5, 6, 0]
    .map((d) => ({
      name: weekdayLabel(d),
      pnl: Math.round((analysis.byWeekday[d]?.pnl ?? 0) * 100) / 100,
    }))
    .filter((x) => x.pnl !== 0)

  const dirData = [
    { name: 'Long', pnl: Math.round(analysis.byDirection.long.pnl * 100) / 100 },
    { name: 'Short', pnl: Math.round(analysis.byDirection.short.pnl * 100) / 100 },
  ]

  const rData = [['-4', -4], ['-3', -3], ['-2', -2], ['-1', -1], ['0', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4]]
    .map(([, val]) => ({
      r: val as number,
      count: analysis.rDistribution.find((d) => d.r === (val as number))?.count ?? 0,
    }))
    .filter((d) => d.count > 0)

  const streakLabel =
    s.currentStreak === 0
      ? '—'
      : `${Math.abs(s.currentStreak)} ${s.currentStreak > 0 ? 'W' : 'L'}`

  // Opciones del selector de fase: fases completadas (históricas) + la actual.
  const currentLabel =
    account.rules.type === 'axi'
      ? (account.rules.stages[account.current_stage_index]?.label ?? 'Fase actual')
      : 'Vista general'
  const phaseOptions: { key: string; label: string }[] = [
    { key: '__current__', label: `Fase actual (${currentLabel})` },
    ...[...axiHistory].reverse().map((h) => ({ key: h.stageLabel, label: h.stageLabel })),
  ]
  const selectedKey = activePhase?.kind === 'history' ? activePhase.label : '__current__'

  function changePhase(key: string) {
    if (key === '__current__') {
      selectCurrent()
      return
    }
    const h = axiHistory.find((x) => x.stageLabel === key)
    if (h) selectHistory(h)
  }

  return (
    <div className="stack">
      <div className="panel" style={{ padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor="dash-phase" className="muted" style={{ fontSize: 13, margin: 0 }}>
            Mostrando fase:
          </label>
          <select
            id="dash-phase"
            className="input"
            style={{ flex: '1 1 220px', maxWidth: 320 }}
            value={selectedKey}
            onChange={(e) => changePhase(e.target.value)}
          >
            {phaseOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {activePhase?.kind === 'history' ? (
            <span className="muted" style={{ fontSize: 12 }}>
              Rango {shortDate(activePhase.startDate)} → {shortDate(activePhase.endDate)}
            </span>
          ) : null}
          <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
            Balance total de la cuenta: {money((totalAnalysis?.stats.currentBalance ?? 0) + totalCapital)}
          </span>
        </div>
      </div>

      {account.rules.type === 'axi' && axiStage ? (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Desempeño de la Cuenta de Asignación</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {axiStage.label} · Capital asignado x{axiStage.multiplier}
            </span>
          </div>
          <div className="stat-grid">
            <MiniStat label="Patrimonio" value={money(assignEquity)} pos={assignGain >= 0} />
            <MiniStat label="Ganancia" value={signedMoney(assignGain)} pos={assignGain >= 0} />
            <MiniStat label="Rendimiento" value={`${assignReturn.toFixed(2)}%`} pos={assignGain >= 0} />
            <MiniStat
              label="Rendimientos de un Día"
              value={`${assignDayReturn.toFixed(2)}%`}
              pos={assignDayReturn >= 0}
            />
            <MiniStat
              label="Ganancia Mensual Proyectada"
              value={money(projectedMonthly)}
              sub={`Profit split ${assignSplitPct}%`}
              pos={projectedMonthly > 0}
              highlight
            />
          </div>
        </div>
      ) : null}


      <div className="dash-hero">
        <HeroStat label={isCurrentView ? 'Balance actual' : 'Balance (fase)'} value={money(balanceForView)} big />
        <HeroStat label="Rentabilidad" value={`${rentabilidad.toFixed(2)}%`} pos={s.totalPnl > 0} />
        <HeroStat
          label="P&L neto"
          value={signedMoney(s.totalPnl)}
          pos={s.totalPnl > 0}
        />
        <HeroStat
          label="P&L de hoy"
          value={signedMoney(todayPnl(analysis.days))}
          pos={todayPnl(analysis.days) > 0}
        />
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Curva de equity</span>
          <span className="legend">
            <span className="legend-swatch" style={{ background: primaryColor }} /> balance
          </span>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={primaryColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={primaryColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={24} />
              <YAxis domain={equityDomain as [number, number]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={56} />
              <Tooltip
                formatter={(v) => money(Number(v))}
                contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
              <Area type="monotone" dataKey="balance" stroke={primaryColor} strokeWidth={2} fill="url(#eqGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="stat-grid">
        <MiniStat label="Win rate" value={`${s.winRate.toFixed(1)}%`} sub={`${s.wins}W / ${s.losses}L / ${s.breakEven}BE`} />
        <MiniStat label="Profit factor" value={s.profitFactor === Infinity ? '∞' : formatNum(s.profitFactor, 2)} />
        <MiniStat label="Racha actual" value={streakLabel} />
        <MiniStat label="Expectativa" value={signedNum(s.expectedR)} sub="R por operación" />
        <MiniStat label="Drawdown máx." value={money(s.worstDrawdown)} />
        <MiniStat label="Operaciones" value={String(s.totalTrades)} sub={`R total ${signedNum(s.totalR)}`} />
        <MiniStat label="Mayor día" value={signedMoney(s.biggestDayPnl)} sub={s.biggestDayPct > 0 ? `${s.biggestDayPct.toFixed(1)}% del profit` : undefined} pos={s.biggestDayPnl > 0} />
      </div>

      <div className="stat-grid">
        <MiniStat label="Ganancia promedio" value={money(s.avgWin)} pos />
        <MiniStat label="Pérdida promedio" value={money(s.avgLoss)} />
        <MiniStat label="Mejor operación" value={money(s.bestTrade)} pos />
        <MiniStat label="Peor operación" value={money(s.worstTrade)} />
      </div>

      <div className="grid-2">
        {sessionData.length ? (
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Desglose por sesión</span></div>
            <BreakdownList rows={analysis.bySession.map((x) => ({ name: SESSIONS.find((ses) => ses.value === x.session)?.label ?? x.session, pnl: x.pnl, trades: x.trades }))} />
          </div>
        ) : null}
        {analysis.byInstrument.length ? (
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Por instrumento</span></div>
            <BreakdownList rows={analysis.byInstrument.map((x) => ({ name: x.instrument, pnl: x.pnl, trades: x.trades }))} />
          </div>
        ) : null}
      </div>

      <div className="grid-2">
        {dirData.some((d) => d.pnl !== 0) ? (
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Long vs Short</span></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dirData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} width={60} />
                  <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Bar dataKey="pnl" radius={[0, 6, 6, 0]}>
                    {dirData.map((d, i) => (
                      <Cell key={i} fill={d.pnl >= 0 ? GREEN : RED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {weekdayData.length ? (
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Por día de la semana</span></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekdayData} margin={{ left: 10 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} />
                  <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                    {weekdayData.map((d, i) => (
                      <Cell key={i} fill={d.pnl >= 0 ? GREEN : RED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
      </div>

      {rData.length ? (
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Distribución de R</span></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rData}>
                <XAxis dataKey="r" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={30} />
                <Tooltip contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="count" name="operaciones" radius={[6, 6, 0, 0]}>
                  {rData.map((d, i) => (
                    <Cell key={i} fill={d.r >= 0 ? GREEN : RED} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {analysis.payouts.count > 0 ? (
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Payouts</span></div>
          <div className="stat-grid">
            <MiniStat label="Monto bruto total" value={money(analysis.payouts.totalGross)} />
            <MiniStat label="Tu parte (split)" value={money(analysis.payouts.totalYours)} pos />
            <MiniStat label="Split" value={`${analysis.payouts.profitSplitPct}%`} />
            <MiniStat label="Pagados" value={money(analysis.payouts.totalPaid)} pos />
            <MiniStat label="Pendientes" value={money(analysis.payouts.totalPending)} />
            <MiniStat label="Retiros" value={String(analysis.payouts.count)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function HeroStat({ label, value, pos, big }: { label: string; value: string; pos?: boolean; big?: boolean }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${pos ? 'pos' : ''}`} style={big ? { fontSize: 26 } : undefined}>{value}</span>
    </div>
  )
}

function MiniStat({
  label,
  value,
  sub,
  pos,
  highlight,
}: {
  label: string
  value: string
  sub?: string
  pos?: boolean
  highlight?: boolean
}) {
  return (
    <div className={`stat-card ${highlight ? 'highlight' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${pos ? 'pos' : ''}`} style={{ fontSize: 17 }}>{value}</span>
      {sub ? <span className="stat-sub" style={{ color: 'var(--text-muted)' }}>{sub}</span> : null}
    </div>
  )
}

function BreakdownList({ rows }: { rows: { name: string; pnl: number; trades: number }[] }) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1)
  return (
    <div>
      {rows.map((r, i) => {
        const width = (Math.abs(r.pnl) / maxAbs) * 100
        return (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ fontWeight: 700 }}>{r.name}</span>
              <span>
                <strong style={{ color: r.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{signedMoney(r.pnl)}</strong>
                <span className="muted" style={{ marginLeft: 6 }}>{r.trades} ops</span>
              </span>
            </div>
            <ProgressBar value={width} tone={r.pnl >= 0 ? 'success' : 'danger'} />
          </div>
        )
      })}
    </div>
  )
}

function todayPnl(days: ReturnType<typeof analyzeAccount>['days']): number {
  const todayKey = new Date().toISOString().slice(0, 10)
  return days.find((d) => d.date === todayKey)?.pnl ?? 0
}
