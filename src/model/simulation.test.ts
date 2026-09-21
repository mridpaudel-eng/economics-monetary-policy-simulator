import { BASELINE_AGGREGATE_DEMAND, MODEL_PARAMETERS } from './parameters'
import { createBaselineInputs, runSimulation, simulateScenario } from './simulation'

function assertEqual(actual: number, expected: number, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`)
}

function assertClose(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 1e-10) throw new Error(`${message}: expected ${expected}, received ${actual}`)
}

// Kept framework-free so this file remains a lightweight deterministic core check.
const baseline = simulateScenario(createBaselineInputs(12))
assertEqual(BASELINE_AGGREGATE_DEMAND, 101, 'baseline aggregate demand')
assertEqual(baseline.quarters.length, 12, 'selected horizon')
assertClose(baseline.quarters[0].gdp, 100, 'baseline GDP')
assertClose(baseline.quarters[0].inflation, 2.48, 'Q1 inflation target adjustment')
assertClose(baseline.quarters[1].inflation, 2.384, 'Q2 inflation target adjustment')

const scenario = runSimulation({ bankRate: 2.75, exchangeRateAdjustment: -3, fiscalPolicyExpansion: 50, horizon: 12 })
assertEqual(scenario.scenario.quarters[0].exchangeRate, 95, 'exchange-rate adjustment')
assertClose(
  scenario.scenario.quarters[0].governmentSpending,
  22 * 1.1,
  'government-spending fiscal expansion',
)
assertClose(
  scenario.scenario.quarters[0].unemployment,
  MODEL_PARAMETERS.baseline.unemployment +
    (-0.3 * (((scenario.scenario.quarters[11].gdp - 100) / 100) * 100)) * 0.1,
  'unemployment is phased from the full effect',
)

const inflationScenario = simulateScenario({ bankRate: 2.75, exchangeRateAdjustment: 0, fiscalPolicyExpansion: 0, horizon: 12 })
const { inflation } = MODEL_PARAMETERS
const q6WeightedGap = inflation.outputGapLagWeights.reduce(
  (total, { quarters: lag, weight }) => total + weight * inflationScenario.quarters[5 - lag].outputGap,
  0,
)
assertClose(
  inflationScenario.quarters[5].inflation,
  inflationScenario.quarters[4].inflation +
    inflation.targetAdjustment * (inflation.target - inflationScenario.quarters[4].inflation) -
    inflation.phillipsCurveCoefficient * q6WeightedGap,
  'distributed output-gap lag and inflation equation',
)
