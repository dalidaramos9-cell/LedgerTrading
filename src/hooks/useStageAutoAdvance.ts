import { useEffect, useRef, useState } from 'react'
import { Account } from '../lib/types'
import { AccountAnalysis } from '../lib/engine'
import { useData } from '../contexts/DataContext'

// Datos del avance pendiente: la etapa actual ya cumplió su objetivo, pero el
// usuario debe confirmar las fechas (finalización de la etapa actual e inicio
// de la siguiente) para cerrar el rango sin solapar trades.
export interface PendingAdvance {
  stageLabel: string
  nextLabel: string | null
  nextIndex: number
  suggestedEndDate: string // "YYYY-MM-DD"
  suggestedNextStartDate: string // "YYYY-MM-DD"
}

// Avance de etapas con confirmación de fechas. Cuando una etapa cumple su
// objetivo, NO avanza sola: expone un "pendingAdvance" para que la UI pida
// la fecha de finalización de la etapa actual y la de inicio de la siguiente.
export function useStageAutoAdvance(account: Account | null, analysis: AccountAnalysis | null) {
  const { updateAccount } = useData()
  const [celebrated, setCelebrated] = useState<ReturnType<typeof toCelebration> | null>(null)
  const [pendingAdvance, setPendingAdvance] = useState<PendingAdvance | null>(null)
  const advancing = useRef(false)

  useEffect(() => {
    if (!account || !analysis || pendingAdvance || advancing.current) return
    const pending = analysis.stages.find((s) => s.needsAdvance && !s.isComplete)
    if (!pending) return
    // No avanzamos aún: pedimos las fechas de finalización/inicio.
    advancing.current = true
    const nextAdvance = analysis.stages[pending.stageIndex + 1]
    const endDate = new Date()
    const nextStart = new Date()
    nextStart.setDate(endDate.getDate() + 1)
    setPendingAdvance({
      stageLabel: pending.stageLabel,
      nextLabel: nextAdvance?.stageLabel ?? null,
      nextIndex: pending.stageIndex + 1,
      suggestedEndDate: toDateStr(endDate),
      suggestedNextStartDate: toDateStr(nextStart),
    })
    setTimeout(() => {
      advancing.current = false
    }, 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, analysis, pendingAdvance])

  // Confirma el avance con las fechas elegidas por el usuario.
  async function confirmAdvance(endDateStr: string, nextStartDateStr: string) {
    if (!account || !analysis || !pendingAdvance) return
    const { nextIndex } = pendingAdvance
    const endIso = new Date(endDateStr + 'T12:00:00').toISOString()
    const nextStartIso = new Date(nextStartDateStr + 'T12:00:00').toISOString()

    const updated: Account = {
      ...account,
      current_stage_index: nextIndex,
      stage_start_pnl: analysis.stats.totalPnl,
    }
    if (account.rules.type === 'axi') {
      const stages = account.rules.stages.map((st, i) => {
        if (i < nextIndex) return { ...st, status: 'completed' as const }
        if (i === nextIndex) return { ...st, status: 'current' as const }
        return { ...st, status: 'pending' as const }
      })
      const prevStage = account.rules.stages[pendingAdvance.nextIndex - 1]
      const netPnl = Math.round((analysis.stats.totalPnl - (account.stage_start_pnl ?? 0)) * 100) / 100
      const history = [
        ...(account.rules.stage_history ?? []),
        {
          stageLabel: pendingAdvance.stageLabel,
          minEquity: prevStage?.minEquity ?? 0,
          startBalance: Math.round(account.rules.current_stage_balance ?? account.initial_balance),
          endBalance: Math.round(analysis.stats.currentBalance),
          netPnl,
          trades: analysis.stats.totalTrades,
          winRate: analysis.stats.winRate,
          profitFactor: analysis.stats.profitFactor,
          capitalAdded: 0,
          startDate: account.rules.current_stage_start_date ?? account.start_date,
          endDate: endIso,
        },
      ]
      updated.rules = {
        ...account.rules,
        stages,
        stage_history: history,
        current_stage_start_date: nextStartIso,
        current_stage_balance: analysis.stats.currentBalance,
      }
    }

    setPendingAdvance(null)
    setCelebrated(toCelebration(pendingAdvance.stageLabel, nextIndex, account, analysis))
    try {
      await updateAccount(updated)
    } catch {
      /* si falla, el estado de la cuenta no cambió; se reintenta */
    }
  }

  function cancelAdvance() {
    setPendingAdvance(null)
  }

  return {
    celebrated,
    pendingAdvance,
    confirmAdvance,
    cancelAdvance,
    dismiss: () => setCelebrated(null),
  }
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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


