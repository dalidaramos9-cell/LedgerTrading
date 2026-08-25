import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { analyzeAccount } from '../lib/engine'
import { isoDate, signedMoney, monthName } from '../lib/fmt'
import TradeForm from '../components/TradeForm'
import { Button, EmptyState } from '../components/ui'

export default function CalendarPage() {
  const { trades, payouts } = useData()
  const account = useRouteAccount()

  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const [datePicker, setDatePicker] = useState<string | null>(null)

  // El calendario muestra TODAS las operaciones de la cuenta (registro cronológico),
  // para que puedas registrar y ver operaciones de cualquier fecha, sin importar
  // la fase activa seleccionada en otros paneles.
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
      <EmptyState icon="📅" title="Cuenta no encontrada">
        Elige una cuenta para ver su calendario.
      </EmptyState>
    )
  }

  const acctTrades = analysis.days
  const pnlMap = new Map(acctTrades.map((d) => [d.date, d.pnl]))

  const year = cursor.year
  const month = cursor.month
  const monthStart = new Date(year, month - 1, 1)
  const startDow = monthStart.getDay()
  const daysInMonth = new Date(year, month, 0).getDate()

  const todayStr = isoDate(new Date())
  const monthTotal = pnlMap.size
    ? acctTrades
        .filter((d) => d.date.startsWith(`${year}-${String(month).padStart(2, '0')}`))
        .reduce((s, d) => s + d.pnl, 0)
    : 0

  const weekRows: {
    label: string
    pnl: number
    trades: number
    days: { date: string; pnl: number | null }[]
  }[] = []
  {
    let cnt = 0
    for (let ws = 1 - startDow; ws <= daysInMonth; ws += 7) {
      const days: { date: string; pnl: number | null }[] = []
      let pnl = 0
      let trades = 0
      for (let i = 0; i < 7; i++) {
        const d = ws + i
        if (d < 1 || d > daysInMonth) {
          days.push({ date: '', pnl: null })
          continue
        }
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dayPnl = pnlMap.get(dateStr) ?? 0
        const dayTrades = analysis.days.find((dd) => dd.date === dateStr)?.trades ?? 0
        pnl += dayPnl
        trades += dayTrades
        days.push({ date: dateStr, pnl: dayTrades > 0 ? dayPnl : null })
      }
      cnt++
      weekRows.push({ label: `Sem ${cnt}`, pnl, trades, days })
    }
  }

  const cells: { day: number | null; date: string; pnl: number | null }[] = []
  for (let i = 0; i < startDow; i++) cells.push({ day: null, date: '', pnl: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, date: dateStr, pnl: pnlMap.get(dateStr) ?? null })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, date: '', pnl: null })

  function go(delta: number) {
    setCursor((c) => {
      const nm = c.month + delta
      if (nm < 1) return { year: c.year - 1, month: 12 }
      if (nm > 12) return { year: c.year + 1, month: 1 }
      return { year: c.year, month: nm }
    })
  }

  return (
    <div>
      <div className="calendar-layout">
        <div className="calendar-main">
          <div className="calendar-head">
            <div className="calendar-nav">
              <Button variant="ghost" sm onClick={() => go(-1)}>‹</Button>
              <div className="calendar-month-label">{monthName(year, month)}</div>
              <Button variant="ghost" sm onClick={() => go(1)}>›</Button>
              <Button
                variant="subtle"
                sm
                onClick={() => {
                  const d = new Date()
                  setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 })
                }}
              >
                Hoy
              </Button>
            </div>
            <div className="calendar-total" style={{ color: monthTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {signedMoney(monthTotal)}
            </div>
          </div>

          <div className="calendar-grid">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
              <div key={d} className="calendar-weekday">{d}</div>
            ))}
            {cells.map((c, i) =>
              c.day === null ? (
                <div key={i} className="calendar-cell outside" />
              ) : (
                <div
                  key={i}
                  className={`calendar-cell ${c.date === todayStr ? 'today' : ''}`}
                  onClick={() => setDatePicker(c.date)}
                  title={`${c.date} — haz clic para registrar operación`}
                >
                  <span className="calendar-daynum">{c.day}</span>
                  {c.pnl !== null ? (
                    <span className={`calendar-daypnl ${c.pnl >= 0 ? 'pos' : 'neg'}`}>
                      {signedMoney(c.pnl)}
                    </span>
                  ) : null}
                </div>
              ),
            )}
          </div>
        </div>

        <div className="calendar-side">
          <div className="panel">
            <div className="panel-head"><span className="panel-title">Resumen por semana</span></div>
            {weekRows.map((w, i) => (
              <div className="week-summary-row" key={i}>
                <div className="week-summary-top">
                  <span style={{ fontWeight: 700 }}>{w.label}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 12,
                      color: w.pnl >= 0 ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {signedMoney(w.pnl)}
                  </span>
                </div>
                <div className="week-circles">
                  {w.days.map((d, j) => (
                    <span
                      key={j}
                      className="week-circle"
                      title={d.date}
                      style={{
                        background:
                          d.pnl === null
                            ? d.date
                              ? 'transparent'
                              : 'var(--border)'
                            : d.pnl >= 0
                              ? 'var(--green)'
                              : 'var(--red)',
                        border: d.date ? '1px solid var(--border)' : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="week-summary-row" style={{ border: 'none' }}>
              <span className="muted" style={{ fontSize: 12 }}>
                {acctTrades.length} días con actividad
              </span>
            </div>
          </div>
        </div>
      </div>

      {datePicker ? (
        <TradeForm
          accountId={account.id}
          defaultDate={datePicker}
          open
          onClose={() => setDatePicker(null)}
        />
      ) : null}
    </div>
  )
}
