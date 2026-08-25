import { useMemo, useState } from 'react'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { analyzeAccount } from '../lib/engine'
import { money, signedMoney } from '../lib/fmt'
import { useStageAutoAdvance } from '../hooks/useStageAutoAdvance'
import CelebrationModal from '../components/CelebrationModal'
import { Badge, ProgressBar, EmptyState, Button, Modal, Field } from '../components/ui'

// Pestaña "Etapas": muestra el estado de las reglas del programa (en dólares)
// y el progreso de las etapas de la cuenta activa.
export default function StagesPage() {
  const account = useRouteAccount()
  const { trades, payouts, updateAccount } = useData()
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

  const { celebrated, dismiss } = useStageAutoAdvance(account, analysis)

  if (!account || !analysis) {
    return (
      <EmptyState icon="🗺️" title="Sin cuenta seleccionada">
        Elige una cuenta de la barra lateral para ver sus reglas y etapas.
      </EmptyState>
    )
  }

  // Monto sugerido para llegar al equity mínimo de la etapa actual (si falta).
  const currentStage = account.rules.type === 'axi' ? account.rules.stages[account.current_stage_index] : null
  const minEquity = currentStage?.minEquity ?? 0
  const balanceNow = analysis.stats.currentBalance
  const suggestedCapital = minEquity > 0 ? Math.max(0, minEquity - balanceNow) : 0
  // Acceso tipado a los datos de capital e historial de Axi.
  const axiCapital =
    account.type === 'axi' && account.rules.type === 'axi'
      ? account.rules.stage_capital_total ?? 0
      : 0
  const axiHistory =
    account.type === 'axi' && account.rules.type === 'axi'
      ? account.rules.stage_history ?? []
      : []

  async function addCapital() {
    const amt = parseFloat(capitalAmount)
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

  return (
    <div className="stack">
      <RuleStatusUSD account={account} />

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
              return (
                <div className="stage-row" key={stage.stageIndex}>
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
                      ) : null}
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
            <div className="stage-stat-row">
              <span>Balance actual</span>
              <strong>{money(balanceNow)}</strong>
            </div>
            <div className="stage-stat-row" style={{ marginTop: 6 }}>
              <span>Equity mínimo etapa actual («{currentStage?.label ?? ''}»)</span>
              <strong>{money(minEquity)}</strong>
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
                  Falta {money(suggestedCapital)} para cumplir el mínimo de esta etapa.
                </span>
              ) : null}
            </div>
          </div>

          {axiHistory.length > 0 ? (
            <div className="panel">
              <div className="panel-head">
                <span className="panel-title">Historial de fases completadas</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fase</th>
                      <th className="num">Balance final</th>
                      <th className="num">P&L</th>
                      <th className="num">Operaciones</th>
                      <th className="num">Win rate</th>
                      <th className="num">Capital agreg.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {axiHistory.map((h) => (
                      <tr key={h.stageLabel}>
                        <td><strong>{h.stageLabel}</strong></td>
                        <td className="num">{money(h.endBalance)}</td>
                        <td className={`num ${h.netPnl >= 0 ? 'pos' : 'neg'}`}>{signedMoney(h.netPnl)}</td>
                        <td className="num">{h.trades}</td>
                        <td className="num">{h.winRate.toFixed(0)}%</td>
                        <td className="num">{h.capitalAdded > 0 ? money(h.capitalAdded) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <Modal open={capitalOpen} onClose={() => setCapitalOpen(false)} title="Agregar capital (Axi Select)">
        <div className="stack">
          <Field label={`Monto a agregar${suggestedCapital > 0 ? ` (sugerido: ${money(suggestedCapital)})` : ''}`}>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input"
              placeholder="0.00"
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

  // Límite de pérdida diaria en $ (pérdida de hoy vs. límite en $)
  const todayPnl =
    analysis?.days.find((d) => d.date === new Date().toISOString().slice(0, 10))?.pnl ?? 0
  const dailyLimitUSD = (initialBalance * rules.dailyLoss.allowedPct) / 100
  const dailyUsedUSD = Math.abs(todayPnl)
  const dailyUsedOfLimit = dailyLimitUSD > 0 ? (dailyUsedUSD / dailyLimitUSD) * 100 : 0

  // Max drawdown en $: drawdown desde la base vs. límite en $
  const currentBalance = analysis?.stats.currentBalance ?? initialBalance
  const currentDD = Math.max(0, initialBalance - currentBalance)
  const ddLimitUSD = (initialBalance * rules.maxDrawdown.limitPct) / 100
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
