import { useEffect, useRef, useState } from 'react'
import { Account } from '../lib/types'
import { AccountAnalysis } from '../lib/engine'
import { useData } from '../contexts/DataContext'

// Avance automático de etapas. Solo aplica a programas automáticos
// (Fondeo de Futuros y Fondeo CFD). Axi Select es manual: el usuario
// controla cuándo cambiar de etapa, así que aquí nunca se fuerza.
export function useStageAutoAdvance(account: Account | null, analysis: AccountAnalysis | null) {
  const { updateAccount } = useData()
  const [celebrated, setCelebrated] = useState<ReturnType<typeof toCelebration> | null>(null)
  const advancing = useRef(false)

  useEffect(() => {
    if (!account || !analysis || advancing.current) return
    // Axi Select es manual → no se auto-avanza.
    if (account.type === 'axi') return

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

