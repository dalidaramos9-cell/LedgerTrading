import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell,
} from 'recharts'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { analyzeAccount } from '../lib/engine'
import { SESSIONS } from '../lib/types'
import { money, signedMoney, signedNum, formatNum, weekdayLabel } from '../lib/fmt'
import { EmptyState, ProgressBar } from '../components/ui'

const GREEN = '#16a34a'
const RED = '#dc2626'
const BLUE = '#2563eb'

export default function DashboardPage() {
  const { trades, payouts } = useData()
  const account = useRouteAccount()

  const analysis = useMemo(
    () =>
      account
        ? analyzeAccount(
            account,
            trades.filter((t) => t.account_id === account.id),
            payouts.filter((p) => p.account_id === account.id),
          )
        : null,
    [account, trades, payouts],
  )
  if (!account || !analysis) {
    return (
      <EmptyState icon="📊" title="Cuenta no encontrada">
        Elige una cuenta de la barra lateral para ver su dashboard.
      </EmptyState>
    )
  }

  const s = analysis.stats
  const equityData = analysis.equity.map((p) => ({
    label: p.date.slice(5),
    balance: p.balance,
  }))

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

  return (
    <div className="stack">
      <div className="dash-hero">
        <HeroStat label="Balance actual" value={money(s.currentBalance)} big />
        <HeroStat
          label="Rentabilidad"
          value={`${((s.totalPnl / account.initial_balance) * 100).toFixed(2)}%`}
          pos={s.totalPnl > 0}
        />
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
            <span className="legend-swatch" style={{ background: BLUE }} /> balance
          </span>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={equityData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
              <defs>
                <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={56} />
              <Tooltip
                formatter={(v) => money(Number(v))}
                contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
              />
              <Area type="monotone" dataKey="balance" stroke={BLUE} strokeWidth={2} fill="url(#eqGrad)" />
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

function MiniStat({ label, value, sub, pos }: { label: string; value: string; sub?: string; pos?: boolean }) {
  return (
    <div className="stat-card">
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
