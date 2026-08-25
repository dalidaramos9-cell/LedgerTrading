import { useMemo } from 'react'
import { useData } from '../contexts/DataContext'
import { useRouteAccount } from '../contexts/AccountRouteContext'
import { analyzeAccount } from '../lib/engine'
import { money, signedMoney } from '../lib/fmt'
import { useStageAutoAdvance } from '../hooks/useStageAutoAdvance'
import CelebrationModal from '../components/CelebrationModal'
import { Button, Badge, ProgressBar, EmptyState } from '../components/ui'

// Pestaña "Etapas": muestra el estado de las reglas del programa (en dólares)
// y el progreso de las etapas de la cuenta activa.
export default function StagesPage() {
  const account = useRouteAccount()
  const { trades, payouts, updateAccount } = useData()

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

  async function moveStage(delta: number) {
    if (!account) return
    const totalStages = analysis?.stages.length ?? 0
    if (delta === 1 && account.current_stage_index >= totalStages - 1) return
    if (delta === -1 && account.current_stage_index <= 0) return
    const nextIndex = account.current_stage_index + delta
    let updated = {
      ...account,
      current_stage_index: nextIndex,
      stage_start_pnl: analysis?.stats.totalPnl ?? 0,
    }
    if (account.rules.type === 'axi') {
      const stages = account.rules.stages.map((st, i) => {
        if (i < nextIndex) return { ...st, status: 'completed' as const }
        if (i === nextIndex) return { ...st, status: 'current' as const }
        return { ...st, status: 'pending' as const }
      })
      updated = { ...updated, rules: { ...account.rules, stages } }
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
        {account.type === 'axi' ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderTop: '1px solid var(--border)',
              paddingTop: 14,
              marginTop: 10,
              flexWrap: 'wrap',
            }}
          >
            <span className="muted" style={{ fontSize: 13, flex: 1 }}>
              Axi Select es manual: tú controlas cuándo cambiar de etapa.
            </span>
            <Button variant="ghost" sm disabled={account.current_stage_index <= 0} onClick={() => moveStage(-1)}>
              ← Etapa anterior
            </Button>
            <Button
              variant="primary"
              sm
              disabled={account.current_stage_index >= analysis.stages.length - 1}
              onClick={() => moveStage(1)}
            >
              Siguiente etapa →
            </Button>
          </div>
        ) : null}
      </div>

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
