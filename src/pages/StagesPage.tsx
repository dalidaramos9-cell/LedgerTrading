import { useEffect, useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { useActivePhase } from '../contexts/ActivePhaseContext'
import { analyzeAccount } from '../lib/engine'
import { AxiStageHistory, Account } from '../lib/types'
import { money, signedMoney, isoDate, shortDate } from '../lib/fmt'
import { useStageAutoAdvance } from '../hooks/useStageAutoAdvance'
import CelebrationModal from '../components/CelebrationModal'
import { Badge, ProgressBar, EmptyState, Button, Modal, Field } from '../components/ui'

// Pestaña "Etapas": muestra el estado de las reglas del programa (en dólares)
// y el progreso de las etapas de la cuenta activa.
export default function StagesPage() {
  const account = useRouteAccount()
  const { trades, payouts, updateAccount } = useData()
  const { activePhase, selectCurrent, selectHistory, tradesForActive } = useActivePhase()
  const [capitalOpen, setCapitalOpen] = useState(false)
  const [capitalAmount, setCapitalAmount] = useState('')

  const analysis = useMemo(() => {
    if (!account) return null
    return analyzeAccount(
      account,
      trades.filter((t) => t.account_id === account.id),
      payouts.filter((p) => p.account_id === account.id),
    )
  }, [account, trades, payouts])

  // Estadísticas de la fase activa seleccionada (para ver los datos de esa fase).
  // En una fase PASADA se desactiva el reset por fase (`scope: 'full'`) y se
  // parte del balance con el que esa fase arrancó, para reproducir los datos
  // guardados en `stage_history`.
  const phaseAnalysis = useMemo(() => {
    if (!account) return null
    const viewingHistory = activePhase?.kind === 'history'
    const histEntry =
      viewingHistory && (account.rules.type === 'axi' || account.rules.type === 'futures')
        ? (account.rules.stage_history ?? []).find((h) => h.stageLabel === activePhase.label) ?? null
        : null
    const baseAccount =
      histEntry != null
        ? { ...account, initial_balance: histEntry.startBalance }
        : account
    return analyzeAccount(
      baseAccount,
      tradesForActive(trades.filter((t) => t.account_id === account.id)),
      payouts.filter((p) => p.account_id === account.id),
      { scope: viewingHistory ? 'full' : 'auto' },
    )
  }, [account, trades, payouts, tradesForActive, activePhase])

  const { celebrated, dismiss, pendingAdvance, confirmAdvance, cancelAdvance } = useStageAutoAdvance(account, analysis)
  const [advanceEndDate, setAdvanceEndDate] = useState('')
  const [advanceNextStartDate, setAdvanceNextStartDate] = useState('')

  // Al detectar el avance, pre-llenar el formulario con las fechas sugeridas
  // (hoy para el fin, y mañana para el inicio de la siguiente etapa).
  useEffect(() => {
    if (pendingAdvance) {
      setAdvanceEndDate(pendingAdvance.suggestedEndDate)
      setAdvanceNextStartDate(pendingAdvance.suggestedNextStartDate)
    }
  }, [pendingAdvance])

  if (!account || !analysis) {
    return (
      <EmptyState icon="🗺️" title="Sin cuenta seleccionada">
        Elige una cuenta de la barra lateral para ver sus reglas y etapas.
      </EmptyState>
    )
  }

  // Monto de capital recomendado para la fase actual.
  // Se busca que el balance llegue a: mínimo de la fase + pérdida máx permitida,
  // para que aunque se asuma la pérdida máxima, el balance no baje del mínimo.
  const currentStage = account.rules.type === 'axi' ? account.rules.stages[account.current_stage_index] : null
  const minEquity = currentStage?.minEquity ?? 0
  const maxLossPct = currentStage?.maxLossPct ?? 0
  const balanceNow = analysis.stats.currentBalance
  const capitalTarget = minEquity + (minEquity * maxLossPct) / 100
  const suggestedCapital = capitalTarget > 0 ? Math.max(0, capitalTarget - balanceNow) : 0
  // Acceso tipado a los datos de capital e historial de Axi.
  const axiCapital =
    account.type === 'axi' && account.rules.type === 'axi'
      ? account.rules.stage_capital_total ?? 0
      : 0
  // Historial de fases completadas (Axi Select y Fondeo Futuros).
  const stageHistory =
    account.rules.type === 'axi' || account.rules.type === 'futures'
      ? account.rules.stage_history ?? []
      : []
  const isAxiAccount = account.type === 'axi' && account.rules.type === 'axi'
  const isFuturesAccount = account.rules.type === 'futures'
  // Con el reset por fase, las estadísticas de la fase actual ya vienen
  // normalizadas (solo la fase activa + balance de entrada de la fase).
  const currentStats = phaseAnalysis ?? analysis
  const currentBetaLabel = isFuturesAccount
    ? 'Balance de la fase'
    : 'Balance actual'
  const currentBetaValue = isFuturesAccount
    ? currentStats.stats.currentBalance
    : balanceNow + axiCapital
  // Fecha de inicio de la fase actual (para mostrarla y permitir editarla).
  const phaseStartDate =
    account.rules.type !== 'cfd' && account.rules.current_stage_start_date
      ? isoDate(new Date(account.rules.current_stage_start_date))
      : isoDate(new Date(account.start_date))
  const canEditStartDate = isAxiAccount || isFuturesAccount

  // ¿Hay datos de la fase que estén mal y se puedan corregir? Se comprueba si el
  // balance de entrada difiere del capital inicial (avance con el balance final)
  // o si hay trades ANTIGUOS (con fecha anterior al inicio de la fase) que en
  // realidad pertenecen a una fase previa. En ambos casos se ofrece la corrección.
  const phaseNeedsFix = (() => {
    if (!account || !canEditStartDate) return false
    if (account.rules.type !== 'axi' && account.rules.type !== 'futures') return false
    if ((account.rules.current_stage_balance ?? account.initial_balance) !== account.initial_balance) {
      return true
    }
    const startKey = (account.rules.current_stage_start_date ?? account.start_date).slice(0, 10)
    if (trades.some((t) => t.account_id === account.id && t.date.slice(0, 10) < startKey)) {
      return true
    }
    // Historial "fantasma": entradas que corresponden a la fase actual o a fases
    // posteriores. Hacen que Progreso de etapas marque como completadas fases que
    // todavía están activas.
    const idx = account.current_stage_index
    const phantom = (account.rules.stage_history ?? []).some((h) => {
      const hIdx = typeof h.stageIndex === 'number' ? h.stageIndex : stageLabelIndex(account, h.stageLabel)
      return hIdx < 0 || hIdx >= idx
    })
    if (phantom) return true
    // Doble avance: hay una fase archivada heredando el P&L de la anterior, así
    // que la cuenta quedó en una fase que nunca se completó y debe retroceder.
    return correctedStageIndex(account) < account.current_stage_index
  })()

  async function addCapital() {
    // Si no se escribió un monto, se aplica el recomendado (mínimo + pérdida máx).
    const amt = capitalAmount.trim() !== '' ? parseFloat(capitalAmount) : suggestedCapital
    if (!account || Number.isNaN(amt) || amt <= 0) return
    if (!(account.rules.type === 'axi')) return
    const updated = {
      ...account,
      rules: {
        ...account.rules,
        stage_capital_total: (account.rules.stage_capital_total ?? 0) + amt,
        current_stage_balance:
          (account.rules.current_stage_balance ?? account.initial_balance) + amt,
      },
    }
    try {
      await updateAccount(updated)
      setCapitalOpen(false)
      setCapitalAmount('')
    } catch {
      /* ignorar */
    }
  }

  // Repone el capital de entrada de la fase activa al capital inicial de la
  // cuenta. Se usa para corregir cuentas que avanzaron de fase con el balance
  // final de la fase anterior (o para reaplicar el reset a mano).
  // Índice de una fase a partir de su etiqueta, para poder sanear el historial
  // cuando las entradas antiguas no guardaban `stageIndex`.
  function stageLabelIndex(acc: Account, label: string): number {
    const r = acc.rules
    if (r.type === 'futures') {
      const labels = ['Evaluación', 'Colchón', 'Fondeo']
      return labels.indexOf(label)
    }
    if (r.type === 'axi') {
      return r.stages.findIndex((s) => s.label === label)
    }
    return -1
  }

  // Una fase archivada en el historial está "sospechosa" si su P&L es igual al
  // de la fase anterior: significa que se archivó arrastrando el mismo P&L (el
  // doble avance que saltaba Evaluación → Colchón → Fondeo), no porque se
  // hubiera operado y completado. Devuelve el índice de la PRIMERA fase
  // sospechosa, o -1 si todas son legítimas.
  function firstSuspiciousHistoryIndex(acc: Account): number {
    const hist = (acc.rules.type === 'axi' || acc.rules.type === 'futures'
      ? acc.rules.stage_history
      : []) ?? []
    const ordered = hist
      .map((h) => ({
        idx: typeof h.stageIndex === 'number' ? h.stageIndex : stageLabelIndex(acc, h.stageLabel),
        net: Math.round((h.netPnl ?? 0) * 100) / 100,
        start: (h.startDate ?? '').slice(0, 10),
        end: (h.endDate ?? '').slice(0, 10),
      }))
      .sort((a, b) => a.idx - b.idx)
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1]
      const cur = ordered[i]
      // Mismo P&L neto y fechas de fase solapadas/nulas: la fase no aportó nada
      // propio, se archivó con el P&L heredado de la anterior.
      const sameNet = prev.net === cur.net
      const emptyRange = cur.start === '' || cur.end === '' || cur.start >= cur.end
      if (sameNet && (emptyRange || cur.start <= prev.end)) return cur.idx
    }
    return -1
  }

  // Índice al que debería estar la cuenta: el de la fase ANTES de la primera
  // fase archivada de forma ilegítima. Si no hay anomalías, el índice actual.
  function correctedStageIndex(acc: Account): number {
    const bad = firstSuspiciousHistoryIndex(acc)
    return bad > 0 && bad <= acc.current_stage_index ? bad : acc.current_stage_index
  }

  // Repone el balance de entrada de la fase al capital inicial del programa.
  // Útil cuando la cuenta avanzó de fase con el reset antiguo (que guardó el
  // balance final de la fase anterior en lugar del capital inicial).
  async function restorePhaseCapital() {
    if (!account) return
    if (account.rules.type !== 'axi' && account.rules.type !== 'futures') return
    const updated = {
      ...account,
      rules: {
        ...account.rules,
        current_stage_balance: account.initial_balance,
      },
    }
    try {
      await updateAccount(updated)
    } catch {
      /* ignorar */
    }
  }

  // Corrección completa de la fase activa: repone el capital de entrada al
  // capital inicial y reajusta la fecha de inicio de la fase para que quede
  // DESPUÉS del último trade de la fase anterior. Sin esto, reponer el balance
  // no basta: los trades registrados antes del avance pero con fecha posterior
  // al inicio de la fase seguirían contando en las estadísticas de la fase nueva.
  //
  // Además SANEA el historial de fases: descarta entradas duplicadas o
  // posteriores/iguales a la fase actual (que hacían que la sección de Progreso
  // de etapas marcara como completadas fases que seguían activas).
  async function fixPhaseData() {
    if (!account) return
    if (account.rules.type !== 'axi' && account.rules.type !== 'futures') return
    // Índice corregido: si el historial delata un doble avance (una fase se
    // archivó heredando el P&L de la anterior), la cuenta debe VOLVER a esa fase
    // en lugar de quedarse en una posterior que nunca se completó.
    const correctedIdx = correctedStageIndex(account)
    const idx = correctedIdx
    const history = account.rules.stage_history ?? []
    // Fases ya completadas de verdad: solo las ANTERIORES a la fase actual.
    // Cualquier entrada con índice >= al actual es un fantasma (creado por un
    // avance previo defectuoso) y se elimina para no marcar fases como
    // completadas cuando todavía no lo están.
    const cleanHistory = history.filter((h) => {
      const hIdx =
        typeof h.stageIndex === 'number'
          ? h.stageIndex
          : stageLabelIndex(account, h.stageLabel)
      return hIdx >= 0 && hIdx < idx
    })
    const lastEnd = cleanHistory.reduce<string | null>(
      (acc, h) => (h.endDate && (acc == null || h.endDate > acc) ? h.endDate : acc),
      null,
    )
    // Trades de la cuenta ordenados por fecha (los anteriores al inicio actual
    // pertenecen a fases ya archivadas).
    const accountTrades = trades
      .filter((t) => t.account_id === account.id)
      .sort((a, b) => a.date.localeCompare(b.date))
    const currentStartKey = (account.rules.current_stage_start_date ?? account.start_date).slice(0, 10)
    // Trades con fecha ANTERIOR al inicio de la fase actual: pertenecen a las
    // fases previas y deben quedar excluidos (no se borran, se conservan).
    const beforePhase = accountTrades.filter((t) => t.date.slice(0, 10) < currentStartKey)
    const lastBefore = beforePhase.length > 0 ? beforePhase[beforePhase.length - 1].date : null
    // Nueva fecha de inicio: el día siguiente al último trade previo a la fase.
    // Si no hay trades previos, se conserva la fecha actual.
    let nextStart = account.rules.current_stage_start_date ?? account.start_date
    if (lastBefore) {
      const d = new Date(lastBefore.slice(0, 10) + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      nextStart = d.toISOString()
    } else if (lastEnd) {
      const d = new Date(lastEnd.slice(0, 10) + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      if (d.toISOString() > nextStart) nextStart = d.toISOString()
    }
    const updated = {
      ...account,
      // Reversión del doble avance: si el historial delata que una fase se cerró
      // sin completarse, la cuenta vuelve a ESA fase (y su estado de programa).
      current_stage_index: idx,
      status:
        account.rules.type === 'futures'
          ? idx >= 2
            ? ('funded' as const)
            : idx === 1
              ? ('cushion' as const)
              : ('evaluation' as const)
          : account.status,
      stage_start_pnl: 0,
      rules: {
        ...account.rules,
        current_stage_balance: account.initial_balance,
        current_stage_start_date: nextStart,
        stage_history: cleanHistory,
        // Capital base del programa: se sella aquí (solo la primera vez) con el
        // valor vigente, para que los porcentajes de objetivo se calculen sobre
        // el capital original del programa y no sobre el balance de la fase.
        program_base_balance: account.rules.program_base_balance ?? account.initial_balance,
      },
    }
    try {
      await updateAccount(updated)
    } catch {
      /* ignorar */
    }
  }

  // Guarda la fecha de inicio manual de la fase actual (para poder registrar
  // operaciones del pasado si la cuenta ya venía en una etapa avanzada).
  // Aplica a Axi Select y Fondeo Futuros (programas con reset por fase).
  async function setPhaseStartDate(newDate: string) {
    if (!account || !newDate) return
    if (account.rules.type !== 'axi' && account.rules.type !== 'futures') return
    const updated = {
      ...account,
      rules: {
        ...account.rules,
        current_stage_start_date: new Date(newDate + 'T12:00:00').toISOString(),
      },
    }
    try {
      await updateAccount(updated)
    } catch {
      /* ignorar */
    }
  }

  return (
    <div className="stack">
      <RuleStatusUSD account={account} />

      {phaseAnalysis ? (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">
              {activePhase && activePhase.kind === 'history'
                ? `Estadísticas de la fase «${activePhase.label}»`
                : 'Estadísticas de la fase actual'}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
            {activePhase?.kind === 'history'
              ? 'Datos guardados de esa fase (conservados al pasar de etapa).'
              : 'Capital y estadísticas de la fase actual: se reinician al pasar de etapa, sin perder los trades anteriores.'}
          </p>
          <div className="stat-grid">
            <Mini
              label={activePhase?.kind === 'history' ? 'Balance (fase)' : currentBetaLabel}
              value={money(
                activePhase?.kind === 'history' ? currentStats.stats.currentBalance : currentBetaValue,
              )}
            />
            <Mini label="P&L" value={signedMoney(currentStats.stats.totalPnl)} pos={currentStats.stats.totalPnl > 0} />
            <Mini label="Operaciones" value={String(currentStats.stats.totalTrades)} />
            <Mini label="Win rate" value={`${currentStats.stats.winRate.toFixed(1)}%`} />
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Progreso de etapas</span>
        </div>
        {analysis.stages.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Esta cuenta no tiene etapas definidas.
          </p>
        ) : (
          <div>
            {analysis.stages.map((stage) => {
              // `stage.isComplete` es la única fuente de verdad de "completada".
              // `needsAdvance` solo significa "objetivo cumplido, se puede avanzar":
              // sumarlo aquí marcaba la fase ACTUAL como completada y descolocaba
              // la sección de Progreso de etapas.
              const completed = stage.isComplete
              const isCurrentStage = stage.stageIndex === account.current_stage_index
              // Registro del historial de fases completadas (Axi Select o
              // Fondeo Futuros) que corresponde a esta etapa (para sus fechas y
              // para poder volver a verla seleccionándola).
              const histMatch = isCurrentStage
                ? null
                : stageHistory.find((h) => h.stageLabel === stage.stageLabel) ?? null
              // En la vista se está mostrando la fase actual cuando activePhase es null.
              const isViewingCurrent = isCurrentStage && (activePhase === null || activePhase.kind === 'current')
              const isViewingThis = isCurrentStage
                ? isViewingCurrent
                : activePhase?.kind === 'history' && activePhase.label === stage.stageLabel
              return (
                <div
                  className="stage-row"
                  key={stage.stageIndex}
                  onClick={
                    isCurrentStage
                      ? () => selectCurrent()
                      : histMatch
                        ? () => selectHistory(histMatch)
                        : undefined
                  }
                  style={{
                    cursor: isCurrentStage || histMatch ? 'pointer' : undefined,
                    background: isViewingThis ? 'var(--accent-soft)' : undefined,
                    borderRadius: 8,
                  }}
                >
                  <div className={`stage-ring ${completed ? 'ok' : ''}`}>
                    {stage.isComplete ? '✓' : stage.stageIndex + 1}
                  </div>
                  <div className="stage-meta">
                    <div className="stage-label">
                      {stage.stageLabel}
                      {stage.needsAdvance ? (
                        <Badge tone="green">¡Listo! (objetivo cumplido)</Badge>
                      ) : stage.isComplete ? (
                        <Badge tone="green">Completada</Badge>
                      ) : (
                        <Badge tone="blue">Fase actual · en vista</Badge>
                      )}
                    </div>
                    <ProgressBar
                      value={stage.progressPct}
                      tone={completed ? 'success' : stage.progressPct >= 80 ? 'warning' : 'auto'}
                    />
                    <div className="stage-stat-row">
                      <span>{montoStage(account, stage, analysis.stats.totalPnl)}</span>
                      <span>
                        {stage.targetBalance > 0
                          ? `Objetivo ${money(stage.targetBalance)}`
                          : stage.stageLabel === 'Fondeo' && stage.stageIndex === account.current_stage_index
                            ? 'Cuenta fondeada'
                            : '—'}
                      </span>
                    </div>
                    {stageDetail(account, stage) ? (
                      <div className="stage-stat-row">
                        <span className="muted">{stageDetail(account, stage)}</span>
                      </div>
                    ) : null}
                    {histMatch ? (
                      <div className="stage-stat-row">
                        <span className="muted">
                          {shortDate(histMatch.startDate)} → {shortDate(histMatch.endDate)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {isFuturesAccount ? (
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Capital de la fase (Fondeo Futuros)</span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
            Al pasar de fase (Evaluación → Colchón → Fondeo) el capital y las estadísticas se reinician:
            la nueva fase arranca en el balance de entrada y solo cuenta los trades de esa fase. Los
            trades anteriores se conservan en el historial.
          </p>
          <div className="stage-stat-row">
            <span>Balance de entrada de la fase</span>
            <strong style={{ color: 'var(--text-muted)' }}>
              {money(
                (isFuturesAccount
                  ? account.rules.current_stage_balance
                  : undefined) ?? account.initial_balance,
              )}
            </strong>
          </div>
          <div className="stage-stat-row" style={{ marginTop: 6 }}>
            <span>Balance de la fase (entrada + P&L)</span>
            <strong>{money(analysis.stats.currentBalance)}</strong>
          </div>
          {isFuturesAccount && account.current_stage_index > 0 && phaseNeedsFix ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(account.rules.current_stage_balance ?? account.initial_balance) !==
                account.initial_balance ? (
                  <Button variant="subtle" onClick={restorePhaseCapital}>
                    Reponer al capital inicial ({money(account.initial_balance)})
                  </Button>
                ) : null}
                <Button variant="subtle" onClick={fixPhaseData}>
                  Corregir fase (balance + excluir operaciones anteriores)
                </Button>
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
                Se detectaron datos de la fase que no cuadran (balance de entrada, operaciones de
                fases anteriores o historial). Usa la corrección para ajustarlos.
              </p>
            </div>
          ) : null}
          {canEditStartDate ? (
            <div style={{ marginTop: 12 }}>
              <Field label="Fecha de inicio de la fase actual (permite registrar operaciones del pasado)">
                <input
                  type="date"
                  className="input"
                  value={phaseStartDate}
                  onChange={(e) => setPhaseStartDate(e.target.value)}
                />
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}

      {isAxiAccount ? (
        <>
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Capital de la cuenta</span>
            </div>
            <Field label="Fecha de inicio de la fase actual (permite registrar operaciones del pasado)">
              <input
                type="date"
                className="input"
                value={phaseStartDate}
                onChange={(e) => setPhaseStartDate(e.target.value)}
              />
            </Field>
            <div className="stage-stat-row">
              <span>Balance actual (incluye capital agregado)</span>
              <strong>{money(balanceNow + axiCapital)}</strong>
            </div>
            <div className="stage-stat-row" style={{ marginTop: 6 }}>
              <span>Balance solo trading (capital inicial + P&L)</span>
              <strong style={{ color: 'var(--text-muted)' }}>{money(balanceNow)}</strong>
            </div>
            <div className="stage-stat-row" style={{ marginTop: 6 }}>
              <span>Equity mínimo etapa actual («{currentStage?.label ?? ''}»)</span>
              <strong>{money(minEquity)}</strong>
            </div>
            <div className="stage-stat-row" style={{ marginTop: 6 }}>
              <span>Capital recomendado (mínimo + pérdida máx {maxLossPct}%)</span>
              <strong>{money(capitalTarget)}</strong>
            </div>
            <div className="stage-stat-row" style={{ marginTop: 6 }}>
              <span>Capital agregado en total</span>
              <strong style={{ color: 'var(--text-muted)' }}>{money(axiCapital)}</strong>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="primary" sm onClick={() => setCapitalOpen(true)}>
                + Agregar capital
              </Button>
              {account.current_stage_index > 0 && phaseNeedsFix ? (
                <>
                  {(account.rules.current_stage_balance ?? account.initial_balance) !==
                  account.initial_balance ? (
                    <Button variant="subtle" sm onClick={restorePhaseCapital}>
                      Reponer al capital inicial ({money(account.initial_balance)})
                    </Button>
                  ) : null}
                  <Button variant="subtle" sm onClick={fixPhaseData}>
                    {correctedStageIndex(account) < account.current_stage_index
                      ? `Corregir avance de fase (volver a ${
                          analysis.stages[correctedStageIndex(account)]?.stageLabel ?? 'la fase anterior'
                        })`
                      : 'Corregir fase (balance + excluir operaciones anteriores)'}
                  </Button>
                </>
              ) : null}
              {suggestedCapital > 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  Recomendado agregar {money(suggestedCapital)} para cubrir mínimo + pérdida máx de la etapa.
                </span>
              ) : null}
            </div>
          </div>

          {isAxiAccount && stageHistory.length > 0 ? (
            <HistoryTable
              history={stageHistory}
              activeLabel={activePhase?.kind === 'history' ? activePhase.label : null}
              onSelect={selectHistory}
              showCapital
            />
          ) : null}
        </>
      ) : null}

      {isFuturesAccount && stageHistory.length > 0 ? (
        <HistoryTable
          history={stageHistory}
          activeLabel={activePhase?.kind === 'history' ? activePhase.label : null}
          onSelect={selectHistory}
        />
      ) : null}

      <Modal open={capitalOpen} onClose={() => setCapitalOpen(false)} title="Agregar capital (Axi Select)">
        <div className="stack">
          <Field label={`Monto a agregar${suggestedCapital > 0 ? ` (recomendado: ${money(suggestedCapital)})` : ''}`}>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              placeholder={suggestedCapital > 0 ? String(Math.round(suggestedCapital * 100) / 100) : '0.00'}
              value={capitalAmount}
              onChange={(e) => setCapitalAmount(e.target.value)}
            />
          </Field>
          <Field label="Equity mínimo de la etapa actual">
            <div className="input" style={{ pointerEvents: 'none' }}>{money(minEquity)}</div>
          </Field>
          <div className="form-actions">
            <Button variant="subtle" onClick={() => setCapitalOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={addCapital}>Aplicar capital</Button>
          </div>
        </div>
      </Modal>

      {pendingAdvance ? (
        <Modal
          open
          onClose={cancelAdvance}
          title="Finalizar etapa · confirmar fechas"
        >
          <div className="stack">
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Al completar <strong>{pendingAdvance.stageLabel}</strong>, define cuándo terminó y cuándo
              arranca <strong>{pendingAdvance.nextLabel ?? 'la siguiente'}</strong> para que sus
              rangos no se solapen y cada operación caiga en una sola etapa.
            </p>
            <Field label="Fecha de finalización de la etapa actual">
              <input
                type="date"
                className="input"
                value={advanceEndDate}
                onChange={(e) => setAdvanceEndDate(e.target.value)}
              />
            </Field>
            <Field label="Fecha de inicio de la siguiente etapa">
              <input
                type="date"
                className="input"
                value={advanceNextStartDate}
                min={advanceEndDate}
                onChange={(e) => setAdvanceNextStartDate(e.target.value)}
              />
            </Field>
            <div className="form-actions">
              <Button variant="subtle" onClick={cancelAdvance}>Cancelar</Button>
              <Button
                variant="primary"
                disabled={!advanceEndDate || !advanceNextStartDate || advanceNextStartDate < advanceEndDate}
                onClick={() => confirmAdvance(advanceEndDate, advanceNextStartDate)}
              >
                Confirmar avance
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {celebrated ? <CelebrationModal data={celebrated} onClose={dismiss} /> : null}
    </div>
  )
}

// Muestra el progreso específico de cada etapa (no el balance total repetido).
function montoStage(
  account: ReturnType<typeof useRouteAccount>,
  stage: ReturnType<typeof analyzeAccount>['stages'][number],
  totalPnl: number,
): string {
  if (!account) return '-'
  const startPnl = account.stage_start_pnl ?? 0
  const stageNet = totalPnl - startPnl
  if (stage.isComplete) return 'Completada ✓'
  if (stage.stageIndex === account.current_stage_index) {
    return `En esta etapa: ${signedMoney(stageNet)}`
  }
  return money(totalPnl)
}

// Información distintiva de una etapa concreta.
// Para Axi Select muestra el fondeo asignado y el profit split de esa etapa.
function stageDetail(
  account: ReturnType<typeof useRouteAccount>,
  stage: ReturnType<typeof analyzeAccount>['stages'][number],
): string | null {
  if (!account) return null
  if (account.type === 'axi' && account.rules.type === 'axi') {
    const st = account.rules.stages[stage.stageIndex]
    if (st) return `Fondeo ${money(st.funded)} · Split ${st.profitSplit}%`
  }
  return null
}

// Panel de reglas del programa expresado en DÓLARES (monto usado vs. límite),
// con color que depende del cálculo real.
function RuleStatusUSD({ account }: { account: NonNullable<ReturnType<typeof useRouteAccount>> }) {
  const { trades, payouts, updateAccount } = useData()
  // Valor local del Edge Score actual ingresado manualmente (se persiste al
  // cambiar). Se inicializa desde la cuenta si ya existe.
  const [edgeInput, setEdgeInput] = useState<string>(
    () =>
      account.rules.type === 'axi' && account.rules.current_edge_score != null
        ? String(account.rules.current_edge_score)
        : '',
  )
  const analysis = useMemo(
    () =>
      analyzeAccount(
        account,
        trades.filter((t) => t.account_id === account.id),
        payouts.filter((p) => p.account_id === account.id),
      ),
    [account, trades, payouts],
  )
  const rules = analysis?.rules

  if (!rules || account.type === 'own') {
    return (
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Reglas del programa</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Cuenta {account.type === 'own' ? 'de capital propio' : 'sin reglas de programa'} — no aplican límites.
        </p>
      </div>
    )
  }

  const initialBalance = account.initial_balance
  // Base para los límites en $: para Axi, se usa el equity mínimo de la fase actual
  // (el drawdown se mide sobre el capital de la fase, no sobre el inicial global).
  const ddBase =
    account.rules.type === 'axi'
      ? account.rules.stages[account.current_stage_index]?.minEquity ?? initialBalance
      : initialBalance

  // Límite de pérdida diaria en $ (pérdida de hoy vs. límite en $)
  const todayPnl =
    analysis?.days.find((d) => d.date === new Date().toISOString().slice(0, 10))?.pnl ?? 0
  const dailyLimitUSD = (ddBase * rules.dailyLoss.allowedPct) / 100
  const dailyUsedUSD = Math.abs(todayPnl)
  const dailyUsedOfLimit = dailyLimitUSD > 0 ? (dailyUsedUSD / dailyLimitUSD) * 100 : 0

  // Max drawdown de la FASE ACTUAL: pérdida (en $) de la cuenta dentro de esta
  // fase, medida desde su punto de arranque. Se reinicia al pasar de fase porque
  // `stage_start_pnl` se actualiza al momento del avance (la fase arranca en 0).
  // No depende del balance de entrada ni del initial, por lo que es correcto
  // también para cuentas viejas.
  const faseStartPnl = account.stage_start_pnl ?? 0
  const faseNetPnl = (analysis?.stats.totalPnl ?? 0) - faseStartPnl
  const currentDD = Math.max(0, -faseNetPnl)
  const ddLimitUSD = (ddBase * rules.maxDrawdown.limitPct) / 100
  const ddUsedOfLimit = ddLimitUSD > 0 ? (currentDD / ddLimitUSD) * 100 : 0

  // Consistencia (solo Futuros): la regla es en %
  const isFutures = account.rules.type === 'futures'

  // ---- Axi Select: barras de días mínimos y operaciones mínimas de la fase
  // actual. Se muestran como etiquetas con progreso en el panel de reglas. ----
  const isAxi = account.rules.type === 'axi'
  const currentAxiStage =
    isAxi && account.rules.type === 'axi' ? account.rules.stages[account.current_stage_index] : null
  // Siguiente etapa (objetivo al que se quiere llegar).
  const nextAxiStage =
    isAxi && account.rules.type === 'axi'
      ? account.rules.stages[account.current_stage_index + 1] ?? null
      : null
  const axiStartStr =
    account.rules.type === 'axi'
      ? (account.rules.current_stage_start_date ?? account.start_date).slice(0, 10)
      : account.start_date.slice(0, 10)
  // Días transcurridos desde el inicio de la fase actual (el día de inicio = 1).
  const daysElapsed = (() => {
    if (!axiStartStr) return 0
    const start = new Date(axiStartStr + 'T12:00:00').getTime()
    const now = new Date().getTime()
    if (Number.isNaN(start) || now < start) return 0
    return Math.max(1, Math.floor((now - start) / 86400000) + 1)
  })()
  // Operaciones dentro de la fase actual (desde su fecha de inicio).
  const axiMinDays = currentAxiStage?.minDays ?? 0
  const axiMinTrades = currentAxiStage?.minTrades ?? 0
  const phaseTradesCount =
    axiStartStr && account.rules.type === 'axi'
      ? account.rules.stages.length > 0
        ? trades.filter(
            (t) => t.account_id === account.id && t.date.slice(0, 10) >= axiStartStr,
          ).length
        : 0
      : 0

  // Exoneraciones de requisitos (cuenta real que ya cumplió días/operaciones
  // fuera de la app y no quiere registrar todo).
  const axiDaysWaived = account.rules.type === 'axi' && !!account.rules.min_days_waived
  const axiTradesWaived = account.rules.type === 'axi' && !!account.rules.min_trades_waived
  const daysMet = axiMinDays > 0 && (daysElapsed >= axiMinDays || axiDaysWaived)
  const tradesMet = axiMinTrades > 0 && (phaseTradesCount >= axiMinTrades || axiTradesWaived)

  // Da por cumplidos ambos requisitos (días y operaciones) de forma automática.
  async function waiveRequirements() {
    if (account.rules.type !== 'axi') return
    const updated = {
      ...account,
      rules: {
        ...account.rules,
        min_days_waived: true,
        min_trades_waived: true,
      },
    }
    try {
      await updateAccount(updated)
    } catch {
      /* reintenta */
    }
  }

  // Edge Score objetivo para llegar a la SIGUIENTE fase. Se usa el requerido de
  // la siguiente etapa; si no hay siguiente (última fase), se muestra el de la
  // fase actual a modo de referencia.
  const edgeRequired = nextAxiStage?.edgeScore ?? currentAxiStage?.edgeScore ?? 0
  const edgeGoalLabel = nextAxiStage ? nextAxiStage.label : currentAxiStage?.label ?? ''
  const edgeNow = parseFloat(edgeInput) || 0

  // Guarda el Edge Score actual en la cuenta (Axi).
  async function saveEdgeScore() {
    if (account.rules.type !== 'axi') return
    const next = parseFloat(edgeInput)
    const val = Number.isNaN(next) ? 0 : Math.max(0, next)
    if (val === (account.rules.current_edge_score ?? 0)) return
    const updated = {
      ...account,
      rules: { ...account.rules, current_edge_score: val },
    }
    try {
      await updateAccount(updated)
    } catch {
      /* reintenta en el próximo cambio */
    }
  }

  const tone = (usedOfLimit: number, safe: boolean) =>
    !safe ? 'danger' : usedOfLimit >= 80 ? 'warn' : 'safe'

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Estado de reglas del programa</span>
      </div>
      <div className="grid-3">
        <div className={`rule-panel ${tone(dailyUsedOfLimit, rules.dailyLoss.safe)}`}>
          <div className="rule-panel-row">
            <span className="rule-panel-label">Límite de pérdida diaria</span>
            <span className="rule-panel-value">
              {money(dailyUsedUSD)} / {money(dailyLimitUSD)}
            </span>
          </div>
          <ProgressBar value={dailyUsedOfLimit} tone={rules.dailyLoss.safe ? 'auto' : 'danger'} />
        </div>

        <div className={`rule-panel ${tone(ddUsedOfLimit, rules.maxDrawdown.safe)}`}>
          <div className="rule-panel-row">
            <span className="rule-panel-label">Max drawdown</span>
            <span className="rule-panel-value">
              {money(currentDD)} / {money(ddLimitUSD)}
            </span>
          </div>
          <ProgressBar value={ddUsedOfLimit} tone={rules.maxDrawdown.safe ? 'auto' : 'danger'} />
        </div>

        {isFutures ? (
          <div className={`rule-panel ${rules.consistency.safe ? 'safe' : 'danger'}`}>
            <div className="rule-panel-row">
              <span className="rule-panel-label">Regla de consistencia</span>
              <span className="rule-panel-value">
                {rules.consistency.worstDayPct.toFixed(1)}% / {rules.consistency.rulePct}%
              </span>
            </div>
            <ProgressBar
              value={
                rules.consistency.rulePct > 0
                  ? (rules.consistency.worstDayPct / rules.consistency.rulePct) * 100
                  : 0
              }
              tone={rules.consistency.safe ? 'auto' : 'danger'}
            />
          </div>
        ) : null}
      </div>
      {isAxi && currentAxiStage ? (
        <div className="grid-3" style={{ marginTop: 12 }}>
          <div className="rule-panel safe">
            <div className="rule-panel-row">
              <span className="rule-panel-label">Días mínimos ({currentAxiStage.label})</span>
              <span className="rule-panel-value">
                {axiMinDays > 0
                  ? daysMet
                    ? `Cumplido ✓ (${daysElapsed} / ${axiMinDays})`
                    : `${daysElapsed} / ${axiMinDays}`
                  : 'N/A'}
              </span>
            </div>
            <ProgressBar
              value={axiMinDays > 0 && daysMet ? 100 : axiMinDays > 0 ? Math.min(100, (daysElapsed / axiMinDays) * 100) : 0}
              tone={axiMinDays > 0 && daysMet ? 'success' : 'auto'}
            />
          </div>

          <div className="rule-panel safe">
            <div className="rule-panel-row">
              <span className="rule-panel-label">Operaciones mínimas ({currentAxiStage.label})</span>
              <span className="rule-panel-value">
                {axiMinTrades > 0
                  ? tradesMet
                    ? `Cumplido ✓ (${phaseTradesCount} / ${axiMinTrades})`
                    : `${phaseTradesCount} / ${axiMinTrades}`
                  : 'N/A'}
              </span>
            </div>
            <ProgressBar
              value={axiMinTrades > 0 && tradesMet ? 100 : axiMinTrades > 0 ? Math.min(100, (phaseTradesCount / axiMinTrades) * 100) : 0}
              tone={axiMinTrades > 0 && tradesMet ? 'success' : 'auto'}
            />
          </div>

          <div className="rule-panel safe">
            <div className="rule-panel-row" style={{ justifyContent: 'center' }}>
              <span className="rule-panel-label">¿Requisito ya cumplido fuera de la app?</span>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
              Si esta cuenta real ya supera los {axiMinTrades} trades y días requeridos pero no
              quieres registrarlos, fuerza el cumplimiento automáticamente.
            </p>
            {daysMet && tradesMet ? (
              <span className="rule-panel-value" style={{ color: 'var(--green)' }}>
                ✓ Requisitos cumplidos
              </span>
            ) : (
              <Button variant="primary" sm onClick={waiveRequirements}>
                Forzar cumplimiento
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {isAxi && currentAxiStage ? (
        <div className="rule-panel safe" style={{ marginTop: 12 }}>
          <div className="rule-panel-row">
            <span className="rule-panel-label">
              Edge Score → llegar a {edgeGoalLabel || 'siguiente fase'}
            </span>
            <span className="rule-panel-value">
              {edgeNow.toFixed(0)} / {edgeRequired}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
            <RingGauge value={edgeNow} required={edgeRequired} label={`Edge hacia ${edgeGoalLabel}`} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 180px' }}>
              <span className="muted" style={{ fontSize: 13 }}>
                Ingresa tu Edge Score actual para ver cuánto te falta para pasar a{' '}
                <strong>{edgeGoalLabel || 'la siguiente fase'}</strong> (requerido: {edgeRequired}).
                Este valor lo colocas tú; la app no lo calcula.
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  style={{ maxWidth: 120 }}
                  placeholder={edgeRequired ? String(edgeRequired) : '0'}
                  value={edgeInput}
                  onChange={(e) => setEdgeInput(e.target.value)}
                  onBlur={saveEdgeScore}
                />
                <Button variant="primary" sm onClick={saveEdgeScore}>
                  Guardar
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}

// Tabla del historial de fases completadas (Axi Select y Fondeo Futuros).
// Cada fila se puede seleccionar para ver las estadísticas de esa fase en todos
// los paneles. `showCapital` muestra la columna de capital agregado (solo Axi).
function HistoryTable({
  history,
  activeLabel,
  onSelect,
  showCapital,
}: {
  history: AxiStageHistory[]
  activeLabel: string | null
  onSelect: (h: AxiStageHistory) => void
  showCapital?: boolean
}) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Historial de fases completadas</span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
        Haz clic en una fase para ver en todos los paneles sus estadísticas. Haz clic en la fase actual para volver.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Fase</th>
              <th>Fechas</th>
              <th className="num">Balance final</th>
              <th className="num">P&L</th>
              <th className="num">Operaciones</th>
              <th className="num">Win rate</th>
              {showCapital ? <th className="num">Capital agreg.</th> : null}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const isSel = activeLabel === h.stageLabel
              return (
                <tr
                  key={`${h.stageLabel}-${h.startDate}`}
                  onClick={() => onSelect(h)}
                  style={{ cursor: 'pointer', background: isSel ? 'var(--accent-soft)' : undefined }}
                >
                  <td><strong>{h.stageLabel}</strong></td>
                  <td className="muted">
                    {shortDate(h.startDate)} → {shortDate(h.endDate)}
                  </td>
                  <td className="num">{money(h.endBalance)}</td>
                  <td className={`num ${h.netPnl >= 0 ? 'pos' : 'neg'}`}>{signedMoney(h.netPnl)}</td>
                  <td className="num">{h.trades}</td>
                  <td className="num">{h.winRate.toFixed(0)}%</td>
                  {showCapital ? (
                    <td className="num">
                      {h.capitalAdded != null && h.capitalAdded > 0 ? money(h.capitalAdded) : '—'}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Mini({ label, value, pos }: { label: string; value: string; pos?: boolean }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${pos ? 'pos' : ''}`} style={{ fontSize: 17 }}>
        {value}
      </span>
    </div>
  )
}

// Gráfico de indicador en anillo (ring gauge). Muestra el % de avance hacia el
// edge requerido y el valor actual en el centro.
function RingGauge({
  value,
  required,
  label,
}: {
  value: number
  required: number
  label: string
}) {
  const pct = required > 0 ? Math.min(100, Math.max(0, (value / required) * 100)) : 0
  const r = 54
  const c = 2 * Math.PI * r
  const filled = (pct / 100) * c
  // Color según avance: cerca/por encima del objetivo en verde si se cumple.
  const color = pct >= 100 ? '#16a34a' : pct >= 75 ? '#d97706' : 'var(--accent)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={label}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth={14} />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="66" textAnchor="middle" fill="var(--text)" style={{ fontSize: 22, fontWeight: 700 }}>
          {required > 0 ? Math.round(value) : '—'}
        </text>
        <text x="70" y="86" textAnchor="middle" fill="var(--text-muted)" style={{ fontSize: 11 }}>
          / {required > 0 ? required : 'N/A'}
        </text>
      </svg>
      <span className="rule-panel-label" style={{ textAlign: 'center' }}>
        {label}
      </span>
    </div>
  )
}
