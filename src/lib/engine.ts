import {
  Account,
  Payout,
  Trade,
  type Session,
} from './types'

export interface EquityPoint {
  date: string
  balance: number
  cumulativePnl: number
}

export interface DaySummary {
  date: string
  pnl: number
  trades: number
  wins: number
  losses: number
}

export interface MonthlySummary {
  year: number
  month: number
  pnl: number
  rNet: number
  trades: number
  winRate: number
  bestDay: number
  worstDay: number
  startBalance: number
  startPnl: number
  endBalance: number
}

export interface SessionBreakdown {
  session: Session
  pnl: number
  trades: number
  wins: number
  winRate: number
}

export interface InstrumentBreakdown {
  instrument: string
  pnl: number
  trades: number
  wins: number
  winRate: number
}

export interface RDistribution {
  r: number
  count: number
}

export interface TradeStats {
  totalTrades: number
  wins: number
  losses: number
  breakEven: number
  winRate: number
  profitFactor: number
  expectedR: number
  avgPnl: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  currentStreak: number
  worstDrawdown: number
  totalPnl: number
  currentBalance: number
  totalR: number
  biggestDayPct: number
  biggestDayPnl: number
}

export interface DrawdownStatus {
  peakBalance: number
  currentDrawdownPct: number
  maxDrawdownPct: number
  limitPct: number
  shieldPct: number
  broken: boolean
  reference: number
}

export interface RuleState {
  dailyLoss: { allowedPct: number; usedPct: number; safe: boolean }
  maxDrawdown: { limitPct: number; usedPct: number; safe: boolean }
  consistency: { rulePct: number; worstDayPct: number; safe: boolean }
}

export interface StageProgress {
  stageLabel: string
  stageIndex: number
  fromBalance: number
  targetBalance: number
  currentBalance: number
  targetPct: number
  progressPct: number
  needsAdvance: boolean
  isComplete: boolean
}

export interface AccountAnalysis {
  stats: TradeStats
  equity: EquityPoint[]
  days: DaySummary[]
  monthly: MonthlySummary[]
  bySession: SessionBreakdown[]
  byInstrument: InstrumentBreakdown[]
  byDirection: { long: { pnl: number; trades: number; winRate: number }; short: { pnl: number; trades: number; winRate: number } }
  byWeekday: { [day: number]: { pnl: number; trades: number } }
  rDistribution: RDistribution[]
  rules: RuleState | null
  stages: StageProgress[]
  payouts: { totalGross: number; profitSplitPct: number; totalYours: number; totalPaid: number; totalPending: number; count: number }
}

function fmt(v: number): number {
  return Math.round(v * 100) / 100
}

function clampPct(v: number): number {
  if (!isFinite(v)) return 0
  return Math.max(0, Math.min(v, 200))
}

const dayKey = (date: string) => date.slice(0, 10)

