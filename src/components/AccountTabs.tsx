import { useParams, NavLink, Outlet } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { ACCOUNT_TYPE_LABELS, ACCOUNT_STATUS_LABELS, Account, AccountStatus, effectiveAccountStatus } from '../lib/types'
import { money } from '../lib/fmt'
import { Badge, EmptyState } from './ui'
import { AccountRouteProvider } from '../contexts/AccountRouteContext'
import { ActivePhaseProvider, useActivePhase } from '../contexts/ActivePhaseContext'

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

function AccountHeader({ account }: { account: Account }) {
  // Se deriva el estado de la etapa real para que la insignia no pueda
  // contradecir a la fase activa (ver effectiveAccountStatus).
  const status = effectiveAccountStatus(account)
  return (
    <div className="account-tabs-header">
      <div className="account-tabs-title">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="page-title">{account.name}</h1>
          <Badge tone={STATUS_TONE[status]}>{ACCOUNT_STATUS_LABELS[status]}</Badge>
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
      <ActivePhaseProvider>
        <AccountHeader account={account} />
        <PhaseBanner account={account} />
        <Outlet />
      </ActivePhaseProvider>
    </AccountRouteProvider>
  )
}

// Muestra qué fase está activa en los paneles y permite volver a la actual.
// Aplica a todos los programas con fases: en Fondeo CFD y Futuros la selección
// de una fase histórica también filtra los paneles, así que sin este aviso no
// hay forma de saber que se está viendo una fase pasada ni de volver a la actual.
function PhaseBanner({ account }: { account: { type: string; rules: { type: string } } }) {
  const { activePhase, selectCurrent } = useActivePhase()
  const hasPhases =
    account.type === 'axi' ||
    account.rules.type === 'axi' ||
    account.rules.type === 'futures' ||
    account.rules.type === 'cfd'
  if (!hasPhases) return null
  if (!activePhase || activePhase.kind === 'current') return null
  return (
    <div
      className="alert-banner warn"
      style={{ marginBottom: 12, cursor: 'pointer' }}
      onClick={() => selectCurrent()}
      title="Ver la fase actual"
    >
      ⚠️ Mostrando la fase «{activePhase.label}» (histórica). Haz clic para volver a la fase actual.
    </div>
  )
}
