import { useEffect, useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { useActivePhase } from '../contexts/ActivePhaseContext'
import { analyzeAccount } from '../lib/engine'
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
  const phaseAnalysis = useMemo(() => {
    if (!account) return null
    return analyzeAccount(
      account,
      tradesForActive(trades.filter((t) => t.account_id === account.id)),
      payouts.filter((p) => p.account_id === account.id),
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
  const axiHistory =
    account.type === 'axi' && account.rules.type === 'axi'
      ? account.rules.stage_history ?? []
      : []
  // Fecha de inicio de la fase actual (para mostrarla y permitir editarla).
  const phaseStartDate =
    account.rules.type === 'axi' && account.rules.current_stage_start_date
      ? isoDate(new Date(account.rules.current_stage_start_date))
      : isoDate(new Date())

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

  // Guarda la fecha de inicio manual de la fase actual (para poder registrar
  // operaciones del pasado si la cuenta ya venía en una etapa avanzada).
  async function setPhaseStartDate(newDate: string) {
    if (!account || !newDate) return
    if (!(account.rules.type === 'axi')) return
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
          <div className="stat-grid">
            <Mini label="Balance" value={money(phaseAnalysis.stats.currentBalance)} />
            <Mini label="P&L" value={signedMoney(phaseAnalysis.stats.totalPnl)} pos={phaseAnalysis.stats.totalPnl > 0} />
            <Mini label="Operaciones" value={String(phaseAnalysis.stats.totalTrades)} />
            <Mini label="Win rate" value={`${phaseAnalysis.stats.winRate.toFixed(1)}%`} />
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
              const completed = stage.isComplete || stage.needsAdvance
              const isCurrentStage = stage.stageIndex === account.current_stage_index
              // En la vista se está mostrando la fase actual cuando activePhase es null.
              const isViewingCurrent = isCurrentStage && (activePhase === null || activePhase.kind === 'current')
              return (
                <div
                  className="stage-row"
                  key={stage.stageIndex}
                  onClick={isCurrentStage ? () => selectCurrent() : undefined}
                  style={{
                    cursor: isCurrentStage ? 'pointer' : undefined,
                    background: isViewingCurrent ? 'var(--accent-soft)' : undefined,
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
                      <span>Objetivo {stage.targetBalance > 0 ? money(stage.targetBalance) : '—'}</span>
                    </div>
                    {stageDetail(account, stage) ? (
                      <div className="stage-stat-row">
                        <span className="muted">{stageDetail(account, stage)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {account.type === 'axi' && account.rules.type === 'axi' ? (
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
              <span>Balance actual</span>
              <strong>{money(balanceNow)}</strong>
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
              {suggestedCapital > 0 ? (
                <span className="muted" style={{ fontSize: 13 }}>
                  Recomendado agregar {money(suggestedCapital)} para cubrir mínimo + pérdida máx de la etapa.
                </span>
              ) : null}
            </div>
          </div>

          {axiHistory.length > 0 ? (
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
                      <th className="num">Capital agreg.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {axiHistory.map((h) => {
                      const isSel = activePhase?.kind === 'history' && activePhase.label === h.stageLabel
                      return (
                        <tr
                          key={h.stageLabel}
                          onClick={() => selectHistory(h)}
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
                          <td className="num">{h.capitalAdded > 0 ? money(h.capitalAdded) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
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
  const { trades, payouts } = useData()
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

  // Max drawdown en $: drawdown desde la base vs. límite en $
  const currentBalance = analysis?.stats.currentBalance ?? initialBalance
  const currentDD = Math.max(0, ddBase - currentBalance)
  const ddLimitUSD = (ddBase * rules.maxDrawdown.limitPct) / 100
  const ddUsedOfLimit = ddLimitUSD > 0 ? (currentDD / ddLimitUSD) * 100 : 0

  // Consistencia (solo Futuros): la regla es en %
  const isFutures = account.rules.type === 'futures'

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
