import { useMemo, useState } from 'react'
import './App.css'
import { runSimulation } from './model/simulation'
import { MODEL_PARAMETERS } from './model/parameters'
import type { QuarterlySimulationResult, SimulationHorizon, SimulationInputs } from './model/types'

type MetricCardProps = { label: string; value: string; trend: string; direction?: 'up' | 'down' }

const HORIZONS: SimulationHorizon[] = [4, 8, 12]

type ChartMetric = 'gdp' | 'inflation' | 'consumption' | 'investment' | 'unemployment'
type ChartMetricConfig = { title: string; axisLabel: string; property: ChartMetric; suffix: string }

const CHART_METRICS: Record<ChartMetric, ChartMetricConfig> = {
  gdp: { title: 'GDP Over Time', axisLabel: 'GDP Index', property: 'gdp', suffix: '' },
  inflation: { title: 'Inflation Over Time', axisLabel: 'Inflation (%)', property: 'inflation', suffix: '%' },
  consumption: { title: 'Consumption Over Time', axisLabel: 'Consumption (index)', property: 'consumption', suffix: '' },
  investment: { title: 'Investment Over Time', axisLabel: 'Investment (index)', property: 'investment', suffix: '' },
  unemployment: { title: 'Unemployment Over Time', axisLabel: 'Unemployment (%)', property: 'unemployment', suffix: '%' },
}

type SimulationDiagramProps = {
  baselineGdp: number
  gdp: number
  potentialGdp: number
  outputGap: number
  quarter: number
}

const DIAGRAM_BOUNDS = { left: 64, right: 560, top: 36, bottom: 300 }
const OUTPUT_GAP_TOLERANCE = 0.05

// This only maps existing GDP results onto the SVG axis; it adds no model calculation.
function outputToDiagramX(gdp: number, potentialGdp: number): number {
  const { left, right } = DIAGRAM_BOUNDS
  const minimum = potentialGdp - 20
  const maximum = potentialGdp + 20
  const boundedGdp = Math.max(minimum, Math.min(maximum, gdp))
  return left + ((boundedGdp - minimum) / (maximum - minimum)) * (right - left)
}

function makeAdPath(equilibriumX: number, equilibriumY: number, slope = 0.34): string {
  const at = (x: number) => equilibriumY + slope * (x - equilibriumX)
  return `M ${DIAGRAM_BOUNDS.left} ${at(DIAGRAM_BOUNDS.left)} L ${DIAGRAM_BOUNDS.right} ${at(DIAGRAM_BOUNDS.right)}`
}

function getAdLabelPosition(equilibriumX: number, equilibriumY: number): { x: number; y: number } {
  const slope = 0.34
  const labelLineY = Math.min(equilibriumY + slope * (DIAGRAM_BOUNDS.right - equilibriumX), DIAGRAM_BOUNDS.bottom - 20)
  const lineX = equilibriumX + (labelLineY - equilibriumY) / slope
  return {
    x: Math.max(DIAGRAM_BOUNDS.left + 8, Math.min(DIAGRAM_BOUNDS.right - 28, lineX)),
    y: labelLineY - 12,
  }
}

function outputGapDescription(gdp: number, potentialGdp: number, outputGap: number): string {
  if (Math.abs(outputGap) <= OUTPUT_GAP_TOLERANCE) {
    return `Zero output gap · GDP ${formatValue(gdp)} is at potential output ${formatValue(potentialGdp)}.`
  }
  const direction = outputGap > 0 ? 'Positive' : 'Negative'
  return `${direction} output gap · GDP ${formatValue(gdp)} vs potential output ${formatValue(potentialGdp)} (${outputGap > 0 ? '+' : ''}${formatValue(outputGap)}%).`
}

type ComparisonMetric = 'gdp' | 'inflation' | 'consumption' | 'investment' | 'unemployment'
type SavedScenario = {
  inputs: SimulationInputs
  results: Pick<QuarterlySimulationResult, ComparisonMetric>
  quarter: number
}

const COMPARISON_METRICS: ReadonlyArray<{ label: string; property: ComparisonMetric; baseline: number; suffix: string }> = [
  { label: 'GDP', property: 'gdp', baseline: 100, suffix: '' },
  { label: 'Inflation', property: 'inflation', baseline: 2.6, suffix: '%' },
  { label: 'Consumption', property: 'consumption', baseline: 60, suffix: '' },
  { label: 'Investment', property: 'investment', baseline: 18, suffix: '' },
  { label: 'Unemployment', property: 'unemployment', baseline: 4.9, suffix: '%' },
]

const TRANSMISSION_STAGES = [
  {
    label: '01',
    title: 'Bank Rate',
    marker: 'BR',
    description: 'A change in the policy interest rate changes borrowing costs and the incentive to save or spend.',
  },
  {
    label: '02',
    title: 'Consumption & Investment',
    marker: 'C/I',
    description: 'Lower rates can support consumption and investment, while higher rates can reduce them. In this model, both are calculated from the selected Bank Rate and held constant within one simulation run.',
  },
  {
    label: '03',
    title: 'Aggregate Demand',
    marker: 'AD',
    description: 'Consumption, investment, government spending, exports and imports combine to determine aggregate demand.',
  },
  {
    label: '04',
    title: 'GDP / Output Gap',
    marker: 'GDP',
    description: 'The aggregate-demand effect is transmitted to GDP over time. Comparing GDP with potential output gives the output gap.',
  },
  {
    label: '05',
    title: 'Inflation & Unemployment',
    marker: 'π/U',
    description: 'The output gap then affects inflation with the model’s distributed lag, while unemployment phases in with the transmission schedule.',
  },
] as const

