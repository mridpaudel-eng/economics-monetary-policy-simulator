import type { SimulationHorizon } from './types'

/**
 * All numeric calibration values and policy-control bounds for the model.
 * Expenditure components are normalised calibration values.
 */
export const MODEL_PARAMETERS = {
  controls: {
    bankRate: { minimum: 0, maximum: 10, step: 0.25, baseline: 3.75 },
    exchangeRateAdjustment: { minimum: -20, maximum: 20, step: 1, baseline: 0 },
    fiscalPolicyExpansion: { minimum: 0, maximum: 100, step: 1, baseline: 0 },
    horizon: { allowed: [4, 8, 12] as const, default: 12 as SimulationHorizon },
  },
  baseline: {
    inflation: 2.6,
    unemployment: 4.9,
    exchangeRate: 100,
    gdp: 100,
    potentialGdp: 100,
    consumption: 60,
    investment: 18,
    governmentSpending: 22,
    exports: 32,
    imports: 31,
  },
  coefficients: {
    consumptionInterestRateSensitivity: 0.005,
    investmentInterestRateSensitivity: 0.02,
    exchangeRatePerBankRatePoint: 2,
    exportsExchangeRateSensitivity: 0.005,
    importsExchangeRateSensitivity: 0.003,
    importsIncomeSensitivity: 0.3,
    governmentSpendingFiscalSensitivity: 0.002,
    unemploymentPerOutputGapPoint: -0.3,
  },
  inflation: {
    target: 2.0,
    targetAdjustment: 0.20,
    phillipsCurveCoefficient: 0.35,
    outputGapLagWeights: [
      { quarters: 3, weight: 0.29 },
      { quarters: 4, weight: 0.43 },
      { quarters: 5, weight: 0.29 },
    ],
  },
  transmissionSchedule: [0.1, 0.2, 0.35, 0.5, 0.65, 0.75, 0.85, 0.92, 0.96, 0.98, 0.99, 1],
} as const

export const BASELINE_AGGREGATE_DEMAND =
  MODEL_PARAMETERS.baseline.consumption +
  MODEL_PARAMETERS.baseline.investment +
  MODEL_PARAMETERS.baseline.governmentSpending +
  (MODEL_PARAMETERS.baseline.exports - MODEL_PARAMETERS.baseline.imports)
