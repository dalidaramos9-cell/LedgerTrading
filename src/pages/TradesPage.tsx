import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { analyzeAccount } from '../lib/engine'
import { Trade } from '../lib/types'
import { signedMoney, shortDate, sessionLabel } from '../lib/fmt'
import TradeForm from '../components/TradeForm'
import { Button, EmptyState, ConfirmDialog, Badge } from '../components/ui'

export default function TradesPage() {
  const { trades, deleteTrade } = useData()
  const account = useRouteAccount()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Trade | null>(null)
  const [toDelete, setToDelete] = useState<Trade | null>(null)

  const filtered = useMemo(() => {
    if (!account) return []
    return trades
      .filter((t) => t.account_id === account.id)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [trades, account])

  const analysis = useMemo(
    () => (account ? analyzeAccount(account, filtered, []) : null),
    [account, filtered],
  )

  async function confirmDelete() {
    if (!toDelete) return
    await deleteTrade(toDelete.id)
    setToDelete(null)
  }

  const stats = analysis?.stats

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operaciones</h1>
          <p className="page-sub">
            {account?.name ?? 'Cuenta'} · {stats ? `${stats.totalTrades} operaciones · ${signedMoney(stats.totalPnl)}` : 'Sin operaciones'}
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true) }}>+ Operación</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🧾" title="Sin operaciones registradas">
          Usa el botón «+ Operación» o haz clic en un día del calendario.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Instrumento</th>
                <th>Dir.</th>
                <th>Sesión</th>
                <th className="num">R</th>
                <th className="num">P&L</th>
                <th>Resultado</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td><span className="muted">{shortDate(t.date)}</span></td>
                  <td><strong>{t.instrument}</strong></td>
                  <td>{t.direction === 'long' ? '▲' : '▼'}</td>
                  <td><Badge tone="neutral">{sessionLabel(t.session)}</Badge></td>
                  <td className={`num ${t.r_result > 0 ? 'pos' : t.r_result < 0 ? 'neg' : ''}`}>
                    {signedR(t.r_result)}
                  </td>
                  <td className={`num ${t.pnl >= 0 ? 'pos' : 'neg'}`} style={{ fontWeight: 700 }}>
                    {signedMoney(t.pnl)}
                  </td>
                  <td>
                    <Badge tone={t.result === 'win' ? 'green' : t.result === 'loss' ? 'red' : 'neutral'}>
                      {t.result === 'win' ? 'Ganadora' : t.result === 'loss' ? 'Perdedora' : 'BE'}
                    </Badge>
                  </td>
                  <td className="muted" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.notes || '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" sm onClick={() => { setEditing(t); setFormOpen(true) }}>Editar</Button>
                      <Button variant="danger" sm onClick={() => setToDelete(t)}>✕</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {account ? (
        <TradeForm
          accountId={account.id}
          initial={editing}
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      ) : null}
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar operación"
        confirmLabel="Eliminar"
        message={
          <>
            Se eliminará la operación de <strong>{toDelete?.instrument}</strong> del {toDelete ? shortDate(toDelete.date) : ''} ({toDelete ? signedMoney(toDelete.pnl) : ''}). Esta acción no se puede deshacer.
          </>
        }
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function signedR(v: number): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}