function MetricCard({ label, value, trend, direction = 'up' }: MetricCardProps) {
  return <article className="metric-card"><div className="metric-label-row"><span>{label}</span><span className={`trend ${direction}`}>{direction === 'up' ? '↑' : '↓'} {trend}</span></div><strong>{value}</strong><span className="metric-caption">Simulated value</span></article>
}

function PolicyControl({ label, description, value, min, max, step, suffix, onChange }: { label: string; description: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (value: number) => void }) {
  const id = label.toLowerCase().replaceAll(' ', '-')
  return <div className="policy-control"><div className="control-heading"><div><label htmlFor={id}>{label}</label><p>{description}</p></div><output htmlFor={id}>{value}{suffix}</output></div><input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label} /><div className="range-labels"><span>{min}{suffix}</span><span>{max}{suffix}</span></div></div>
}

function formatValue(value: number): string {
  return value.toFixed(2)
}

function formatChartValue(value: number, precision: number): string {
  return value.toFixed(precision)
}

function AggregateDemandSupplyDiagram({ baselineGdp, gdp, potentialGdp, outputGap, quarter }: SimulationDiagramProps) {
  const [aggregateDemandShift, setAggregateDemandShift] = useState(0)
  const [shortRunAggregateSupplyShift, setShortRunAggregateSupplyShift] = useState(0)
  const graph = DIAGRAM_BOUNDS
  const baselineX = outputToDiagramX(baselineGdp, potentialGdp)
  const potentialX = outputToDiagramX(potentialGdp, potentialGdp)
  const zeroGap = Math.abs(outputGap) <= OUTPUT_GAP_TOLERANCE
  const currentX = zeroGap ? potentialX : outputToDiagramX(gdp, potentialGdp)
  const sameOutput = Math.abs(gdp - baselineGdp) <= OUTPUT_GAP_TOLERANCE
  const srasSlope = -0.34
  const srasAt = (x: number) => 178 + srasSlope * (x - potentialX)
  const baselineY = srasAt(baselineX)
  const currentY = srasAt(currentX)
  const baselineAdAt = (x: number) => baselineY + 0.34 * (x - baselineX)
  const currentAdAt = (x: number) => currentY + 0.34 * (x - currentX)
  const baselineAdPath = makeAdPath(baselineX, baselineY)
  const currentAdPath = makeAdPath(currentX, currentY)
  const srasPath = `M ${graph.left} ${srasAt(graph.left)} L ${graph.right} ${srasAt(graph.right)}`
  const educationalAdX = Math.max(graph.left + 12, Math.min(graph.right - 12, currentX + aggregateDemandShift * 0.8))
  const educationalAdPath = makeAdPath(educationalAdX, srasAt(educationalAdX))
  const educationalSrasPath = `M ${graph.left} ${srasAt(graph.left) - shortRunAggregateSupplyShift * 0.8} L ${graph.right} ${srasAt(graph.right) - shortRunAggregateSupplyShift * 0.8}`
  const gapLeft = Math.min(potentialX, currentX)
  const gapWidth = Math.abs(currentX - potentialX)

  return <section className="adas-section" aria-labelledby="adas-title">
    <div className="adas-heading"><div><p className="eyebrow">Economic framework</p><h2 id="adas-title">Aggregate Demand and Supply</h2></div><p>Final applied result: Q{quarter}. The diagram positions output against fixed potential GDP.</p></div>
    <div className="adas-layout"><div className="adas-diagram"><svg viewBox="0 0 620 350" role="img" aria-label={`Educational AD–AS visualisation for Q${quarter}: GDP ${formatValue(gdp)}, potential output ${formatValue(potentialGdp)}; equilibrium follows applied simulation output.`}><line className="adas-axis" x1={graph.left} y1={graph.bottom} x2={graph.right + 18} y2={graph.bottom} /><line className="adas-axis" x1={graph.left} y1={graph.bottom} x2={graph.left} y2={graph.top - 14} /><text className="adas-axis-label" x="312" y="340">Real GDP</text><text className="adas-axis-label" transform="translate(18 190) rotate(-90)">Price Level</text><line className="adas-lras" x1={potentialX} y1={graph.top} x2={potentialX} y2={graph.bottom} /><path className="adas-sras" d={srasPath} /><path className="adas-ad ad-baseline" d={baselineAdPath} />{!sameOutput && <path className="adas-ad ad-current" d={currentAdPath} />}{aggregateDemandShift !== 0 && <path className="adas-ad ad-educational" d={educationalAdPath} />}{shortRunAggregateSupplyShift !== 0 && <path className="adas-sras sras-educational" d={educationalSrasPath} />}<line className="adas-guide" x1={currentX} y1={currentY} x2={currentX} y2={graph.bottom} /><rect className="output-gap-band" x={gapLeft} y={graph.bottom - 12} width={gapWidth} height="7" visibility={zeroGap ? 'hidden' : 'visible'} /><circle className="adas-equilibrium baseline-equilibrium" cx={baselineX} cy={baselineY} r="4" />{!sameOutput && <circle className="adas-equilibrium current-equilibrium" cx={currentX} cy={currentY} r="4" />}<text className="adas-curve-label adas-lras-label" x={potentialX + 8} y={graph.top + 16}>LRAS</text><text className="adas-curve-label adas-sras-label" x={graph.right - 42} y={srasAt(graph.right) - 8}>SRAS</text>{sameOutput ? <text className="adas-curve-label adas-ad-label" x={graph.right - 72} y={currentAdAt(graph.right) - 8}>AD₀ = AD₁</text> : <><text className="adas-curve-label ad-baseline-label" x={graph.right - 34} y={baselineAdAt(graph.right) - 13}>AD₀</text><text className="adas-curve-label ad-current-label" x={graph.right - 34} y={currentAdAt(graph.right) + 18}>AD₁</text></>}{sameOutput ? <text className="adas-equilibrium-label" x={baselineX + 9} y={baselineY + 21}>E₀ = E₁</text> : <><text className="adas-equilibrium-label baseline-label" x={baselineX - 22} y={baselineY - 12}>E₀</text><text className="adas-equilibrium-label current-label" x={currentX + 10} y={currentY + 21}>E₁</text></>}<circle className="actual-output-point" cx={currentX} cy={graph.bottom} r="3" /><text className="adas-tick-label" textAnchor="middle" x={potentialX} y={graph.bottom + 17}>Potential output (Yp={formatValue(potentialGdp)})</text>{!zeroGap && <text className="adas-tick-label" textAnchor={currentX < potentialX ? 'end' : 'start'} x={currentX + (currentX < potentialX ? -5 : 5)} y={graph.bottom - 18}>Current GDP</text>}{(aggregateDemandShift !== 0 || shortRunAggregateSupplyShift !== 0) && <text className="educational-curves-label" x={graph.left + 10} y={graph.top + 12}>Dashed curves: educational shifts</text>}</svg></div><aside className="adas-key"><div><span className="adas-key-swatch ad baseline" /> AD₀ baseline</div><div><span className="adas-key-swatch ad current" /> AD₁ current simulation</div><div><span className="adas-key-swatch sras" /> SRAS</div><div><span className="adas-key-swatch lras" /> LRAS / potential output</div></aside></div>
    <p className={`diagram-gap-summary ${outputGap > OUTPUT_GAP_TOLERANCE ? 'positive' : outputGap < -OUTPUT_GAP_TOLERANCE ? 'negative' : 'neutral'}`}>{outputGapDescription(gdp, potentialGdp, outputGap)}</p>
    <div className="adas-controls"><label><span><strong>Aggregate Demand (AD)</strong><output>{aggregateDemandShift > 0 ? '+' : ''}{aggregateDemandShift}</output></span><input type="range" min="-24" max="24" step="1" value={aggregateDemandShift} onChange={(event) => setAggregateDemandShift(Number(event.target.value))} aria-label="Aggregate Demand shift" /><small>−24 <span>0</span> +24</small></label><label><span><strong>Short-Run Aggregate Supply (SRAS)</strong><output>{shortRunAggregateSupplyShift > 0 ? '+' : ''}{shortRunAggregateSupplyShift}</output></span><input type="range" min="-24" max="24" step="1" value={shortRunAggregateSupplyShift} onChange={(event) => setShortRunAggregateSupplyShift(Number(event.target.value))} aria-label="Short-Run Aggregate Supply shift" /><small>−24 <span>0</span> +24</small></label></div>
    <p className="adas-control-note"><span>i</span> These sliders add dashed, illustrative AD or SRAS shifts. They do not move the applied-simulation equilibria or change simulator results.</p>
    <div className="adas-explanation"><p><strong>Policy and demand.</strong> The baseline-to-current AD shift is anchored to the simulated change in GDP output.</p><p><strong>Output gap.</strong> The shaded distance compares the final-quarter GDP result with potential GDP from the model.</p><p><strong>Reference curves.</strong> E₀ uses the baseline result; E₁ uses the final quarter of the applied horizon. LRAS stays at potential output.</p><p><strong>Educational visualisation.</strong> Curve positions illustrate simulated demand and equilibrium changes; they are not estimated AD/AS equations. The locked model does not calculate a separate price-level index.</p></div>
  </section>
}

