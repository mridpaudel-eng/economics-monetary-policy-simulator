import { BASELINE_AGGREGATE_DEMAND, MODEL_PARAMETERS } from './parameters'
import type {
  CompleteSimulationResult,
  QuarterlySimulationResult,
  ScenarioSimulationResult,
  SimulationHorizon,
  SimulationInputs,
} from './types'

const { baseline, coefficients, controls, inflation: inflationParameters, transmissionSchedule } = MODEL_PARAMETERS

/** The fixed controls used to construct the comparison scenario. */
export function createBaselineInputs(horizon: SimulationHorizon): SimulationInputs {
  return {
    bankRate: controls.bankRate.baseline,
    exchangeRateAdjustment: controls.exchangeRateAdjustment.baseline,
    fiscalPolicyExpansion: controls.fiscalPolicyExpansion.baseline,
    horizon,
  }
}

/** Runs the baseline and the supplied policy scenario over the requested horizon. */
export function runSimulation(inputs: SimulationInputs): CompleteSimulationResult {
  validateInputs(inputs)

  return {
    baseline: simulateScenario(createBaselineInputs(inputs.horizon)),
    scenario: simulateScenario(inputs),
    horizon: inputs.horizon,
  }
}

/** Runs a single scenario. This function is pure and has no UI dependencies. */
export function simulateScenario(inputs: SimulationInputs): ScenarioSimulationResult {
  validateInputs(inputs)

  const exchangeRate = calculateExchangeRate(inputs.bankRate, inputs.exchangeRateAdjustment)
  const consumption = calculateConsumption(inputs.bankRate)
  const investment = calculateInvestment(inputs.bankRate)
  const governmentSpending = calculateGovernmentSpending(inputs.fiscalPolicyExpansion)
  const exports = calculateExports(exchangeRate)
  const fullTransmissionGdp = calculateGdpAtTransmission(
    consumption,
    investment,
    governmentSpending,
    exports,
    exchangeRate,
    transmissionSchedule[transmissionSchedule.length - 1],
  )
  const fullTransmissionImports = calculateImports(exchangeRate, fullTransmissionGdp)
  const fullTransmissionAd = consumption + investment + governmentSpending + exports - fullTransmissionImports
  const adChange = (fullTransmissionAd - BASELINE_AGGREGATE_DEMAND) / BASELINE_AGGREGATE_DEMAND
  const fullOutputGap = adChange * 100
  const fullUnemploymentChange = coefficients.unemploymentPerOutputGapPoint * fullOutputGap

  const quarters: QuarterlySimulationResult[] = []
  let previousInflation: number = baseline.inflation

  for (let index = 0; index < inputs.horizon; index += 1) {
    const transmission = transmissionSchedule[index]
    const gdp = calculateGdpAtTransmission(
      consumption,
      investment,
      governmentSpending,
      exports,
      exchangeRate,
      transmission,
    )
    const imports = calculateImports(exchangeRate, gdp)
    const aggregateDemand = consumption + investment + governmentSpending + exports - imports
    const outputGap = ((gdp - baseline.potentialGdp) / baseline.potentialGdp) * 100
    const inflation = calculateInflation(previousInflation, quarters, index)

    quarters.push({
      quarter: index + 1,
      bankRate: inputs.bankRate,
      exchangeRate,
      consumption,
      investment,
      governmentSpending,
      exports,
      imports,
      aggregateDemand,
      gdp,
      outputGap,
      inflation,
      unemployment: baseline.unemployment + fullUnemploymentChange * transmission,
    })
    previousInflation = inflation
  }

  return { inputs: { ...inputs }, quarters }
}

export function calculateConsumption(bankRate: number): number {
  return baseline.consumption * (1 - coefficients.consumptionInterestRateSensitivity * (bankRate - controls.bankRate.baseline))
}

export function calculateInvestment(bankRate: number): number {
  return baseline.investment * (1 - coefficients.investmentInterestRateSensitivity * (bankRate - controls.bankRate.baseline))
}

