import { useLayoutEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useTheme } from '../contexts/ThemeContext'
import { AccountType } from '../lib/types'
import { money } from '../lib/fmt'
import LedgerLogo from './LedgerLogo'

type Icon = 'wallet' | 'plus'

function Icon({ name }: { name: Icon }) {
  const paths: Record<Icon, string> = {
    wallet: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm16 0H5v10h14V7zm-3 4h3v2h-3v-2z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z',
  }
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d={paths[name]} />
    </svg>
  )
}

const TYPE_SHORT: Record<AccountType, string> = {
  own: 'Propio',
  cfd: 'CFD',
  futures: 'Futuros',
  axi: 'Axi',
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="theme-toggle" title="Cambiar tema">
      <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => toggleTheme()}>
        ☀️
      </button>
      <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => toggleTheme()}>
        🌙
      </button>
    </div>
  )
}

function SaveIndicator() {
  const { saveState } = useData()
  if (saveState === 'idle') return null
  const label =
    saveState === 'saving' ? 'Guardando…' : saveState === 'error' ? 'Error al guardar' : 'Guardado en la nube'
  return (
    <span className="save-indicator">
      <span className={`save-dot ${saveState}`} />
      {label}
    </span>
  )
}

function AccountList({ mobile, onNavigate }: { mobile: boolean; onNavigate?: () => void }) {
  const { accounts } = useData()
  const location = useLocation()
  const isActive = (id: string) => location.pathname.startsWith(`/cuenta/${id}`)
  return (
    <div className="sidebar-accounts">
      <div className="sidebar-label">Cuentas</div>
      {accounts.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, padding: '4px 10px' }}>
          Aún no tienes cuentas. Crea una.
        </div>
      ) : (
        accounts.map((a) => (
          <NavLink
            key={a.id}
            to={`/cuenta/${a.id}/dashboard`}
            className={`account-link ${isActive(a.id) ? 'active' : ''}`}
            onClick={() => mobile && onNavigate?.()}
          >
            <span className="account-link-emoji">💼</span>
            <span className="account-link-body">
              <span className="account-link-name">{a.name}</span>
              <span className="account-link-sub">
                {TYPE_SHORT[a.type]} · {money(a.initial_balance)}
              </span>
            </span>
          </NavLink>
        ))
      )}
      <NavLink
        to="/cuentas"
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        onClick={() => mobile && onNavigate?.()}
      >
        <Icon name="wallet" /> Gestión de cuentas
      </NavLink>
    </div>
  )
}

function AppLayout() {
  const { user, signOut } = useAuth()
  const { accounts } = useData()
  const navigate = useNavigate()
  const location = useLocation()
  const [drawer, setDrawer] = useState(false)

  // Marca el color de marca global según la cuenta activa de la ruta: rojo Axi
  // para las cuentas del broker Axi, sin atributo (azul) para el resto. El CSS
  // lee `data-brand='axi'` en <html> para teñir los acentos de la app.
  // Se usa useLayoutEffect para aplicarlo ANTES del pintado y evitar parpadeos.
  useLayoutEffect(() => {
    const m = location.pathname.match(/^\/cuenta\/([^/]+)/)
    const active = m ? accounts.find((a) => a.id === m[1]) : null
    const isAxi =
      !!active && (active.type === 'axi' || (active.broker ?? '').toLowerCase().includes('axi'))
    document.documentElement.setAttribute('data-brand', isAxi ? 'axi' : '')
  }, [location.pathname, accounts])

  const renderSidebarContent = (mobile: boolean, onClose?: () => void) => (
    <>
      <div className="brand">
        <LedgerLogo size={34} />
        <div className="brand-name">Ledger</div>
      </div>
      <AccountList mobile={mobile} onNavigate={onClose} />
      <div className="sidebar-footer">
        <div className="user-chip">{user?.email}</div>
        <button className="nav-item" onClick={() => signOut()}>
          Cerrar sesión
        </button>
      </div>
    </>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">{renderSidebarContent(false)}</aside>

      <div className="mobile-brand-bar">
        <button className="menu-btn" onClick={() => setDrawer(true)}>
          ☰
        </button>
        <div className="brand-name">Ledger</div>
        <ThemeToggleButton />
      </div>

      {drawer ? (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <div className="drawer">{renderSidebarContent(true, () => setDrawer(false))}</div>
        </>
      ) : null}

      <main className="main">
        <div className="topbar">
          <div className="page-sub" style={{ margin: 0 }}>
            Ledger
          </div>
          <div className="topbar-right">
            <SaveIndicator />
            <ThemeToggleButton />
            <button className="btn primary sm" onClick={() => navigate('/cuentas')}>
              <Icon name="plus" /> Nueva cuenta
            </button>
          </div>
        </div>
        <Outlet />
      </main>

      <nav className="mobile-nav">
        <NavLink to="/cuentas" end className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
          <Icon name="wallet" /> Cuentas
        </NavLink>
        <button className="mobile-nav-fab" onClick={() => navigate('/cuentas')} title="Nueva cuenta">
          +
        </button>
      </nav>
    </div>
  )
}

export default AppLayout