function KeynesianAggregateSupplyDiagram({ baselineGdp, gdp, potentialGdp, outputGap, quarter }: SimulationDiagramProps) {
  const [adShift, setAdShift] = useState(0)
  const [asShift, setAsShift] = useState(0)
  const graph = DIAGRAM_BOUNDS
  const potentialOutputX = outputToDiagramX(potentialGdp, potentialGdp)
  const baselineX = outputToDiagramX(baselineGdp, potentialGdp)
  const actualOutputX = outputToDiagramX(gdp, potentialGdp)
  const zeroGap = Math.abs(outputGap) <= OUTPUT_GAP_TOLERANCE
  const sameOutput = Math.abs(gdp - baselineGdp) <= OUTPUT_GAP_TOLERANCE
  const flatY = 244
  const kinkX = outputToDiagramX(potentialGdp - 8, potentialGdp)
  const fullEmploymentY = 142
  const asPath = `M ${graph.left} ${flatY} H ${kinkX} L ${potentialOutputX} ${fullEmploymentY} V ${graph.top}`
  const asAtOutputX = (x: number) => x <= kinkX
    ? flatY
    : fullEmploymentY + ((potentialOutputX - x) / (potentialOutputX - kinkX)) * (flatY - fullEmploymentY)
  const baselineY = baselineGdp >= potentialGdp ? 100 : asAtOutputX(baselineX)
  const equilibriumX = gdp >= potentialGdp ? potentialOutputX : (zeroGap ? potentialOutputX : actualOutputX)
  // Above capacity, E₁ stays on the fixed vertical AS section; actual GDP remains separately marked.
  const equilibriumY = zeroGap
    ? baselineY
    : gdp > potentialGdp
      ? Math.max(graph.top + 8, baselineY - (gdp - potentialGdp) * 6)
      : asAtOutputX(equilibriumX)
  const baselineAdPath = makeAdPath(baselineX, baselineY)
  const currentAdPath = makeAdPath(equilibriumX, equilibriumY)
  const educationalAdX = Math.max(graph.left + 12, Math.min(graph.right - 12, equilibriumX + adShift * 0.8))
  const educationalAdPath = makeAdPath(educationalAdX, equilibriumY)
  const asShiftOffset = asShift * 0.8
  const educationalAsPath = `M ${graph.left + asShiftOffset} ${flatY} H ${kinkX + asShiftOffset} L ${potentialOutputX + asShiftOffset} ${fullEmploymentY} V ${graph.top}`
  const gapLeft = Math.min(potentialOutputX, actualOutputX)
  const gapWidth = Math.abs(actualOutputX - potentialOutputX)
  const baselineAdAtRight = baselineY + 0.34 * (graph.right - baselineX)
  const currentAdAtRight = equilibriumY + 0.34 * (graph.right - equilibriumX)

  return <section className="keynesian-section" aria-labelledby="keynesian-title">
    <div className="keynesian-heading"><div><p className="eyebrow">Economic framework</p><h2 id="keynesian-title">Keynesian Aggregate Supply</h2></div><p>Final applied result: Q{quarter}. AD positions follow simulated output; Keynesian AS stays fixed at potential GDP.</p></div>
    <div className="keynesian-layout"><div className="keynesian-diagram"><svg viewBox="0 0 620 350" role="img" aria-label={`Educational Keynesian AS visualisation for Q${quarter}: GDP ${formatValue(gdp)}, potential output ${formatValue(potentialGdp)}; AS remains fixed.`}><line className="keynesian-axis" x1={graph.left} y1={graph.bottom} x2={graph.right + 18} y2={graph.bottom} /><line className="keynesian-axis" x1={graph.left} y1={graph.bottom} x2={graph.left} y2={graph.top - 14} /><text className="keynesian-axis-label" x="312" y="340">Real GDP</text><text className="keynesian-axis-label" transform="translate(18 190) rotate(-90)">Price Level</text><path className="keynesian-as" d={asPath} /><path className="keynesian-ad ad-baseline" d={baselineAdPath} />{!sameOutput && <path className="keynesian-ad ad-current" d={currentAdPath} />}{adShift !== 0 && <path className="keynesian-ad ad-educational" d={educationalAdPath} />}{asShift !== 0 && <path className="keynesian-as as-educational" d={educationalAsPath} />}<line className="keynesian-guide" x1={actualOutputX} y1={graph.bottom - 12} x2={actualOutputX} y2={graph.bottom} /><rect className="output-gap-band" x={gapLeft} y={graph.bottom - 12} width={gapWidth} height="7" visibility={zeroGap ? 'hidden' : 'visible'} /><circle className="keynesian-equilibrium baseline-equilibrium" cx={baselineX} cy={baselineY} r="4" />{!sameOutput && <circle className="keynesian-equilibrium current-equilibrium" cx={equilibriumX} cy={equilibriumY} r="4" />}<text className="keynesian-label keynesian-as-label" x={potentialOutputX + 9} y="72">AS</text>{sameOutput ? <text className="keynesian-label keynesian-ad-label" x={graph.right - 72} y={baselineAdAtRight - 8}>AD₀ = AD₁</text> : <><text className="keynesian-label ad-baseline-label" x={graph.right - 30} y={baselineAdAtRight - 14}>AD₀</text><text className="keynesian-label ad-current-label" x={graph.right - 30} y={currentAdAtRight + 18}>AD₁</text></>}{sameOutput ? <text className="keynesian-equilibrium-label" x={baselineX + 10} y={baselineY + 20}>E₀ = E₁</text> : <><text className="keynesian-equilibrium-label baseline-label" x={baselineX - 22} y={baselineY - 12}>E₀</text><text className="keynesian-equilibrium-label current-label" x={equilibriumX + 10} y={equilibriumY + 21}>E₁</text></>}<circle className="actual-output-point" cx={actualOutputX} cy={graph.bottom} r="3" /><text className="keynesian-tick-label" textAnchor="middle" x={potentialOutputX} y={graph.bottom + 17}>Potential output (Yp={formatValue(potentialGdp)})</text>{!zeroGap && <text className="keynesian-tick-label" textAnchor={actualOutputX < potentialOutputX ? 'end' : 'start'} x={actualOutputX + (actualOutputX < potentialOutputX ? -5 : 5)} y={graph.bottom - 18}>Current GDP</text>}{(adShift !== 0 || asShift !== 0) && <text className="educational-curves-label" x={graph.left + 10} y={graph.top + 12}>Dashed curves: educational shifts</text>}</svg></div></div>
    <p className={`diagram-gap-summary ${outputGap > OUTPUT_GAP_TOLERANCE ? 'positive' : outputGap < -OUTPUT_GAP_TOLERANCE ? 'negative' : 'neutral'}`}>{outputGapDescription(gdp, potentialGdp, outputGap)}</p>
    <div className="keynesian-controls" aria-label="Keynesian diagram educational controls"><label><span>Aggregate Demand (AD)</span><output>{adShift > 0 ? '+' : ''}{adShift}</output><input type="range" min="-24" max="24" step="1" value={adShift} onChange={(event) => setAdShift(Number(event.target.value))} aria-label="Aggregate Demand shift" /><small>−24</small><small>+24</small></label><label><span>Keynesian Aggregate Supply (AS)</span><output>{asShift > 0 ? '+' : ''}{asShift}</output><input type="range" min="-24" max="24" step="1" value={asShift} onChange={(event) => setAsShift(Number(event.target.value))} aria-label="Keynesian Aggregate Supply shift" /><small>−24</small><small>+24</small></label></div><p className="keynesian-control-note"><span>i</span> Dashed slider curves are illustrative only. They do not move E₀/E₁, the model-based output markers, or the fixed Keynesian AS curve.</p>
    <div className="keynesian-explanation"><article><span>1</span><h3>Horizontal section</h3><p>With substantial spare capacity, increases in AD mainly raise real output, with little pressure on the price level.</p></article><article><span>2</span><h3>Upward-sloping section</h3><p>As spare capacity becomes limited, higher AD raises both real output and price-level pressure.</p></article><article><span>3</span><h3>Vertical section</h3><p>At or near full capacity, further increases in AD mainly create inflationary pressure rather than higher real output.</p></article></div>
    <p className="keynesian-comparison"><strong>Comparison with the classical model:</strong> Classical LRAS is vertical at potential output. The Keynesian model instead changes the shape of aggregate supply according to the amount of spare capacity.</p>
  </section>
}