export function analyzeAccount(
  account: Account,
  trades: Trade[],
  payouts: Payout[],
): AccountAnalysis {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date))
  const sortedPayouts = [...payouts].sort((a, b) => a.date.localeCompare(b.date))

  const wins = sorted.filter((t) => t.result === 'win')
  const losses = sorted.filter((t) => t.result === 'loss')
  const be = sorted.filter((t) => t.result === 'be').length

  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss
  const totalPnl = sorted.reduce((s, t) => s + t.pnl, 0)
  const totalR = sorted.reduce((s, t) => s + t.r_result, 0)
  const expectedR = sorted.length ? totalR / sorted.length : 0
  const avgPnl = sorted.length ? totalPnl / sorted.length : 0
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const bestTrade = sorted.length ? Math.max(...sorted.map((t) => t.pnl)) : 0
  const worstTrade = sorted.length ? Math.min(...sorted.map((t) => t.pnl)) : 0
  const winRate = sorted.length ? (wins.length / sorted.length) * 100 : 0

  let currentStreak = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i]
    if (t.result === 'be') {
      if (i === sorted.length - 1) break
      continue
    }
    const sign = t.result === 'win' ? 1 : -1
    if (currentStreak === 0) currentStreak = sign
    else if ((currentStreak > 0 ? 1 : -1) === sign) currentStreak += sign
    else break
  }

  let bal = account.initial_balance
  let peak = account.initial_balance
  let maxDD = 0
  const equity: EquityPoint[] = []
  equity.push({ date: account.start_date.slice(0, 10), balance: fmt(bal), cumulativePnl: 0 })
  for (const t of sorted) {
    bal += t.pnl
    peak = Math.max(peak, bal)
    const dd = peak - bal
    if (dd > maxDD) maxDD = dd
    equity.push({ date: dayKey(t.date), balance: fmt(bal), cumulativePnl: fmt(bal - account.initial_balance) })
  }

  // ---- por día ----
  const dayMap = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>()
  for (const t of sorted) {
    const k = dayKey(t.date)
    const d = dayMap.get(k) ?? { pnl: 0, trades: 0, wins: 0, losses: 0 }
    d.pnl += t.pnl
    d.trades++
    if (t.result === 'win') d.wins++
    if (t.result === 'loss') d.losses++
    dayMap.set(k, d)
  }
  const days: DaySummary[] = [...dayMap.entries()]
    .map(([date, d]) => ({ date, ...d }))
    .sort((a, b) => a.date.localeCompare(b.date))

  let biggestDayPnl = 0
  for (const d of days) if (d.pnl > biggestDayPnl) biggestDayPnl = d.pnl
  const biggestDayPct = grossProfit > 0 ? (biggestDayPnl / grossProfit) * 100 : 0

  // ---- mensual ----
  const monthMap = new Map<string, MonthlySummary>()
  for (const [date, d] of dayMap.entries()) {
    const y = Number(date.slice(0, 4))
    const m = Number(date.slice(5, 7))
    const k = `${y}-${m}`
    const ms = monthMap.get(k) ?? {
      year: y,
      month: m,
      pnl: 0,
      rNet: 0,
      trades: 0,
      winRate: 0,
      bestDay: -Infinity,
      worstDay: Infinity,
      startBalance: 0,
      startPnl: 0,
      endBalance: 0,
    }
    ms.pnl += d.pnl
    ms.trades += d.trades
    ms.bestDay = Math.max(ms.bestDay, d.pnl)
    ms.worstDay = Math.min(ms.worstDay, d.pnl)
    monthMap.set(k, ms)
  }
  const monthKeys = [...monthMap.keys()].sort()
  let cumPnl = 0
  for (const k of monthKeys) {
    const ms = monthMap.get(k)!
    ms.startPnl = cumPnl
    ms.startBalance = account.initial_balance + cumPnl
    ms.endBalance = ms.startBalance + ms.pnl
    if (ms.bestDay === -Infinity) ms.bestDay = 0
    if (ms.worstDay === Infinity) ms.worstDay = 0
    const monthDays = days.filter((d) => d.date.startsWith(k + '-'))
    const monthWins = monthDays.reduce((s, d) => s + d.wins, 0)
    ms.winRate = ms.trades ? (monthWins / ms.trades) * 100 : 0
    ms.rNet = sorted.filter((t) => t.date.startsWith(k + '-')).reduce((s, t) => s + t.r_result, 0)
    cumPnl += ms.pnl
  }
  const monthly: MonthlySummary[] = [...monthMap.values()].sort((a, b) => a.year - b.year || a.month - b.month)

  // ---- por sesión ----
  const sessionMap = new Map<Session, SessionBreakdown>()
  for (const t of sorted) {
    const s = sessionMap.get(t.session) ?? { session: t.session, pnl: 0, trades: 0, wins: 0, winRate: 0 }
    s.pnl += t.pnl
    s.trades++
    if (t.result === 'win') s.wins++
    sessionMap.set(t.session, s)
  }
  const bySession: SessionBreakdown[] = [...sessionMap.values()].map((s) => ({
    ...s,
    winRate: s.trades ? (s.wins / s.trades) * 100 : 0,
  }))

  // ---- por instrumento ----
  const instrMap = new Map<string, InstrumentBreakdown>()
  for (const t of sorted) {
    const ins = t.instrument || '—'
    const s = instrMap.get(ins) ?? { instrument: ins, pnl: 0, trades: 0, wins: 0, winRate: 0 }
    s.pnl += t.pnl
    s.trades++
    if (t.result === 'win') s.wins++
    instrMap.set(ins, s)
  }
  const byInstrument: InstrumentBreakdown[] = [...instrMap.values()]
    .map((s) => ({ ...s, winRate: s.trades ? (s.wins / s.trades) * 100 : 0 }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))

  // ---- dirección ----
  const dirData = { long: { pnl: 0, trades: 0, wins: 0, winRate: 0 }, short: { pnl: 0, trades: 0, wins: 0, winRate: 0 } }
  for (const t of sorted) {
    const d = dirData[t.direction]
    d.pnl += t.pnl
    d.trades++
    if (t.result === 'win') d.wins++
  }
  dirData.long.winRate = dirData.long.trades ? (dirData.long.wins / dirData.long.trades) * 100 : 0
  dirData.short.winRate = dirData.short.trades ? (dirData.short.wins / dirData.short.trades) * 100 : 0
  const byDirection = dirData

  // ---- por día de semana ----
  const wd: { [day: number]: { pnl: number; trades: number } } = {}
  for (const t of sorted) {
    const dow = new Date(t.date + 'T12:00:00').getDay()
    const d = wd[dow] ?? { pnl: 0, trades: 0 }
    d.pnl += t.pnl
    d.trades++
    wd[dow] = d
  }
  const byWeekday = wd

  // ---- histograma de R ----
  const rBins: { [k: number]: number } = {}
  for (const t of sorted) {
    const r = Math.round(t.r_result)
    rBins[r] = (rBins[r] ?? 0) + 1
  }
  const rDistribution: RDistribution[] = Object.entries(rBins)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([r, count]) => ({ r: Number(r), count }))

  // ---- reglas y etapas ----
  const rules = computeRules(account, days, equity, peak, account.initial_balance)
  const balanceAtEnd = bal
  const liveBalance = balanceAtEnd - sortedPayouts.reduce((s, p) => s + p.gross, 0)
  const stages = computeStages(account, totalPnl)

  // ---- payouts ----
  let totalGross = 0
  let totalYours = 0
  let totalPaid = 0
  let totalPending = 0
  let profitSplitPct = 0
  if (account.type === 'cfd' && account.rules.type === 'cfd') profitSplitPct = account.rules.profitSplit
  if (account.type === 'futures' && account.rules.type === 'futures') profitSplitPct = account.rules.profitSplit
  if (account.type === 'axi' && account.rules.type === 'axi') {
    const cur = account.rules.stages.find((s) => s.status === 'current' || s.status === 'completed') ?? account.rules.stages[0]
    profitSplitPct = cur?.profitSplit ?? 0
  }
  for (const p of sortedPayouts) {
    totalGross += p.gross
    totalYours += (p.gross * p.split_pct) / 100
    if (p.status === 'paid') totalPaid += p.gross
    if (p.status === 'requested' || p.status === 'approved') totalPending += p.gross
  }

  const stats: TradeStats = {
    totalTrades: sorted.length,
    wins: wins.length,
    losses: losses.length,
    breakEven: be,
    winRate: fmt(winRate),
    profitFactor: Number.isFinite(profitFactor) ? fmt(profitFactor) : profitFactor > 0 ? Infinity : 0,
    expectedR: fmt(expectedR),
    avgPnl: fmt(avgPnl),
    avgWin: fmt(avgWin),
    avgLoss: fmt(avgLoss),
    bestTrade: fmt(bestTrade),
    worstTrade: fmt(worstTrade),
    currentStreak,
    worstDrawdown: fmt(maxDD),
    totalPnl: fmt(totalPnl),
    currentBalance: fmt(liveBalance),
    totalR: fmt(totalR),
    biggestDayPct: fmt(biggestDayPct),
    biggestDayPnl: fmt(biggestDayPnl),
  }

  return {
    stats,
    equity,
    days,
    monthly,
    bySession,
    byInstrument,
    byDirection,
    byWeekday,
    rDistribution,
    rules,
    stages,
    payouts: {
      totalGross: fmt(totalGross),
      profitSplitPct,
      totalYours: fmt(totalYours),
      totalPaid: fmt(totalPaid),
      totalPending: fmt(totalPending),
      count: sortedPayouts.length,
    },
  }
}

