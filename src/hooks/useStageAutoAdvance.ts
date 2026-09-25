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

    // Programas con reset de capital/estadísticas por fase: Axi Select, Fondeo
    // Futuros y Fondeo CFD. En ellos el motor ya cuenta solo los trades desde la
    // fecha de inicio de la fase, así que el P&L de la fase arranca en 0 igual
    // que su punto de partida (`stage_start_pnl`).
    //
    // Fondeo CFD se sumó a este grupo porque sus fases (Fase 1 → Fase 2 →
    // Fondeada) tienen objetivos en $ igual que Futuros: sin el reset, la Fase 2
    // arrancaba con el balance y las estadísticas acumuladas de la Fase 1
    // (mostraba su balance final en lugar de 0 de progreso).
    const hasPhaseReset =
      account.rules.type === 'axi' ||
      account.rules.type === 'futures' ||
      account.rules.type === 'cfd'
    let updated: Account = {
      ...account,
      current_stage_index: nextIndex,
      // Punto de partida de la etapa. En los programas con reset por fase
      // (Axi Select, Fondeo Futuros y Fondeo CFD) la nueva fase arranca en 0, así
      // que se reinicia. En CFD esto además alimenta la fila «En esta etapa» de la
      // UI (`totalPnl - stage_start_pnl`): si no se reiniciara, esa fila arrastraría
      // el P&L de las fases anteriores y mostraría un importe que no corresponde a
      // la fase activa (p. ej. el P&L total acumulado en la etapa «Fondeada»).
      stage_start_pnl: hasPhaseReset ? 0 : analysis.stats.totalPnl,
    }
    // Reset de capital y estadísticas al pasar de fase (sin perder los trades ya
    // registrados): se guarda el resumen de la fase cerrada en `stage_history` y
    // se reinician los puntos de partida para que la nueva fase arranque en cero.
    //
    // `phasePnl` debe ser el P&L DE LA FASE QUE SE CIERRA, no el de toda la
    // cuenta. En los programas con reset por fase (Axi Select, Fondeo Futuros y
    // Fondeo CFD) el motor YA filtra por fecha de inicio de la fase, así que
    // `analysis.stats.totalPnl` es exactamente el P&L de la fase: no hay que
    // descontar nada. Restar lo archivado aquí era un error que dejaba el P&L de
    // la fase en negativo y obligaba a completar de nuevo los objetivos ya
    // cumplidos (la Fase 2 parecía retroceder a ~0).
    //
    // Sin reset por fase (cuentas de capital propio) el P&L de la etapa se mide
    // desde su punto de partida (`stage_start_pnl`).
    const phasePnl = hasPhaseReset
      ? analysis.stats.totalPnl
      : analysis.stats.totalPnl - (account.stage_start_pnl ?? 0)
    const stageNet = Math.round(phasePnl * 100) / 100
    const stageStartDate =
      account.rules.type === 'axi' || account.rules.type === 'futures' || account.rules.type === 'cfd'
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
    } else if (account.rules.type === 'cfd') {
      // Fondeo CFD: las fases (Fase 1 → Fase 2 → Fondeada) tienen objetivo en $
      // igual que Fondeo Futuros, así que al cerrar una fase también se archiva
      // su resumen y la siguiente arranca con capital y estadísticas en cero.
      // Sin esto, la Fase 2 heredaba el balance y las estadísticas de la Fase 1.
      // La fecha de inicio de la nueva fase es la que filtra el motor: los
      // trades de la fase cerrada dejan de contar en la fase activa (quedan
      // resumidos en el historial, no se pierden).
      const history = [
        ...(account.rules.stage_history ?? []),
        {
          stageLabel: pendingAdvance.stageLabel,
          // La fase que se cierra es la que estaba ACTIVA, es decir la anterior a
          // la nueva: `nextIndex - 1`. En Fondeo CFD, sin embargo, al avanzar a la
          // fase N el índice nuevo ya es N-1, así que usar `nextIndex - 1` para el
          // CFD archivaba la entrada con el índice de la fase a la que se ACABA de
          // llegar (avanzar a «Fase 2» archivaba «Fase 2»). Esa entrada fantasma
          // marcaba la fase nueva como completada y, con dos fases, empujaba la
          // cuenta hasta «Fondeada». La fase cerrada es la de índice
          // `account.current_stage_index` (la activa antes del avance).
          stageIndex: account.current_stage_index,
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
      // La nueva fase conserva el balance real con el que se cerró la anterior:
      // en una prop firm CFD las fases se superan manteniendo el balance, y el
      // capital no se repone (sería un depósito gratuito por fase). Lo que se
      // reinicia es el punto de partida de las estadísticas de la fase.
      const balAtClose = analysis.stats.currentBalance
      const fundedNow = nextIndex >= account.rules.phases.length
      updated = {
        ...updated,
        status: fundedNow ? 'funded' : 'evaluation',
        rules: {
          ...account.rules,
          stage_history: history,
          current_stage_start_date: nextStartIso,
          current_stage_balance: balAtClose,
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