function ScenarioComparison({ finalQuarter }: { finalQuarter: QuarterlySimulationResult }) {
  return <section className="comparison-section" aria-labelledby="comparison-title">
    <div className="comparison-heading"><div><p className="eyebrow">Scenario review</p><h2 id="comparison-title">Baseline vs Current Simulation</h2></div><p>Final quarter: <strong>Q{finalQuarter.quarter}</strong></p></div>
    <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">Current simulation</th><th scope="col">Absolute change</th><th scope="col">Direction</th></tr></thead><tbody>{COMPARISON_METRICS.map((metric) => {
      const currentValue = finalQuarter[metric.property]
      const difference = currentValue - metric.baseline
      const direction = difference > 0 ? '↑' : difference < 0 ? '↓' : '—'

      return <tr key={metric.property}><th scope="row">{metric.label}</th><td>{formatValue(metric.baseline)}{metric.suffix}</td><td>{formatValue(currentValue)}{metric.suffix}</td><td>{formatValue(Math.abs(difference))}{metric.suffix}</td><td><span className={`comparison-direction ${difference > 0 ? 'up' : difference < 0 ? 'down' : 'neutral'}`}>{direction}</span></td></tr>
    })}</tbody></table></div>
    <p className="comparison-note"><span>i</span> The Current simulation column uses the final quarter of the last result generated with Run Simulation. Adjusting policy controls does not change this comparison until you run a new simulation.</p>
    <p className="comparison-inflation-note">Note: Baseline inflation represents the model&apos;s initial 2.6% calibration. Current inflation represents the final quarter of the selected simulation horizon, so inflation may differ even when other baseline conditions remain unchanged.</p>
  </section>
}