function computeRules(
  account: Account,
  days: DaySummary[],
  equity: EquityPoint[],
  peak: number,
  initialBalance: number,
): RuleState | null {
  if (account.type === 'own') return null
  const currentBalance = equity.length ? equity[equity.length - 1].balance : initialBalance

  let dailyAllowedPct = 0
  let maxDDPct = 0
  let consistencyRulePct = 0
  let ddBase = initialBalance

  if (account.rules.type === 'cfd') {
    dailyAllowedPct = account.rules.dailyLossPct
    maxDDPct = account.rules.maxDrawdownPct
  } else if (account.rules.type === 'futures') {
    dailyAllowedPct = account.rules.dailyLossPct
    maxDDPct = account.rules.maxDrawdownPct
    consistencyRulePct = account.rules.consistencyPct
    if (account.rules.ddType === 'trailing-eod') ddBase = peak || initialBalance
  } else if (account.rules.type === 'axi') {
    const cur = account.rules.stages.find((s) => s.status === 'current' || s.status === 'completed')
    if (!cur) return null
    maxDDPct = cur.maxLossPct
    dailyAllowedPct = maxDDPct
  }

  const todayKey = new Date().toISOString().slice(0, 10)
  const todayPnl = days.find((d) => d.date === todayKey)?.pnl ?? 0
  const todayUsedPct = dailyAllowedPct > 0 ? (Math.abs(todayPnl) / initialBalance) * 100 : 100

  const currentDD = ddBase - currentBalance
  const currentDDPct = ddBase > 0 ? (currentDD / ddBase) * 100 : 0

  let worstDayPct = 0
  if (account.rules.type === 'futures') {
    const profits = days.filter((d) => d.pnl > 0).map((d) => d.pnl)
    const totalProfit = profits.reduce((s, p) => s + p, 0)
    if (totalProfit > 0 && profits.length) worstDayPct = (Math.max(...profits) / totalProfit) * 100
    if (consistencyRulePct <= 0) consistencyRulePct = 100
  }

  return {
    dailyLoss: {
      allowedPct: dailyAllowedPct,
      usedPct: dailyAllowedPct > 0 ? fmt(Math.min(todayUsedPct, 999)) : 0,
      safe: !(dailyAllowedPct > 0 && todayUsedPct >= dailyAllowedPct * 0.999),
    },
    maxDrawdown: {
      limitPct: maxDDPct,
      usedPct: maxDDPct > 0 ? fmt(Math.min((currentDDPct / maxDDPct) * 100, 999)) : 0,
      safe: !(maxDDPct > 0 && currentDDPct >= maxDDPct * 0.999),
    },
    consistency: {
      rulePct: consistencyRulePct,
      worstDayPct: fmt(worstDayPct),
      safe: !(consistencyRulePct > 0 && consistencyRulePct < 100 && worstDayPct > consistencyRulePct),
    },
  }
}

