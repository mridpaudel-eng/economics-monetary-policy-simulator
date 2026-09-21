/** A permitted number of quarters in one simulation run. */
export type SimulationHorizon = 4 | 8 | 12

/** Policy settings supplied to a scenario simulation. */
export interface SimulationInputs {
  bankRate: number
  exchangeRateAdjustment: number
  fiscalPolicyExpansion: number
  horizon: SimulationHorizon
}

/** The calculated economic indicators for a single simulated quarter. */
export interface QuarterlySimulationResult {
  quarter: number
  bankRate: number
  exchangeRate: number
  consumption: number
  investment: number
  governmentSpending: number
  exports: number
  imports: number
  aggregateDemand: number
  gdp: number
  outputGap: number
  inflation: number
  unemployment: number
}

/** A named set of quarterly observations produced from one set of inputs. */
export interface ScenarioSimulationResult {
  inputs: SimulationInputs
  quarters: QuarterlySimulationResult[]
}

/** The baseline and user-policy simulations for one common horizon. */
export interface CompleteSimulationResult {
  baseline: ScenarioSimulationResult
  scenario: ScenarioSimulationResult
  horizon: SimulationHorizon
}
