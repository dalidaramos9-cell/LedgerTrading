import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { analyzeAccount } from '../lib/engine'
import { Payout, PAYOUT_STATUS_LABELS } from '../lib/types'
import { money, shortDate } from '../lib/fmt'
import PayoutForm from '../components/PayoutForm'
import { Button, EmptyState, ConfirmDialog, Badge } from '../components/ui'

const STATUS_TONE: Record<string, string> = {
  requested: 'amber',
  approved: 'blue',
  paid: 'green',
  rejected: 'red',
}

export default function PayoutsPage() {
  const { payouts, deletePayout } = useData()
  const account = useRouteAccount()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Payout | null>(null)
  const [toDelete, setToDelete] = useState<Payout | null>(null)

  const filtered = useMemo(() => {
    if (!account) return []
    return payouts
      .filter((p) => p.account_id === account.id)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [payouts, account])

  const summary = useMemo(
    () => (account ? analyzeAccount(account, [], filtered) : null),
    [account, filtered],
  )

  async function confirmDelete() {
    if (!toDelete) return
    await deletePayout(toDelete.id)
    setToDelete(null)
  }

  const p = summary?.payouts

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payouts</h1>
          <p className="page-sub">
            {account?.name ?? 'Cuenta'} · retiros con tu split correspondiente
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true) }}>+ Registrar payout</Button>
      </div>

      {p && p.count > 0 ? (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <MiniStat label="Monto bruto" value={money(p.totalGross)} />
          <MiniStat label="Tu parte (split)" value={money(p.totalYours)} pos />
          <MiniStat label="Split" value={`${p.profitSplitPct}%`} />
          <MiniStat label="Pagados" value={money(p.totalPaid)} pos />
          <MiniStat label="Pendientes" value={money(p.totalPending)} />
          <MiniStat label="Retiros" value={String(p.count)} />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState icon="💵" title="Sin payouts registrados">
          Cuando una cuenta esté fondeada, registra aquí cada retiro con su split.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Fase</th>
                <th className="num">Monto bruto</th>
                <th className="num">Split</th>
                <th className="num">Tu parte</th>
                <th>Estado</th>
                <th>Nota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><span className="muted">{shortDate(p.date)}</span></td>
                  <td>{p.stage_label ? <Badge tone="neutral">{p.stage_label}</Badge> : <span className="muted">—</span>}</td>
                  <td className="num"><strong>{money(p.gross)}</strong></td>
                  <td className="num">{p.split_pct}%</td>
                  <td className="num" style={{ color: 'var(--green)', fontWeight: 700 }}>{money((p.gross * p.split_pct) / 100)}</td>
                  <td><Badge tone={STATUS_TONE[p.status]}>{PAYOUT_STATUS_LABELS[p.status]}</Badge></td>
                  <td className="muted">{p.note || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" sm onClick={() => { setEditing(p); setFormOpen(true) }}>Editar</Button>
                      <Button variant="danger" sm onClick={() => setToDelete(p)}>✕</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {account ? (
        <PayoutForm
          account={account}
          initial={editing}
          open={formOpen}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      ) : null}
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar payout"
        confirmLabel="Eliminar"
        message={
          <>
            Se eliminará el retiro de {toDelete ? money(toDelete.gross) : ''} ({toDelete ? shortDate(toDelete.date) : ''}). Esta acción no se puede deshacer.
          </>
        }
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

function MiniStat({ label, value, pos }: { label: string; value: string; pos?: boolean }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${pos ? 'pos' : ''}`} style={{ fontSize: 17 }}>{value}</span>
    </div>
  )
}
