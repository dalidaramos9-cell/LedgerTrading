import { useEffect, useRef, useState } from 'react'
import { Account } from '../lib/types'
import { AccountAnalysis } from '../lib/engine'
import { useData } from '../contexts/DataContext'

// Avance automático de etapas. Aplica a todos los programas:
// Fondeo de Futuros, Fondeo CFD y Axi Select. Al alcanzar el objetivo de la
// etapa actual, la cuenta sube sola, se reinicia el punto de partida y se
// muestra el modal de celebración.
export function useStageAutoAdvance(account: Account | null, analysis: AccountAnalysis | null) {
  const { updateAccount } = useData()
  const [celebrated, setCelebrated] = useState<ReturnType<typeof toCelebration> | null>(null)
  const advancing = useRef(false)

  useEffect(() => {
    if (!account || !analysis || advancing.current) return

    const pending = analysis.stages.find((s) => s.needsAdvance && !s.isComplete)
    if (!pending) return

    const nextIndex = pending.stageIndex + 1
    // Al entrar a la nueva etapa se reinicia el punto de partida:
    // el nuevo stage_start_pnl = P&L acumulado actual (la etapa arranca en cero).
    const updated: Account = {
      ...account,
      current_stage_index: nextIndex,
      stage_start_pnl: analysis.stats.totalPnl,
    }
    // Para Axi Select: marca las etapas como completada/actual/pendiente y
    // guarda el resumen de la fase completada en el historial (no se pierde
    // el desempeño de la fase anterior al reiniciar el conteo).
    if (account.rules.type === 'axi') {
      const stages = account.rules.stages.map((st, i) => {
        if (i < nextIndex) return { ...st, status: 'completed' as const }
        if (i === nextIndex) return { ...st, status: 'current' as const }
        return { ...st, status: 'pending' as const }
      })
      const prevStage = account.rules.stages[pending.stageIndex]
      const netPnl = Math.round((analysis.stats.totalPnl - (account.stage_start_pnl ?? 0)) * 100) / 100
      const history = [
        ...(account.rules.stage_history ?? []),
        {
          stageLabel: pending.stageLabel,
          minEquity: prevStage?.minEquity ?? 0,
          startBalance: Math.round(account.rules.current_stage_balance ?? account.initial_balance),
          endBalance: Math.round(analysis.stats.currentBalance),
          netPnl,
          trades: analysis.stats.totalTrades,
          winRate: analysis.stats.winRate,
          profitFactor: analysis.stats.profitFactor,
          capitalAdded: 0,
          startDate: account.start_date,
          endDate: new Date().toISOString(),
        },
      ]
      updated.rules = { ...account.rules, stages, stage_history: history }
    }

    advancing.current = true
    setCelebrated(toCelebration(pending.stageLabel, nextIndex, account, analysis))
    updateAccount(updated)
      .catch(() => {
        /* si falla, reintentará al próximo render */
      })
      .finally(() => {
        setTimeout(() => {
          advancing.current = false
        }, 800)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, analysis])

  return { celebrated, dismiss: () => setCelebrated(null) }
}

function toCelebration(
  stageLabel: string,
  nextIndex: number,
  account: Account,
  analysis: AccountAnalysis,
) {
  const nextStage = analysis.stages[nextIndex]
  return {
    title: `¡Avanzaste de etapa!`,
    message: `Completaste la etapa "${stageLabel}" de "${account.name}"${
      nextStage ? `. Ahora vas por "${nextStage.stageLabel}"` : ' — ruta completada 🎉'
    }`,
    nextLabel: nextStage?.stageLabel ?? null,
    balance: analysis.stats.currentBalance,
    target: nextStage && nextStage.targetBalance > 0 ? nextStage.targetBalance : null,
  }
}

