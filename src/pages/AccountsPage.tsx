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
            const accTrades = trades.filter((t) => t.account_id === acc.id)
            const an = analyzeAccount(acc, accTrades, payouts.filter((p) => p.account_id === acc.id))
            const isAxiAcct = acc.type === 'axi'
            // Fase actual (para Axi) y su multiplicador.
            const currentStage =
              isAxiAcct && acc.rules.type === 'axi' && acc.rules.stages.length > 0
                ? acc.rules.stages[acc.current_stage_index] ?? null
                : null
            // Análisis de la fase actual (trades desde su fecha de inicio), igual que
            // el Dashboard, para que el balance coincida.
            let balanceFase = an.stats.currentBalance
            let patrimonio = 0
            if (isAxiAcct && acc.rules.type === 'axi' && acc.rules.stages.length > 0) {
              const startStr = (acc.rules.current_stage_start_date ?? acc.start_date).slice(0, 10)
              const faseTrades = accTrades.filter((t) => t.date.slice(0, 10) >= startStr)
              const anFase = analyzeAccount(acc, faseTrades, payouts.filter((p) => p.account_id === acc.id))
              const stageBase =
                acc.rules.current_stage_balance != null ? acc.rules.current_stage_balance : acc.initial_balance
              // Balance de la fase: balance real de entrada + P&L de la fase (coincide
              // con el Dashboard y la curva de equity).
              balanceFase = anFase.stats.currentBalance + (stageBase - acc.initial_balance)
              const fasePnl = anFase.stats.totalPnl
              const mult = currentStage?.multiplier ?? 1
              patrimonio = (stageBase + fasePnl) * mult
            }
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
                    {money(balanceFase)}
                    {isAxiAcct && acc.rules.type === 'axi' && acc.rules.stages.length > 0 ? (
                      <>
                        {' '}
                        <span className="muted" style={{ fontWeight: 500 }}>|</span>{' '}
                        <span style={{ color: 'var(--green)' }}>{money(patrimonio)}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="page-sub" style={{ marginTop: 2 }}>
                    {an.stats.totalPnl >= 0 ? '+' : ''}
                    {money(an.stats.totalPnl)} · {an.stats.totalTrades} ops
                  </div>
                  {isAxiAcct && acc.rules.type === 'axi' && acc.rules.stages.length > 0 && currentStage ? (
                    <div
                      style={{
                        marginTop: 8,
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 999,
                        background: 'var(--accent-soft)',
                        color: 'var(--accent-strong)',
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Fase actual: {currentStage.label}
                    </div>
                  ) : null}
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