function SavedScenarioComparison({ saved, currentInputs, currentQuarter, onClear }: { saved: SavedScenario | null; currentInputs: SimulationInputs; currentQuarter: QuarterlySimulationResult; onClear: () => void }) {
  return <section className="comparison-section saved-comparison-section" aria-labelledby="saved-comparison-title">
    <div className="comparison-heading"><div><p className="eyebrow">Scenario review</p><h2 id="saved-comparison-title">Saved Scenario vs Current Simulation</h2></div>{saved && <button className="secondary-button" type="button" onClick={onClear}>Clear Saved Scenario</button>}</div>
    {!saved ? <p className="saved-empty-state">No scenario saved yet. Run a simulation, then save it to compare scenarios.</p> : <>
      <h3 className="saved-subheading">Policy inputs</h3>
      <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th scope="col">Input</th><th scope="col">Saved scenario</th><th scope="col">Current simulation</th></tr></thead><tbody>
        <tr><th scope="row">Bank Rate</th><td>{formatValue(saved.inputs.bankRate)}%</td><td>{formatValue(currentInputs.bankRate)}%</td></tr>
        <tr><th scope="row">Exchange Rate Adjustment</th><td>{formatValue(saved.inputs.exchangeRateAdjustment)}</td><td>{formatValue(currentInputs.exchangeRateAdjustment)}</td></tr>
        <tr><th scope="row">Fiscal Policy Expansion</th><td>{formatValue(saved.inputs.fiscalPolicyExpansion)}</td><td>{formatValue(currentInputs.fiscalPolicyExpansion)}</td></tr>
        <tr><th scope="row">Horizon</th><td>{saved.inputs.horizon} quarters</td><td>{currentInputs.horizon} quarters</td></tr>
      </tbody></table></div>
      <h3 className="saved-subheading">Final-quarter results <span>Saved Q{saved.quarter} · Current Q{currentQuarter.quarter}</span></h3>
      <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th scope="col">Metric</th><th scope="col">Saved scenario</th><th scope="col">Current simulation</th><th scope="col">Absolute difference</th><th scope="col">Direction</th></tr></thead><tbody>{COMPARISON_METRICS.map((metric) => {
        const savedValue = saved.results[metric.property]
        const currentValue = currentQuarter[metric.property]
        const difference = currentValue - savedValue
        const direction = difference > 0 ? '↑' : difference < 0 ? '↓' : '—'
        return <tr key={metric.property}><th scope="row">{metric.label}</th><td>{formatValue(savedValue)}{metric.suffix}</td><td>{formatValue(currentValue)}{metric.suffix}</td><td>{formatValue(Math.abs(difference))}{metric.suffix}</td><td><span className={`comparison-direction ${difference > 0 ? 'up' : difference < 0 ? 'down' : 'neutral'}`}>{direction}</span></td></tr>
      })}</tbody></table></div>
    </>}
  </section>
}

