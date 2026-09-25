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
  // Índice de fase al que se acaba de avanzar (para no encadenar avances).
  const justAdvanced = useRef<number | null>(null)

  useEffect(() => {
    if (!account || !analysis || pendingAdvance || advancing.current) return
    // Tras confirmar un avance, el índice de fase cambia pero el `analysis` que
    // llega en ese render todavía es el anterior y puede seguir marcando la fase
    // recién cerrada (o la nueva) como lista. `justAdvanced` guarda el índice al
    // que se acaba de avanzar para no encadenar dos avances seguidos
    // (Evaluación → Colchón → Fondeo sin pararse en Colchón).
    if (justAdvanced.current === account.current_stage_index) return
    const pending = analysis.stages.find((s) => s.needsAdvance && !s.isComplete)
    if (!pending) return
    // La fase que pide avanzar debe ser la fase ACTIVA: si el motor señala otra
    // (análisis desincronizado del índice guardado), no se avanza.
    if (pending.stageIndex !== account.current_stage_index) return
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

    // Programas con reset de capital/estadísticas por fase: Axi Select y Fondeo
    // Futuros. En ellos el motor ya cuenta solo los trades desde la fecha de
    // inicio de la fase, así que el P&L de la fase arranca en 0 igual que su
    // punto de partida (`stage_start_pnl`). En CFD (sin reset) el P&L sigue
    // siendo acumulado y el punto de partida se desplaza al acumulado actual.
    const hasPhaseReset =
      account.rules.type === 'axi' || account.rules.type === 'futures'
    let updated: Account = {
      ...account,
      current_stage_index: nextIndex,
      stage_start_pnl: hasPhaseReset ? 0 : analysis.stats.totalPnl,
    }
    // Reset de capital y estadísticas al pasar de fase (sin perder los trades ya
    // registrados): se guarda el resumen de la fase cerrada en `stage_history` y
    // se reinician los puntos de partida para que la nueva fase arranque en cero.
    //
    // `phasePnl` debe ser el P&L DE LA FASE QUE SE CIERRA, no el de toda la
    // cuenta. Con reset por fase (`hasPhaseReset`) el motor ya filtra por fecha,
    // pero cuando la fase se cierra con datos antiguos o el historial aún no
    // refleja el P&L consumido, `analysis.stats.totalPnl` puede incluir fases
    // anteriores. Se descuenta lo ya archivado en `stage_history` para que:
    //   1. el `netPnl` guardado corresponda solo a la fase cerrada, y
    //   2. la fase SIGUIENTE arranque con 0 de P&L y no dispare un segundo
    //      avance automático (era la causa de saltar Evaluación → Colchón →
    //      Fondeo sin pararse en Colchón).
    const alreadyArchived = (account.rules.stage_history ?? []).reduce(
      (s, h) => s + (h.netPnl ?? 0),
      0,
    )
    const phasePnl = hasPhaseReset
      ? analysis.stats.totalPnl - alreadyArchived
      : analysis.stats.totalPnl - (account.stage_start_pnl ?? 0)
    const stageNet = Math.round(phasePnl * 100) / 100
    const stageStartDate = account.rules.type === 'axi' || account.rules.type === 'futures'
      ? account.rules.current_stage_start_date ?? account.start_date
      : account.start_date
    if (account.rules.type === 'axi') {
      const stages = account.rules.stages.map((st, i) => {
        if (i < nextIndex) return { ...st, status: 'completed' as const }
        if (i === nextIndex) return { ...st, status: 'current' as const }
        return { ...st, status: 'pending' as const }
      })
      const prevStage = account.rules.stages[pendingAdvance.nextIndex - 1]
      const history = [
        ...(account.rules.stage_history ?? []),
        {
          stageLabel: pendingAdvance.stageLabel,
          minEquity: prevStage?.minEquity ?? 0,
          startBalance: Math.round(account.rules.current_stage_balance ?? account.initial_balance),
          endBalance: Math.round(analysis.stats.currentBalance),
          netPnl: stageNet,
          trades: analysis.stats.totalTrades,
          winRate: analysis.stats.winRate,
          profitFactor: analysis.stats.profitFactor,
          capitalAdded: 0,
          startDate: stageStartDate,
          endDate: endIso,
        },
      ]
      updated.rules = {
        ...account.rules,
        stages,
        stage_history: history,
        current_stage_start_date: nextStartIso,
        // La nueva fase arranca con el capital inicial del programa (la cuenta se
        // "repone"), no con el balance con el que cerró la fase anterior.
        current_stage_balance: account.initial_balance,
        // Capital base del programa: se sella con el valor vigente ANTES de
        // reponer, para que los porcentajes de objetivo no cambien de fase en fase.
        program_base_balance: account.rules.program_base_balance ?? account.initial_balance,
      }
    } else if (account.rules.type === 'futures') {
      // Fondeo Futuros: igual que Axi, se archiva la fase cerrada (Evaluación o
      // Colchón) y se marca el nuevo balance de entrada para que capital y
      // estadísticas se reinicien en la siguiente fase (Fondeo incluido).
      const history = [
        ...(account.rules.stage_history ?? []),
        {
          stageLabel: pendingAdvance.stageLabel,
          stageIndex: pendingAdvance.nextIndex - 1,
          startBalance: Math.round(account.rules.current_stage_balance ?? account.initial_balance),
          endBalance: Math.round(analysis.stats.currentBalance),
          netPnl: stageNet,
          trades: analysis.stats.totalTrades,
          winRate: analysis.stats.winRate,
          profitFactor: analysis.stats.profitFactor,
          startDate: stageStartDate,
          endDate: endIso,
        },
      ]
      const status: Account['status'] =
        nextIndex >= 2 ? 'funded' : nextIndex === 1 ? 'cushion' : 'evaluation'
      updated = {
        ...updated,
        status,
        rules: {
          ...account.rules,
          stage_history: history,
          current_stage_start_date: nextStartIso,
          // La nueva fase arranca con el capital inicial (la cuenta se "repone");
          // el resultado de la fase cerrada queda archivado en el historial.
          current_stage_balance: account.initial_balance,
          // Capital base del programa: se sella con el valor vigente ANTES de
          // reponer (el de la fase que se cierra), que es el capital original del
          // programa. Los porcentajes de objetivo se calculan sobre él, así que
          // no debe seguir al balance de entrada de cada fase.
          program_base_balance: account.rules.program_base_balance ?? account.initial_balance,
        },
      }
    }

    setPendingAdvance(null)
    // Se recuerda el índice al que se avanzó: mientras el `analysis` siga siendo
    // el del render anterior, no debe dispararse otro avance encadenado.
    justAdvanced.current = nextIndex
    setTimeout(() => {
      justAdvanced.current = null
    }, 1500)
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


