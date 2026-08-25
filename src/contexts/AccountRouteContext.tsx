import { createContext, useContext } from 'react'
import { useParams } from 'react-router-dom'
import { Account } from '../lib/types'
import { useData } from './DataContext'

// Provee la cuenta activa a partir de la ruta /cuenta/:id/...
// Así todas las pestañas (dashboard, calendario, etc.) comparten la misma
// cuenta seleccionada sin duplicar selectores.
const Ctx = createContext<Account | null>(null)

export function AccountRouteProvider({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const { accounts } = useData()
  const account = id ? (accounts.find((a) => a.id === id) ?? null) : null
  return <Ctx.Provider value={account}>{children}</Ctx.Provider>
}

export function useRouteAccount(): Account | null {
  return useContext(Ctx)
}
