import {
  AccountRules,
  AxiStage,
  randId,
} from './types'

// Fábrica de reglas por defecto por tipo de programa.
// El usuario las puede editar después en el formulario de cuenta.

export function defaultCfdRules(): AccountRules {
  return {
    type: 'cfd',
    phases: [
      { id: randId(), label: 'Fase 1', targetUSD: 8000, stage: 1 },
      { id: randId(), label: 'Fase 2', targetUSD: 5000, stage: 2 },
    ],
    dailyLossPct: 5,
    maxDrawdownPct: 10,
    profitSplit: 80,
  }
}

export function defaultFuturesRules(): AccountRules {
  return {
    type: 'futures',
    evaluationTarget: 3000,
    cushionTarget: 1500,
    ddType: 'trailing-eod',
    dailyLossPct: 4,
    maxDrawdownPct: 7,
    consistencyPct: 50,
    profitSplit: 90,
  }
}

export function defaultAxiStage(stage: {
  label: string
  minEquity: number
  edgeScore: number
  multiplier: number
  funded: number
  profitSplit: number
  targetPct: number
  minDays: number
  minTrades: number
  leverage: string
  maxLossPct: number
}, idx: number): AxiStage {
  return {
    id: randId(),
    label: stage.label,
    minEquity: stage.minEquity,
    edgeScore: stage.edgeScore,
    multiplier: stage.multiplier,
    funded: stage.funded,
    profitSplit: stage.profitSplit,
    targetPct: stage.targetPct,
    minDays: stage.minDays,
    minTrades: stage.minTrades,
    leverage: stage.leverage,
    maxLossPct: stage.maxLossPct,
    status: idx === 0 ? 'current' : 'pending',
  }
}

export function defaultAxiRules(): AccountRules {
  const stages = [
    {
      label: 'Seed',
      minEquity: 500,
      edgeScore: 50,
      multiplier: 10,
      funded: 5000,
      profitSplit: 0,
      targetPct: 7,
      minDays: 30,
      minTrades: 20,
      leverage: '1000:1',
      maxLossPct: 7,
    },
    {
      label: 'Incubation',
      minEquity: 1000,
      edgeScore: 60,
      multiplier: 10,
      funded: 20000,
      profitSplit: 40,
      targetPct: 7,
      minDays: 60,
      minTrades: 40,
      leverage: '100:1',
      maxLossPct: 7,
    },
    {
      label: 'Acceleration',
      minEquity: 2000,
      edgeScore: 70,
      multiplier: 25,
      funded: 100000,
      profitSplit: 50,
      targetPct: 7,
      minDays: 60,
      minTrades: 50,
      leverage: '100:1',
      maxLossPct: 7,
    },
    {
      label: 'Pro',
      minEquity: 5000,
      edgeScore: 90,
      multiplier: 40,
      funded: 200000,
      profitSplit: 60,
      targetPct: 7,
      minDays: 60,
      minTrades: 50,
      leverage: '100:1',
      maxLossPct: 7,
    },
    {
      label: 'Pro 500',
      minEquity: 10000,
      edgeScore: 90,
      multiplier: 50,
      funded: 500000,
      profitSplit: 70,
      targetPct: 7,
      minDays: 60,
      minTrades: 50,
      leverage: '100:1',
      maxLossPct: 7,
    },
    {
      label: 'Pro M',
      minEquity: 20000,
      edgeScore: 90,
      multiplier: 50,
      funded: 1000000,
      profitSplit: 80,
      targetPct: 0, // N/A
      minDays: 0, // N/A
      minTrades: 0, // N/A
      leverage: '100:1',
      maxLossPct: 10,
    },
  ]
  return {
    type: 'axi',
    stages: stages.map((s, i) => defaultAxiStage(s, i)),
  }
}

export function rulesForType(type: 'cfd' | 'futures' | 'axi'): AccountRules {
  if (type === 'cfd') return defaultCfdRules()
  if (type === 'futures') return defaultFuturesRules()
  return defaultAxiRules()
}
