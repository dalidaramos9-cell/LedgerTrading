import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useData } from './contexts/DataContext'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import AccountTabs from './components/AccountTabs'
import DashboardPage from './pages/DashboardPage'
import CalendarPage from './pages/CalendarPage'
import MonthlyPage from './pages/MonthlyPage'
import TradesPage from './pages/TradesPage'
import PayoutsPage from './pages/PayoutsPage'
import StagesPage from './pages/StagesPage'
import AccountsPage from './pages/AccountsPage'
import LoadingScreen from './components/LoadingScreen'

// Redirige a la primera cuenta del usuario (o a la gestión si no hay ninguna).
function HomeRedirect() {
  const { accounts } = useData()
  const first = accounts[0]
  if (first) return <Navigate to={`/cuenta/${first.id}/dashboard`} replace />
  return <Navigate to="/cuentas" replace />
}

export default function App() {
  const { user, initializing } = useAuth()

  if (initializing) return <LoadingScreen />

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/cuentas" element={<AccountsPage />} />
        <Route path="/cuenta/:id" element={<AccountTabs />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="calendario" element={<CalendarPage />} />
          <Route path="operaciones" element={<TradesPage />} />
          <Route path="etapas" element={<StagesPage />} />
          <Route path="mensual" element={<MonthlyPage />} />
          <Route path="payouts" element={<PayoutsPage />} />
        </Route>
        <Route path="cuenta/:id" element={<Navigate to="./dashboard" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

