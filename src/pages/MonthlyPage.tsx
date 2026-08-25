import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { analyzeAccount } from '../lib/engine'
import { money, signedMoney, monthName } from '../lib/fmt'
import { EmptyState } from '../components/ui'

const GREEN = '#16a34a'
const RED = '#dc2626'

export default function MonthlyPage() {
  const { trades, payouts } = useData()
  const account = useRouteAccount()

  const analysis = useMemo(() => {
    if (!account) return null
    return analyzeAccount(
      account,
      trades.filter((t) => t.account_id === account.id),
      payouts.filter((p) => p.account_id === account.id),
    )
  }, [account, trades, payouts])

  if (!account || !analysis) {
    return (
      <EmptyState icon="📈" title="Cuenta no encontrada">
        Elige una cuenta para ver la vista mensual (estilo myfxbook).
      </EmptyState>
    )
  }

  const monthly = analysis.monthly
  const chartData = monthly.map((m) => ({
    name: `${String(m.month).padStart(2, '0')}/${m.year}`,
    pct: m.startBalance > 0 ? (m.pnl / m.startBalance) * 100 : 0,
  }))

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vista mensual</h1>
          <p className="page-sub">Histórico mes a mes (estilo myfxbook).</p>
        </div>
      </div>

      {monthly.length === 0 ? (
        <EmptyState icon="🗓️" title="Sin operaciones todavía">
          Registra operaciones para ver el desglose mensual.
        </EmptyState>
      ) : (
        <>
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Ganancia % por mes</span></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={44} unit="%" />
                  <Tooltip
                    formatter={(v) => `${Number(v).toFixed(2)}%`}
                    contentStyle={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.pct >= 0 ? GREEN : RED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="num">P&L neto</th>
                  <th className="num">R neto</th>
                  <th className="num">Operaciones</th>
                  <th className="num">Win rate</th>
                  <th className="num">Mejor día</th>
                  <th className="num">Peor día</th>
                  <th className="num">Balance final</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={`${m.year}-${m.month}`}>
                    <td><strong>{monthName(m.year, m.month)}</strong></td>
                    <td className="num" style={{ color: m.pnl >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {signedMoney(m.pnl)}
                    </td>
                    <td className={`num ${m.rNet >= 0 ? 'pos' : 'neg'}`}>{signedR(m.rNet)}</td>
                    <td className="num">{m.trades}</td>
                    <td className="num">{m.winRate.toFixed(0)}%</td>
                    <td className="num pos">{signedMoney(m.bestDay)}</td>
                    <td className="num neg">{signedMoney(m.worstDay)}</td>
                    <td className="num"><strong>{money(m.endBalance)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function signedR(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}R`
}
