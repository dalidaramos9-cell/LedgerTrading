import { useParams, NavLink, Outlet } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { ACCOUNT_TYPE_LABELS, ACCOUNT_STATUS_LABELS, AccountStatus } from '../lib/types'
import { money } from '../lib/fmt'
import { Badge, EmptyState } from './ui'
import { AccountRouteProvider } from '../contexts/AccountRouteContext'

const STATUS_TONE: Record<AccountStatus, string> = {
  active: 'blue',
  evaluation: 'amber',
  funded: 'green',
  failed: 'red',
  passed: 'green',
  cushion: 'amber',
}

export const ACCOUNT_TABS = [
  { to: 'dashboard', label: 'Dashboard' },
  { to: 'calendario', label: 'Calendario' },
  { to: 'operaciones', label: 'Operaciones' },
  { to: 'etapas', label: 'Etapas' },
  { to: 'mensual', label: 'Mensual' },
  { to: 'payouts', label: 'Payouts' },
]

function AccountHeader({
  account,
}: {
  account: { name: string; type: string; broker: string; status: AccountStatus; initial_balance: number }
}) {
  return (
    <div className="account-tabs-header">
      <div className="account-tabs-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="page-title">{account.name}</h1>
          <Badge tone={STATUS_TONE[account.status]}>{ACCOUNT_STATUS_LABELS[account.status]}</Badge>
        </div>
        <p className="page-sub" style={{ marginTop: 2 }}>
          {ACCOUNT_TYPE_LABELS[account.type as keyof typeof ACCOUNT_TYPE_LABELS]} · {account.broker} · Inicial{' '}
          {money(account.initial_balance)}
        </p>
      </div>
      <nav className="account-tabs-nav">
        {ACCOUNT_TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={false} className={({ isActive }) => `account-tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function AccountTabs() {
  const { id } = useParams<{ id: string }>()
  const { accounts } = useData()
  const account = id ? (accounts.find((a) => a.id === id) ?? null) : null

  if (!account) {
    return (
      <EmptyState icon="🔍" title="Cuenta no encontrada">
        Esta cuenta no existe o ya no está disponible. Elige otra de la barra lateral.
      </EmptyState>
    )
  }

  return (
    <AccountRouteProvider>
      <AccountHeader account={account} />
      <Outlet />
    </AccountRouteProvider>
  )
}
