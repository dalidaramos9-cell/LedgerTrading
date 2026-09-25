// ---- Tipos centrales de Ledger ----

export type AccountType = 'own' | 'cfd' | 'futures' | 'axi'

export type AccountStatus =
  | 'active'
  | 'evaluation'
  | 'funded'
  | 'failed'
  | 'passed'
  | 'cushion'

// Sesiones de trading
export type Session =
  | 'london'
  | 'ny-am'
  | 'ny-pm'
  | '2am-ny'
  | 'asia'
  | 'other'

export type Direction = 'long' | 'short'

export type TradeResult = 'win' | 'loss' | 'be'

// Activos disponibles para elegir en el campo Instrumento.
export const INSTRUMENTS = ['MNQ', 'NAS100', 'US30']

// Valores para el separador "Otro" en los desplegables de instrumento.
export const INSTRUMENT_OTHER = 'Otro'

export type PayoutStatus = 'requested' | 'approved' | 'paid' | 'rejected'

export type AxiStageStatus = 'pending' | 'current' | 'completed' | 'quarantine'

export type DrawdownType = 'static' | 'trailing-eod'

// ---- Reglas por tipo de programa ----

export interface CfdRules {
  type: 'cfd'
  // 1 o 2 fases configurables
  phases: CfdPhase[]
  dailyLossPct: number
  maxDrawdownPct: number // estático en CFD
  profitSplit: number // %
  // Campos de fase opcionales (reset de capital/estadísticas). CFD no los usa,
  // pero se declaran para que el acceso por unión sea seguro en la UI.
  current_stage_balance?: number
  current_stage_start_date?: string
  stage_history?: AxiStageHistory[]
}

export interface CfdPhase {
  id: string
  label: string
  targetUSD: number // objetivo de fase en $ (ganancia neta a lograr en esa fase)
  stage: number
}

export interface FuturesRules {
  type: 'futures'
  evaluationTarget: number // $ objetivo fase evaluación
  cushionTarget: number // $ objetivo colchón
  ddType: DrawdownType
  dailyLossPct: number
  maxDrawdownPct: number // drawdown máximo (si trailing/EOD, es relativo)
  consistencyPct: number // regla de consistencia (máx % por día)
  profitSplit: number // %
  // Balance de la cuenta al entrar a la fase actual (Evaluación → Colchón →
  // Fondeo). Al avanzar de fase el balance se reinicia a este valor, de modo que
  // el capital y las estadísticas de la nueva fase arrancan de cero sin perder
  // los trades ya registrados (que se resumen en `stage_history`).
  current_stage_balance?: number
  // Fecha (ISO) en la que la cuenta entró a la fase actual. Permite filtrar los
  // trades de la fase activa por fecha (reset de estadísticas por fase).
  current_stage_start_date?: string
  // Historial de fases completadas (para no perder los datos al reiniciar el
  // conteo en cada cambio de fase).
  stage_history?: FuturesStageHistory[]
  // Capital base del programa (el que tenía la cuenta al ENTRAR en Evaluación,
  // p. ej. 50.000). `initial_balance` se sobrescribe con el balance de entrada
  // de cada fase al avanzar (la cuenta se "repone"), así que los porcentajes de
  // objetivo deben calcularse sobre este valor para que 3.000 sigan siendo el 6%
  // del programa y no el 6% de la fase.
  program_base_balance?: number
}

export interface AxiStage {
  id: string
  label: string
  minEquity: number // $ equity mínimo para esta etapa
  funded: number // $ fondeo asignado
  profitSplit: number // %
  targetPct: number // objetivo % para avanzar (0 = N/A)
  maxLossPct: number // pérdida máxima permitida %
  edgeScore: number // Edge Score requerido
  multiplier: number // multiplicador del fondeo
  minDays: number // duración mínima en días (0 = N/A)
  minTrades: number // operaciones mínimas (0 = N/A)
  leverage: string // apalancamiento, p.ej. "1000:1"
  status: AxiStageStatus
}

// Resumen guardado de una etapa/fase completada (Axi Select o Fondeo Futuros),
// para no perder los datos cuando pasas a la siguiente fase y se reinician
// capital y estadísticas. `minEquity` y `capitalAdded` son propios de Axi y
// quedan opcionales para que ambos programas compartan la misma estructura.
export interface AxiStageHistory {
  stageLabel: string
  stageIndex?: number // 0 = primera fase; opcional por compatibilidad
  minEquity?: number
  startBalance: number // balance al entrar (tras ajuste de capital)
  endBalance: number
  netPnl: number // ganancia de trading dentro de la fase (sin el capital agregado)
  trades: number
  winRate: number // 0-100
  profitFactor: number
  capitalAdded?: number // $ agregados al entrar a esta fase (Axi Select)
  startDate: string // ISO
  endDate: string // ISO
}

