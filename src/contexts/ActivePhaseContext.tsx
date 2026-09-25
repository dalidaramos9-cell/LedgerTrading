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

  // Cuando cambia la cuenta o la fase actual, volver a la fase actual por defecto
  // (para que los paneles se "reseteeen" al pasar de Seed a Incubation, etc.).
  //
  // Solo se resetea cuando cambia de verdad la IDENTIDAD de la fase actual: si
  // dependiéramos de la cuenta entera, cualquier actualización de datos (p. ej.
  // un guardado o el realtime) reiniciaría la selección y el Calendario volvería
  // a la fase actual, dejando a la vista una cuadrícula sin trades.
  const accountId = account?.id
  const stageStartKey =
    account?.rules.type === 'axi' || account?.rules.type === 'futures' || account?.rules.type === 'cfd'
      ? account?.rules.current_stage_start_date
      : undefined
  useEffect(() => {
    setActivePhase(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, stageStartKey])

  // Rango de fechas de la fase actual. Aplica a los programas con reset por fase
  // (Axi Select, Fondeo Futuros y Fondeo CFD): la fase actual arranca en su fecha
  // de inicio.
  function getCurrentRange(): { start: string; end: string } | null {
    if (!account) return null
    if (
      account.rules.type === 'axi' ||
      account.rules.type === 'futures' ||
      account.rules.type === 'cfd'
    ) {
      const start = account.rules.current_stage_start_date
      // Si la cuenta aún no tiene fecha de fase (nunca avanzó), no se acota nada:
      // toda la vida de la cuenta pertenece a la fase actual.
      if (!start) return null
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
