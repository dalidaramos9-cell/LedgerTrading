import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { Trade, AxiStageHistory } from '../lib/types'
import { useRouteAccount } from './AccountRouteContext'

// Define qué fase se está mostrando en todos los paneles.
export type ActivePhase =
  | { kind: 'current'; label: string } // fase actual de la cuenta
  | { kind: 'history'; label: string; startDate: string; endDate: string } // una fase pasada
  | null

interface ActivePhaseCtx {
  activePhase: ActivePhase
  selectCurrent: () => void
  selectHistory: (h: AxiStageHistory) => void
  // Devuelve solo los trades que caen dentro de la fase activa seleccionada.
  tradesForActive: (accountTrades: Trade[]) => Trade[]
  getCurrentRange: () => { start: string; end: string } | null
}

const Ctx = createContext<ActivePhaseCtx | null>(null)

export function ActivePhaseProvider({ children }: { children: ReactNode }) {
  const account = useRouteAccount()
  const [activePhase, setActivePhase] = useState<ActivePhase>(null)

  // Cuando cambia la cuenta, volver a la fase actual por defecto.
  useEffect(() => {
    setActivePhase(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id])

  // Rango de fechas de la fase actual.
  function getCurrentRange(): { start: string; end: string } | null {
    if (!account) return null
    if (account.type === 'axi' && account.rules.type === 'axi') {
      const start = account.rules.current_stage_start_date ?? account.start_date
      return { start, end: new Date().toISOString() }
    }
    return null
  }

  function rangeFor(phase: ActivePhase): { start: string; end: string } | null {
    if (!phase) return getCurrentRange()
    if (phase.kind === 'history') return { start: phase.startDate, end: phase.endDate }
    return getCurrentRange()
  }

  function tradesForActive(accountTrades: Trade[]): Trade[] {
    const range = rangeFor(activePhase)
    if (!range) return accountTrades
    return accountTrades.filter((t) => {
      const d = t.date.slice(0, 10)
      return d >= range.start.slice(0, 10) && d <= range.end.slice(0, 10)
    })
  }

  const value: ActivePhaseCtx = {
    activePhase,
    selectCurrent: () => setActivePhase(null),
    selectHistory: (h) =>
      setActivePhase({ kind: 'history', label: h.stageLabel, startDate: h.startDate, endDate: h.endDate }),
    tradesForActive,
    getCurrentRange,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useActivePhase(): ActivePhaseCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useActivePhase must be used within ActivePhaseProvider')
  return ctx
}