// Fases de Fondeo Futuros comparten la misma estructura que las de Axi.
export type FuturesStageHistory = AxiStageHistory

export interface AxiRules {
  type: 'axi'
  stages: AxiStage[]
  // Capital agregado por fases (Axi): depósitos de ajuste al pasar de fase
  // para cumplir el equity mínimo. Se suma al balance pero no es ganancia.
  stage_capital_total?: number
  // Balance de la cuenta al entrar a la fase actual (tras ajuste de capital).
  current_stage_balance?: number
  // Capital base del programa (el que tenía la cuenta al ENTRAR en la primera
  // fase, p. ej. 50.000). `initial_balance` se sobrescribe con el balance de
  // entrada de cada fase al avanzar (la cuenta se "repone"), así que los
  // porcentajes de objetivo deben calcularse sobre este valor para que 3.000
  // sigan siendo el 6% del programa y no el 6% de la fase.
  program_base_balance?: number
  // Fecha (ISO) en la que la cuenta entró a la fase actual. Permite filtrar
  // los trades de la fase activa por fecha.
  current_stage_start_date?: string
  // Edge Score actual de la fase (ingresado manualmente por el usuario; el
  // motor no lo calcula). Se usa para el gauge de avance hacia la siguiente etapa.
  current_edge_score?: number
  // Flags para exonerar ("dar por cumplidos") los requisitos de duración mínima
  // y operaciones mínimas de la fase actual, sin necesid de registrar cada trade
  // (cuentas reales que ya los cumplieron fuera de la app).
  min_days_waived?: boolean
  min_trades_waived?: boolean
  // Historial de fases completadas (para no perder datos al reiniciar el conteo).
  stage_history?: AxiStageHistory[]
}

export type AccountRules = CfdRules | FuturesRules | AxiRules

// ---- Modelos de datos ----

export interface Account {
  id: string
  user_id: string
  name: string
  type: AccountType
  broker: string
  initial_balance: number
  risk_per_trade: number // %
  start_date: string // ISO
  status: AccountStatus
  rules: AccountRules
  current_stage_index: number
  // Punto de partida de la etapa actual = P&L neto acumulado (suma de trades)
  // en el momento en que la cuenta entró a esta etapa. El progreso de la etapa
  // se mide como (P&L actual − stage_start_pnl) contra el objetivo de la etapa.
  stage_start_pnl: number
  archived: boolean
  created_at: string
}

export interface Trade {
  id: string
  account_id: string
  user_id: string
  date: string // ISO (fecha)
  instrument: string
  direction: Direction
  session: Session
  r_planned: number
  r_result: number
  pnl: number
  result: TradeResult
  notes: string
  created_at: string
}

export interface Payout {
  id: string
  account_id: string
  user_id: string
  date: string // ISO
  gross: number // monto bruto
  split_pct: number // % del split
  status: PayoutStatus
  note: string
  // Fase del programa a la que pertenece el pago (p. ej. "Seed", "Incubation").
  // Opcional: aplica sobre todo a programas con etapas (Axi Select).
  stage_label?: string
  created_at: string
}

export interface Profile {
  id: string
  username: string
  display_name: string
  updated_at: string
}

// ---- Utilidades de metadatos ----

export const SESSIONS: { value: Session; label: string }[] = [
  { value: 'london', label: 'Londres' },
  { value: 'ny-am', label: 'NY AM' },
  { value: 'ny-pm', label: 'NY PM' },
  { value: '2am-ny', label: '2AM NY' },
  { value: 'asia', label: 'Asia' },
  { value: 'other', label: 'Otra' },
]

export const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: 'long', label: 'Long' },
  { value: 'short', label: 'Short' },
]

export const BROKERS = [
  'Axi',
  'FundedNext',
  'FTMO',
  'Lucid Trading',
  'Apex Trading Funding',
  'Take Profit Trader',
  'Otro',
]

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  own: 'Capital propio',
  cfd: 'Fondeo CFD',
  futures: 'Fondeo Futuros',
  axi: 'Axi Select',
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Activa',
  evaluation: 'En evaluación',
  funded: 'Fondeada',
  failed: 'Fallida',
  passed: 'Pasada',
  cushion: 'Colchón',
}

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  requested: 'Solicitado',
  approved: 'Aprobado',
  paid: 'Pagado',
  rejected: 'Rechazado',
}

export const AXI_STAGE_DEFAULT_LABELS = [
  'Seed',
  'Etapa 2',
  'Etapa 3',
  'Etapa 4',
  'Etapa 5',
  'Pro M',
]

export function randId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}