function App() {
  const [bankRate, setBankRate] = useState(3.75)
  const [exchangeRateAdjustment, setExchangeRateAdjustment] = useState(0)
  const [fiscalPolicyExpansion, setFiscalPolicyExpansion] = useState(0)
  const [horizon, setHorizon] = useState<SimulationHorizon>(12)
  const [appliedInputs, setAppliedInputs] = useState<SimulationInputs>({
    bankRate: 3.75,
    exchangeRateAdjustment: 0,
    fiscalPolicyExpansion: 0,
    horizon: 12,
  })
  const [savedScenario, setSavedScenario] = useState<SavedScenario | null>(null)
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  const [chartMetric, setChartMetric] = useState<ChartMetric>('gdp')

  // Both diagram reference and current results come from the applied simulation state.
  const simulationResult = useMemo(
    () => runSimulation(appliedInputs),
    [appliedInputs],
  )

  const quarterlyResults = simulationResult.scenario.quarters
  const finalQuarter = quarterlyResults[quarterlyResults.length - 1]
  const baselineFinalQuarter = simulationResult.baseline.quarters[simulationResult.baseline.quarters.length - 1]
  const potentialGdp = MODEL_PARAMETERS.baseline.potentialGdp
  const firstQuarter = quarterlyResults[0]
  const selectedChartMetric = CHART_METRICS[chartMetric]
  const chartValues = useMemo(
    () => quarterlyResults.map((quarter) => quarter[selectedChartMetric.property]),
    [quarterlyResults, selectedChartMetric.property],
  )
  const chartGeometry = useMemo(() => {
    const lowestValue = Math.min(...chartValues)
    const highestValue = Math.max(...chartValues)
    const includesBaseline = {
      minimum: chartMetric === 'gdp' ? Math.min(lowestValue, 100) : lowestValue,
      maximum: chartMetric === 'gdp' ? Math.max(highestValue, 100) : highestValue,
    }
    const dataRange = includesBaseline.maximum - includesBaseline.minimum
    const isFlatSeries = dataRange === 0
    const flatSeriesPadding = chartMetric === 'gdp'
      ? 0.5
      : Math.max(Math.abs(includesBaseline.minimum) * 0.01, 0.05)
    const axisPadding = isFlatSeries ? flatSeriesPadding : dataRange * 0.15
    const chartMinimum = includesBaseline.minimum - axisPadding
    const chartMaximum = includesBaseline.maximum + axisPadding
    const chartRange = chartMaximum - chartMinimum
    const points = chartValues.map((value, index) => {
      const x = (index / (quarterlyResults.length - 1)) * 720
      const y = 245 - ((value - chartMinimum) / chartRange) * 220
      return { x, y }
    })
    const line = `M ${points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ')}`

    return {
      chartMinimum,
      chartMaximum,
      chartRange,
      precision: dataRange < 0.001 ? 6 : dataRange < 0.01 ? 4 : dataRange < 0.1 ? 3 : 2,
      points,
      line,
      area: `${line} L 720,245 L 0,245 Z`,
    }
  }, [chartMetric, chartValues, quarterlyResults.length])
  const { chartMinimum, chartMaximum, chartRange, precision: chartPrecision, points: chartPoints, line: chartLine, area: chartArea } = chartGeometry
  const chartLabels = quarterlyResults.map((_, index) => index)
  const metricQuarter = `Q${finalQuarter.quarter}`
  const activePoint = hoveredPoint === null ? null : chartPoints[hoveredPoint]
  const activeQuarter = hoveredPoint === null ? null : quarterlyResults[hoveredPoint]
  const chartSeriesKey = `${chartMetric}-${appliedInputs.bankRate}-${appliedInputs.exchangeRateAdjustment}-${appliedInputs.fiscalPolicyExpansion}-${appliedInputs.horizon}`

  function runSelectedSimulation() {
    setHoveredPoint(null)
    setAppliedInputs({ bankRate, exchangeRateAdjustment, fiscalPolicyExpansion, horizon })
  }

  function saveCurrentScenario() {
    setSavedScenario({
      inputs: { ...appliedInputs },
      results: {
        gdp: finalQuarter.gdp,
        inflation: finalQuarter.inflation,
        consumption: finalQuarter.consumption,
        investment: finalQuarter.investment,
        unemployment: finalQuarter.unemployment,
      },
      quarter: finalQuarter.quarter,
    })
  }

  function selectChartMetric(metric: ChartMetric) {
    setHoveredPoint(null)
    setChartMetric(metric)
  }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#dashboard" aria-label="Monetary Policy Simulator home"><span className="brand-mark">M</span><span>MACRO<span>LAB</span></span></a><div className="topbar-meta"><span className="status-dot" /> Model connected <span className="divider" /> Academic edition</div></header>
    <section className="page-heading" id="dashboard"><div><p className="eyebrow">Policy laboratory</p><h1>Monetary Policy Simulator</h1><p className="subtitle">Explore how changes to monetary and fiscal policy could shape the wider economy.</p></div><div className="period-card"><span>Simulation horizon</span><strong>Q1 — Q{appliedInputs.horizon}</strong></div></section>
    <section className="dashboard-layout" aria-label="Monetary policy dashboard">
      <aside className="policy-panel"><div className="panel-title"><div><p className="eyebrow">Inputs</p><h2>Policy settings</h2></div><span className="panel-icon" aria-hidden="true">⌘</span></div><p className="panel-intro">Adjust the model inputs to generate a user scenario. Results use the locked economic model.</p><div className="controls">
        <PolicyControl label="Bank Rate" description="Central bank policy rate" value={bankRate} min={0} max={10} step={0.25} suffix="%" onChange={setBankRate} />
        <PolicyControl label="Exchange Rate Adjustment" description="Additional sterling depreciation or appreciation" value={exchangeRateAdjustment} min={-20} max={20} step={1} suffix="" onChange={setExchangeRateAdjustment} />
        <PolicyControl label="Fiscal Policy Expansion" description="Additional government spending policy setting" value={fiscalPolicyExpansion} min={0} max={100} step={1} suffix="" onChange={setFiscalPolicyExpansion} />
        <div className="policy-control"><div className="control-heading"><div><label htmlFor="horizon">Simulation Horizon</label><p>Number of quarters to simulate</p></div><output htmlFor="horizon">{horizon} quarters</output></div><select id="horizon" className="horizon-select" value={horizon} onChange={(event) => setHorizon(Number(event.target.value) as SimulationHorizon)} aria-label="Simulation Horizon">{HORIZONS.map((option) => <option key={option} value={option}>{option} quarters</option>)}</select></div>
      </div><button className="run-button" type="button" onClick={runSelectedSimulation}>Run Simulation</button><button className="secondary-button save-scenario-button" type="button" onClick={saveCurrentScenario}>Save Current Scenario</button><div className="policy-note"><span>i</span><p>Results update when you run the selected user scenario.</p></div></aside>
      <div className="results-area"><div className="results-heading"><div><p className="eyebrow">Overview</p><h2>Economic outlook</h2></div><span className="scenario-pill">User scenario</span></div><div className="metrics-grid">
        <MetricCard label="GDP" value={formatValue(finalQuarter.gdp)} trend={metricQuarter} />
        <MetricCard label="Inflation" value={`${formatValue(finalQuarter.inflation)}%`} trend={metricQuarter} direction={finalQuarter.inflation >= firstQuarter.inflation ? 'up' : 'down'} />
        <MetricCard label="Consumption" value={formatValue(finalQuarter.consumption)} trend={metricQuarter} />
        <MetricCard label="Investment" value={formatValue(finalQuarter.investment)} trend={metricQuarter} />
        <MetricCard label="Unemployment" value={`${formatValue(finalQuarter.unemployment)}%`} trend={metricQuarter} direction={finalQuarter.unemployment >= firstQuarter.unemployment ? 'up' : 'down'} />
      </div>
        <section className="chart-card" aria-labelledby="output-title"><div className="chart-header"><div><p className="eyebrow">Projection</p><h2 id="output-title">{selectedChartMetric.title}</h2></div><label className="chart-selector">Metric<select value={chartMetric} onChange={(event) => selectChartMetric(event.target.value as ChartMetric)} aria-label="Chart metric">{(Object.keys(CHART_METRICS) as ChartMetric[]).map((metric) => <option key={metric} value={metric}>{metric[0].toUpperCase()}{metric.slice(1)}</option>)}</select></label></div><div className="chart-placeholder"><div className="chart-y-labels" aria-label={`${selectedChartMetric.axisLabel} axis`}><span>{formatChartValue(chartMaximum, chartPrecision)}{selectedChartMetric.suffix}</span><span>{formatChartValue(chartMaximum - chartRange / 3, chartPrecision)}{selectedChartMetric.suffix}</span><span>{formatChartValue(chartMinimum + chartRange / 3, chartPrecision)}{selectedChartMetric.suffix}</span><span>{formatChartValue(chartMinimum, chartPrecision)}{selectedChartMetric.suffix}</span></div><div className="chart-grid"><svg key={chartSeriesKey} viewBox="0 0 720 245" preserveAspectRatio="none" role="img" aria-label={`Interactive quarterly ${selectedChartMetric.axisLabel} chart`}><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2e8276" stopOpacity=".27" /><stop offset="100%" stopColor="#2e8276" stopOpacity="0" /></linearGradient></defs><path className="area" d={chartArea} /><path className="line" d={chartLine} />{chartPoints.map(({ x, y }, index) => <circle className="chart-point" data-active={hoveredPoint === index} key={index} cx={x} cy={y} r={hoveredPoint === index ? 7 : 4} tabIndex={0} aria-label={`Q${index + 1}, ${selectedChartMetric.axisLabel} ${formatChartValue(quarterlyResults[index][selectedChartMetric.property], chartPrecision)}${selectedChartMetric.suffix}`} onMouseEnter={() => setHoveredPoint(index)} onMouseLeave={() => setHoveredPoint(null)} onFocus={() => setHoveredPoint(index)} onBlur={() => setHoveredPoint(null)}><title>Q{index + 1}: {selectedChartMetric.axisLabel} {formatChartValue(quarterlyResults[index][selectedChartMetric.property], chartPrecision)}{selectedChartMetric.suffix}</title></circle>)}{activePoint && activeQuarter && <g className="chart-tooltip" pointerEvents="none"><rect x={Math.max(8, Math.min(activePoint.x - 74, 564))} y={activePoint.y < 44 ? activePoint.y + 10 : activePoint.y - 42} width="148" height="32" rx="3" /><text x={Math.max(8, Math.min(activePoint.x - 74, 564)) + 8} y={activePoint.y < 44 ? activePoint.y + 23 : activePoint.y - 29}>Q{activeQuarter.quarter} · {formatChartValue(activeQuarter[selectedChartMetric.property], chartPrecision)}{selectedChartMetric.suffix}</text></g>}</svg><div className="chart-x-labels">{chartLabels.map((index) => <span key={index}>Q{index + 1}</span>)}</div></div></div><div className="chart-footer"><span>Hover a data point to inspect its quarterly value.</span><strong>{selectedChartMetric.axisLabel}</strong></div></section>
      </div>
    </section>
    <section className="transmission-section" aria-labelledby="transmission-title">
      <div className="transmission-heading"><div><p className="eyebrow">How the model works</p><h2 id="transmission-title">Monetary Policy Transmission Mechanism</h2></div><p>Follow the simplified channels used by this simulator from a policy-rate decision to the wider economy.</p></div>
      <div className="transmission-chain">
        {TRANSMISSION_STAGES.map((stage, index) => <div className="transmission-step" key={stage.title}><article className="transmission-card"><div className="transmission-card-top"><span className="transmission-number">{stage.label}</span><span className="transmission-marker">{stage.marker}</span></div><h3>{stage.title}</h3><p>{stage.description}</p></article>{index < TRANSMISSION_STAGES.length - 1 && <div className="transmission-arrow" aria-hidden="true">↓</div>}</div>)}
      </div>
      <p className="transmission-note"><span>i</span> This section explains the locked model’s existing channels; it does not add another economic calculation.</p>
    </section>
    <AggregateDemandSupplyDiagram baselineGdp={baselineFinalQuarter.gdp} gdp={finalQuarter.gdp} potentialGdp={potentialGdp} outputGap={finalQuarter.outputGap} quarter={finalQuarter.quarter} />
    <KeynesianAggregateSupplyDiagram baselineGdp={baselineFinalQuarter.gdp} gdp={finalQuarter.gdp} potentialGdp={potentialGdp} outputGap={finalQuarter.outputGap} quarter={finalQuarter.quarter} />
    <ScenarioComparison finalQuarter={finalQuarter} />
    <SavedScenarioComparison saved={savedScenario} currentInputs={appliedInputs} currentQuarter={finalQuarter} onClear={() => setSavedScenario(null)} />
  </main>
}

export default App
