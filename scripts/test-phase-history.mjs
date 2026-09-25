// Test de validación: trades de una fase anterior visibles en Calendario,
// Operaciones y Vista mensual.
// Escenario del reporte: cuenta Fondeo CFD ya avanzada a «Fase 2»
// (current_stage_index = 1, current_stage_start_date en el futuro respecto a
// los trades) con operaciones registradas en la Fase 1 (ago/sep 2026).
import assert from 'node:assert/strict'
import { analyzeAccount } from '../src/lib/engine.ts'

const trades = [
  { id: 't1', account_id: 'a1', date: '2026-08-24T12:00:00.000Z', instrument: 'NAS100', direction: 'long', session: 'london', r_planned: 2, r_result: 2, pnl: 192.62, result: 'win', notes: '' },
  { id: 't2', account_id: 'a1', date: '2026-08-25T12:00:00.000Z', instrument: 'NAS100', direction: 'long', session: 'london', r_planned: 2, r_result: 2, pnl: 188.92, result: 'win', notes: '' },
  { id: 't3', account_id: 'a1', date: '2026-09-01T12:00:00.000Z', instrument: 'NAS100', direction: 'long', session: 'london', r_planned: 2, r_result: -1, pnl: -382.14, result: 'loss', notes: '' },
  { id: 't4', account_id: 'a1', date: '2026-09-25T12:00:00.000Z', instrument: 'NAS100', direction: 'long', session: 'london', r_planned: 2, r_result: 2, pnl: 254.29, result: 'win', notes: '' },
]

// Fase 2 arranca el 01/10/2026: todos los trades de arriba son de la Fase 1.
const account = {
  id: 'a1', user_id: 'u1', name: 'FundedNext 15k', type: 'cfd', status: 'evaluation',
  initial_balance: 15000, start_date: '2026-08-01T12:00:00.000Z',
  current_stage_index: 1, stage_start_pnl: 0, archived: false,
  rules: {
    type: 'cfd',
    phases: [
      { id: 'p1', label: 'Fase 1', targetUSD: 1200, stage: 1 },
      { id: 'p2', label: 'Fase 2', targetUSD: 600, stage: 2 },
    ],
    dailyLossPct: 5, maxDrawdownPct: 10, profitSplit: 80,
    current_stage_balance: 15000,
    current_stage_start_date: '2026-10-01T12:00:00.000Z',
    stage_history: [
      { stageLabel: 'Fase 1', stageIndex: 0, startBalance: 15000, endBalance: 15253.69, netPnl: 253.69, trades: 4, winRate: 75, profitFactor: 1.6, startDate: '2026-08-01T12:00:00.000Z', endDate: '2026-09-30T12:00:00.000Z' },
    ],
  },
}

const acctTrades = trades.filter((t) => t.account_id === account.id)
const monthOf = (iso) => iso.slice(0, 7)

// --- Bug original (scope 'auto' con todos los trades, como hacía MonthlyPage):
// el motor descarta los trades anteriores a la fase actual => análisis vacío.
const buggy = analyzeAccount(account, acctTrades, [])
assert.equal(buggy.stats.totalTrades, 0, 'bug: scope auto descarta los trades de la fase anterior')
assert.equal(buggy.monthly.length, 0, 'bug: la vista mensual quedaría vacía')

// --- Fix 1: Vista mensual pide scope full y ve TODOS los meses con datos.
const monthly = analyzeAccount(account, acctTrades, [], { scope: 'full' })
assert.equal(monthly.stats.totalTrades, 4, 'fix: la vista mensual ve las 4 operaciones')
assert.deepEqual(
  monthly.monthly.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}`),
  ['2026-08', '2026-09'],
  'fix: la vista mensual lista agosto y septiembre',
)
assert.ok(Math.abs(monthly.monthly.reduce((s, m) => s + m.pnl, 0) - 253.69) < 0.01, 'fix: P&L mensual agregado correcto')

// --- Fix 2: Calendario/Operaciones de una fase HISTÓRICA: los trades ya vienen
// acotados por fecha por tradesForActive; con scope full el motor no los repite.
const phase1 = acctTrades.filter((t) => t.date.slice(0, 10) >= '2026-08-01' && t.date.slice(0, 10) <= '2026-09-30')
const phase1Analysis = analyzeAccount(
  { ...account, initial_balance: 15000 },
  phase1,
  [],
  { scope: 'full' },
)
assert.equal(phase1Analysis.stats.totalTrades, 4, 'fix: la fase histórica muestra sus 4 operaciones')
assert.equal(phase1Analysis.days[0].date, '2026-08-24', 'fix: el primer día con actividad es 24/08')
assert.equal(phase1Analysis.days[phase1Analysis.days.length - 1].date, '2026-09-25', 'fix: la última operación es 25/09')
// El calendario debe tener datos en el mes de la última operación (sep 2026),
// que es al que salta el cursor.
assert.equal(monthOf(phase1Analysis.days[phase1Analysis.days.length - 1].date), '2026-09')
assert.ok(
  phase1Analysis.days.some((d) => d.date.startsWith('2026-09')),
  'fix: el mes de septiembre tiene días con actividad',
)

// --- Fix 3: cabecera de Operaciones en la fase actual (scope auto) sigue
// mostrando 0 operaciones porque los trades son anteriores: eso es correcto,
// pero con la lista ya acotada a la fase actual la cabecera y la tabla coinciden.
const currentPhase = acctTrades.filter((t) => t.date.slice(0, 10) >= '2026-10-01')
const currentAnalysis = analyzeAccount(account, currentPhase, [])
assert.equal(currentAnalysis.stats.totalTrades, 0, 'fase actual sin operaciones: cabecera y tabla coinciden')

console.log('OK — 3 grupos de aserciones pasadas (bug reproducido y fixes verificados)')