export function calculateExchangeRate(bankRate: number, exchangeRateAdjustment: number): number {
  return Math.max(
    0,
    baseline.exchangeRate + coefficients.exchangeRatePerBankRatePoint * (bankRate - controls.bankRate.baseline) + exchangeRateAdjustment,
  )
}

export function calculateExports(exchangeRate: number): number {
  return baseline.exports * (1 - coefficients.exportsExchangeRateSensitivity * (exchangeRate - baseline.exchangeRate))
}

export function calculateImports(exchangeRate: number, gdp: number): number {
  return baseline.imports *
    (1 + coefficients.importsExchangeRateSensitivity * (exchangeRate - baseline.exchangeRate)) *
    (1 + coefficients.importsIncomeSensitivity * ((gdp - baseline.gdp) / baseline.gdp))
}

export function calculateGovernmentSpending(fiscalPolicyExpansion: number): number {
  return baseline.governmentSpending * (1 + coefficients.governmentSpendingFiscalSensitivity * fiscalPolicyExpansion)
}

/** Applies target adjustment and the specified distributed, quarterly output-gap lag. */
function calculateInflation(
  previousInflation: number,
  quarters: readonly QuarterlySimulationResult[],
  quarterIndex: number,
): number {
  const gapEffect = inflationParameters.outputGapLagWeights.reduce(
    (total, { quarters: lag, weight }) => total + weight * (quarters[quarterIndex - lag]?.outputGap ?? 0),
    0,
  )

  return previousInflation +
    inflationParameters.targetAdjustment * (inflationParameters.target - previousInflation) -
    inflationParameters.phillipsCurveCoefficient * gapEffect
}

/**
 * Solves the specified GDP/import relationship algebraically. Imports depend on
 * current GDP, and current GDP is itself determined by AD at this quarter's
 * transmission rate; no iterative rule or extra equation is introduced.
 */
function calculateGdpAtTransmission(
  consumption: number,
  investment: number,
  governmentSpending: number,
  exports: number,
  exchangeRate: number,
  transmission: number,
): number {
  const exchangeRateAdjustedImports = baseline.imports *
    (1 + coefficients.importsExchangeRateSensitivity * (exchangeRate - baseline.exchangeRate))
  const incomeCoefficient = coefficients.importsIncomeSensitivity / baseline.gdp
  const fixedDemand = consumption + investment + governmentSpending + exports
  const gdpFactor = (baseline.gdp * transmission) / BASELINE_AGGREGATE_DEMAND

  return (
    baseline.gdp + gdpFactor * (
      fixedDemand -
      (1 - coefficients.importsIncomeSensitivity) * exchangeRateAdjustedImports -
      BASELINE_AGGREGATE_DEMAND
    )
  ) / (1 + gdpFactor * exchangeRateAdjustedImports * incomeCoefficient)
}

function validateInputs(inputs: SimulationInputs): void {
  validateControl('bankRate', inputs.bankRate, controls.bankRate)
  validateControl('exchangeRateAdjustment', inputs.exchangeRateAdjustment, controls.exchangeRateAdjustment)
  validateControl('fiscalPolicyExpansion', inputs.fiscalPolicyExpansion, controls.fiscalPolicyExpansion)

  if (!controls.horizon.allowed.includes(inputs.horizon)) {
    throw new RangeError(`horizon must be one of: ${controls.horizon.allowed.join(', ')}`)
  }
}

function validateControl(
  name: string,
  value: number,
  bounds: { readonly minimum: number; readonly maximum: number; readonly step: number },
): void {
  const stepsFromMinimum = (value - bounds.minimum) / bounds.step
  if (!Number.isFinite(value) || value < bounds.minimum || value > bounds.maximum || !Number.isInteger(stepsFromMinimum)) {
    throw new RangeError(`${name} must be between ${bounds.minimum} and ${bounds.maximum} in increments of ${bounds.step}`)
  }
}