function computeStages(account: Account, totalPnl: number): StageProgress[] {
  const stages: StageProgress[] = []
  // Ganancia neta dentro de la etapa actual = P&L acumulado − punto de partida.
  const startPnl = account.stage_start_pnl ?? 0
  const stageNet = totalPnl - startPnl

  if (account.type === 'cfd' && account.rules.type === 'cfd') {
    const { phases } = account.rules
    // Secuencia: Fase 1 … Fase N → "Fondeada"
    const phaseCount = phases.length
    account.rules.phases.forEach((ph, i) => {
      const isCurrent = i === account.current_stage_index
      const target = ph.targetUSD
      const progressPct =
        i < account.current_stage_index
          ? 100
          : isCurrent
            ? target > 0
              ? clampPct((stageNet / target) * 100)
              : 0
            : 0
      stages.push({
        stageLabel: ph.label,
        stageIndex: i,
        fromBalance: startPnl,
        targetBalance: target,
        currentBalance: totalPnl,
        targetPct: account.initial_balance > 0 ? (target / account.initial_balance) * 100 : 0,
        progressPct,
        needsAdvance: isCurrent && target > 0 && stageNet >= target - 0.001,
        isComplete: i < account.current_stage_index,
      })
    })
    // Etapa terminal "Fondeada"
    const isFunded = account.current_stage_index >= phaseCount
    stages.push({
      stageLabel: 'Fondeada',
      stageIndex: phaseCount,
      fromBalance: startPnl,
      targetBalance: 0,
      currentBalance: totalPnl,
      targetPct: 0,
      progressPct: isFunded ? 100 : 0,
      needsAdvance: false,
      isComplete: account.current_stage_index > phaseCount,
    })
  } else if (account.type === 'futures' && account.rules.type === 'futures') {
    const r = account.rules
    stages.push(
      futuresStageProgress(account, 'Evaluación', 0, r.evaluationTarget, totalPnl, startPnl, stageNet),
      futuresStageProgress(account, 'Colchón', 1, r.cushionTarget, totalPnl, startPnl, stageNet),
      {
        stageLabel: 'Fondeo',
        stageIndex: 2,
        fromBalance: startPnl,
        targetBalance: 0,
        currentBalance: totalPnl,
        targetPct: 0,
        progressPct: account.current_stage_index >= 2 ? 100 : 0,
        needsAdvance: false,
        isComplete: account.current_stage_index > 2,
      },
    )
  } else if (account.type === 'axi' && account.rules.type === 'axi') {
    // Axi Select: avance automático igual que Futuros/CFD. La meta de cada
    // etapa se calcula como el profit target % sobre el equity mínimo.
    account.rules.stages.forEach((st, i) => {
      const isCurrent = i === account.current_stage_index
      const target = st.targetPct > 0 ? (st.minEquity * st.targetPct) / 100 : 0
      const progressPct =
        i < account.current_stage_index
          ? 100
          : isCurrent
            ? target > 0
              ? clampPct((stageNet / target) * 100)
              : 0
            : 0
      stages.push({
        stageLabel: st.label,
        stageIndex: i,
        fromBalance: startPnl,
        targetBalance: target,
        currentBalance: totalPnl,
        targetPct: st.targetPct,
        progressPct,
        needsAdvance: isCurrent && target > 0 && stageNet >= target - 0.001,
        isComplete: i < account.current_stage_index,
      })
    })
  }
  return stages
}

function futuresStageProgress(
  account: Account,
  label: string,
  index: number,
  targetUSD: number,
  totalPnl: number,
  startPnl: number,
  stageNet: number,
): StageProgress {
  const isCurrent = index === account.current_stage_index
  const progressPct =
    index < account.current_stage_index
      ? 100
      : isCurrent
        ? targetUSD > 0
          ? clampPct((stageNet / targetUSD) * 100)
          : 0
        : 0
  return {
    stageLabel: label,
    stageIndex: index,
    fromBalance: startPnl,
    targetBalance: targetUSD,
    currentBalance: totalPnl,
    targetPct: account.initial_balance > 0 ? (targetUSD / account.initial_balance) * 100 : 0,
    progressPct,
    needsAdvance: isCurrent && targetUSD > 0 && stageNet >= targetUSD - 0.001,
    isComplete: index < account.current_stage_index,
  }
}

// P&L neto de un día concreto (para el calendario y las tarjetas de fecha)
export function pnlForDate(date: string, trades: Trade[]): number {
  const k = date.slice(0, 10)
  return trades.filter((t) => t.date.slice(0, 10) === k).reduce((s, t) => s + t.pnl, 0)
}

