import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { analyzeAccount } from '../lib/engine'
import { ACCOUNT_TYPE_LABELS, ACCOUNT_STATUS_LABELS, Account, AccountStatus } from '../lib/types'
import { money } from '../lib/fmt'
import AccountForm from '../components/AccountForm'
import { Button, Badge, EmptyState, ConfirmDialog } from '../components/ui'

const STATUS_TONE: Record<AccountStatus, string> = {
  active: 'blue',
  evaluation: 'amber',
  funded: 'green',
  failed: 'red',
  passed: 'green',
  cushion: 'amber',
}

export default function AccountsPage() {
  const { accounts, trades, payouts, deleteAccount } = useData()
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [toDelete, setToDelete] = useState<Account | null>(null)

  function openNew() {
    setEditing(null)
    setFormOpen(true)
  }
  function openEdit(acc: Account) {
    setEditing(acc)
    setFormOpen(true)
  }

  async function confirmDelete() {
    if (!toDelete) return
    await deleteAccount(toDelete.id)
    setToDelete(null)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas</h1>
          <p className="page-sub">Gestiona capital propio y cuentas de fondeo.</p>
        </div>
        <Button onClick={openNew}>+ Nueva cuenta</Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon="💼" title="Aún no tienes cuentas">
          Crea tu primera cuenta (propia o de fondeo) para empezar a registrar operaciones.
        </EmptyState>
      ) : (
        <div className="accounts-grid">
          {accounts.map((acc) => {
            const an = analyzeAccount(acc, trades.filter((t) => t.account_id === acc.id), payouts.filter((p) => p.account_id === acc.id))
            return (
              <div
                key={acc.id}
                className="account-card"
                onClick={() => {
                  navigate(`/cuenta/${acc.id}/dashboard`)
                }}
              >
                <div className="account-card-head">
                  <div>
                    <div className="account-card-name">{acc.name}</div>
                    <div className="account-card-sub">
                      {ACCOUNT_TYPE_LABELS[acc.type]} · {acc.broker}
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[acc.status]}>{ACCOUNT_STATUS_LABELS[acc.status]}</Badge>
                </div>
                <div>
                  <div className="account-balance">
                    {money(an.stats.currentBalance)}
                    {acc.type === 'axi' && acc.rules.type === 'axi' && acc.rules.stages.length > 0 ? (
                      <>
                        {' '}
                        <span className="muted" style={{ fontWeight: 500 }}>|</span>{' '}
                        <span style={{ color: 'var(--green)' }}>
                          {money(
                            ((acc.initial_balance + (acc.rules.stage_capital_total ?? 0) + an.stats.totalPnl) *
                              (acc.rules.stages[acc.current_stage_index]?.multiplier ?? 1)),
                          )}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="page-sub" style={{ marginTop: 2 }}>
                    {an.stats.totalPnl >= 0 ? '+' : ''}
                    {money(an.stats.totalPnl)} · {an.stats.totalTrades} ops
                  </div>
                </div>
                <div className="risk-row">
                  <span>Inicial: {money(acc.initial_balance)}</span>
                  <span>Riesgo: {acc.risk_per_trade}%</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    variant="ghost"
                    sm
                    onClick={(e) => {
                      e?.stopPropagation()
                      openEdit(acc)
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="danger"
                    sm
                    onClick={(e) => {
                      e?.stopPropagation()
                      setToDelete(acc)
                    }}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AccountForm initial={editing} open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} />
      <ConfirmDialog
        open={!!toDelete}
        title="Eliminar cuenta"
        confirmLabel="Sí, eliminar"
        message={
          <>
            Se eliminarán <strong>{toDelete?.name}</strong> y todas sus operaciones y payouts asociados. Esta acción no se puede deshacer.
          </>
        }
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
