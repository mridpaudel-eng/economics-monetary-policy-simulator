import { useMemo, useState } from 'react'
import './App.css'
import { runSimulation } from './model/simulation'
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

type ComparisonMetric = 'gdp' | 'inflation' | 'consumption' | 'investment' | 'unemployment'

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

function AggregateDemandSupplyDiagram({ gdp, inflation, quarter }: { gdp: number; inflation: number; quarter: number }) {
  const [aggregateDemandShift, setAggregateDemandShift] = useState(0)
  const [shortRunAggregateSupplyShift, setShortRunAggregateSupplyShift] = useState(0)
  const graph = { left: 64, right: 560, top: 36, bottom: 300 }
  const potentialOutput = 100
  const baseEquilibriumX = Math.max(graph.left + 24, Math.min(graph.right - 24, graph.left + ((gdp - 94) / 12) * (graph.right - graph.left)))
  const baseEquilibriumY = Math.max(graph.top + 100, Math.min(graph.bottom - 100, graph.bottom - ((inflation + 2) / 10) * (graph.bottom - graph.top)))
  const lrasX = graph.left + ((potentialOutput - 94) / 12) * (graph.right - graph.left)
  const adSlope = 0.36
  const srasSlope = -0.38
  const shiftScale = 0.8
  const adOffset = -aggregateDemandShift * shiftScale
  const srasOffset = shortRunAggregateSupplyShift * shiftScale
  const equilibriumX = Math.max(graph.left + 24, Math.min(graph.right - 24, baseEquilibriumX + (srasOffset - adOffset) / (adSlope - srasSlope)))
  const equilibriumY = baseEquilibriumY + adOffset + adSlope * (equilibriumX - baseEquilibriumX)
  const adAt = (x: number) => baseEquilibriumY + adOffset + adSlope * (x - baseEquilibriumX)
  const srasAt = (x: number) => baseEquilibriumY + srasOffset + srasSlope * (x - baseEquilibriumX)
  const adPath = `M ${graph.left} ${adAt(graph.left)} Q ${(graph.left + equilibriumX) / 2} ${(adAt(graph.left) + equilibriumY) / 2 - 10} ${equilibriumX} ${equilibriumY} Q ${(equilibriumX + graph.right) / 2} ${(equilibriumY + adAt(graph.right)) / 2 + 10} ${graph.right} ${adAt(graph.right)}`
  const srasPath = `M ${graph.left} ${srasAt(graph.left)} Q ${(graph.left + equilibriumX) / 2} ${(srasAt(graph.left) + equilibriumY) / 2 + 10} ${equilibriumX} ${equilibriumY} Q ${(equilibriumX + graph.right) / 2} ${(equilibriumY + srasAt(graph.right)) / 2 - 10} ${graph.right} ${srasAt(graph.right)}`

  return <section className="adas-section" aria-labelledby="adas-title">
    <div className="adas-heading"><div><p className="eyebrow">Economic framework</p><h2 id="adas-title">Aggregate Demand and Supply</h2></div><p>Latest applied simulation: Q{quarter} GDP and inflation position the short-run equilibrium marker.</p></div>
    <div className="adas-layout"><div className="adas-diagram"><svg viewBox="0 0 620 350" role="img" aria-label="Educational aggregate demand and aggregate supply diagram"><line className="adas-axis" x1={graph.left} y1={graph.bottom} x2={graph.right + 18} y2={graph.bottom} /><line className="adas-axis" x1={graph.left} y1={graph.bottom} x2={graph.left} y2={graph.top - 14} /><text className="adas-axis-label" x="312" y="340">Real GDP</text><text className="adas-axis-label" transform="translate(18 190) rotate(-90)">Price Level</text><line className="adas-lras" x1={lrasX} y1={graph.top} x2={lrasX} y2={graph.bottom} /><path className="adas-ad" d={adPath} /><path className="adas-sras" d={srasPath} /><line className="adas-guide" x1={equilibriumX} y1={equilibriumY} x2={equilibriumX} y2={graph.bottom} /><line className="adas-guide" x1={graph.left} y1={equilibriumY} x2={equilibriumX} y2={equilibriumY} /><circle className="adas-equilibrium" cx={equilibriumX} cy={equilibriumY} r="5" /><text className="adas-curve-label adas-ad-label" x={graph.right - 26} y={adAt(graph.right) - 8}>AD</text><text className="adas-curve-label adas-sras-label" x={graph.right - 40} y={srasAt(graph.right) - 8}>SRAS</text><text className="adas-curve-label adas-lras-label" x={lrasX + 8} y={graph.top + 18}>LRAS</text><text className="adas-equilibrium-label" x={equilibriumX + 9} y={equilibriumY - 10}>E · Q{quarter}</text><text className="adas-tick-label" x={lrasX - 20} y={graph.bottom + 17}>Potential</text></svg></div><aside className="adas-key"><div><span className="adas-key-swatch ad" /> Aggregate Demand</div><div><span className="adas-key-swatch sras" /> Short-run Aggregate Supply</div><div><span className="adas-key-swatch lras" /> Long-run Aggregate Supply / potential output</div><div><span className="adas-key-dot" /> E: educational AD–SRAS intersection</div></aside></div>
    <div className="adas-controls"><label><span><strong>Aggregate Demand (AD)</strong><output>{aggregateDemandShift > 0 ? '+' : ''}{aggregateDemandShift}</output></span><input type="range" min="-24" max="24" step="1" value={aggregateDemandShift} onChange={(event) => setAggregateDemandShift(Number(event.target.value))} aria-label="Aggregate Demand shift" /><small>−24 <span>0</span> +24</small></label><label><span><strong>Short-Run Aggregate Supply (SRAS)</strong><output>{shortRunAggregateSupplyShift > 0 ? '+' : ''}{shortRunAggregateSupplyShift}</output></span><input type="range" min="-24" max="24" step="1" value={shortRunAggregateSupplyShift} onChange={(event) => setShortRunAggregateSupplyShift(Number(event.target.value))} aria-label="Short-Run Aggregate Supply shift" /><small>−24 <span>0</span> +24</small></label></div>
    <p className="adas-control-note"><span>i</span> These sliders demonstrate illustrative AD and SRAS curve shifts only. They are separate from the locked simulation model and do not change its results.</p>
    <div className="adas-explanation"><p><strong>Bank Rate and AD.</strong> A lower Bank Rate can support consumption and investment, raising aggregate demand; higher rates can work in the opposite direction.</p><p><strong>Output and prices.</strong> A change in aggregate demand can affect real GDP and price pressure in the short run. The marker uses the model’s current GDP and inflation outputs.</p><p><strong>Short run versus potential.</strong> E is the short-run AD–SRAS intersection. LRAS marks potential output, so the horizontal distance helps illustrate an output gap.</p><p><strong>Educational simplification.</strong> The locked model does not calculate a separate price-level index. Inflation supplies the diagram’s vertical price-pressure placement; no additional economic calculation is introduced.</p></div>
  </section>
}

function KeynesianAggregateSupplyDiagram() {
  const [adShift, setAdShift] = useState(0)
  const [asShift, setAsShift] = useState(0)
  const adOffset = adShift * 3
  const asOffset = asShift * 3
  const equilibriumX = 348 + adShift * 2.5 + asShift * 1.5
  const equilibriumY = 186 - adShift * 1.6 + asShift * 1.2
  const potentialOutputX = 510 + asOffset
  const adPath = `M ${86 + adOffset} 78 Q ${220 + adOffset} 126 ${equilibriumX} ${equilibriumY} Q ${440 + adOffset} 230 ${530 + adOffset} 272`
  const asPath = `M ${64 + asOffset} 244 L ${230 + asOffset} 244 Q ${290 + asOffset} 244 ${equilibriumX} ${equilibriumY} Q ${440 + asOffset} 112 ${potentialOutputX} 110 L ${potentialOutputX} 42`

  return <section className="keynesian-section" aria-labelledby="keynesian-title">
    <div className="keynesian-heading"><div><p className="eyebrow">Economic framework</p><h2 id="keynesian-title">Keynesian Aggregate Supply</h2></div><p>A simplified A-level Economics view of how spare capacity can change the aggregate-supply response.</p></div>
    <div className="keynesian-layout"><div className="keynesian-diagram"><svg viewBox="0 0 620 350" role="img" aria-label="Interactive educational Keynesian aggregate supply diagram"><line className="adas-axis" x1="64" y1="300" x2="578" y2="300" /><line className="adas-axis" x1="64" y1="300" x2="64" y2="22" /><text className="adas-axis-label" x="312" y="340">Real GDP</text><text className="adas-axis-label" transform="translate(18 190) rotate(-90)">Price Level</text><path className="keynesian-as" d={asPath} /><path className="keynesian-ad" d={adPath} /><line className="keynesian-guide" x1={equilibriumX} y1={equilibriumY} x2={equilibriumX} y2="300" /><line className="keynesian-guide" x1="64" y1={equilibriumY} x2={equilibriumX} y2={equilibriumY} /><circle className="keynesian-equilibrium" cx={equilibriumX} cy={equilibriumY} r="5" /><text className="keynesian-label keynesian-as-label" x={potentialOutputX + 6} y="48">Keynesian AS</text><text className="keynesian-label keynesian-ad-label" x={495 + adOffset} y="269">AD</text><text className="keynesian-equilibrium-label" x={equilibriumX + 10} y={equilibriumY - 10}>E</text><text className="keynesian-section-label" x={120 + asOffset} y="263">Substantial spare capacity</text><text className="keynesian-section-label" x={288 + asOffset} y="264">Intermediate range</text><text className="keynesian-section-label" transform={`translate(${potentialOutputX + 18} 184) rotate(-90)`}>Full capacity</text><text className="adas-tick-label" x={potentialOutputX - 20} y="317">Potential output</text></svg></div><aside className="keynesian-key"><div><span className="keynesian-key-swatch as" /> Keynesian Aggregate Supply</div><div><span className="keynesian-key-swatch ad" /> Aggregate Demand</div><div><span className="adas-key-dot" /> E: illustrated short-run equilibrium</div></aside></div>
    <div className="keynesian-controls" aria-label="Keynesian diagram educational controls"><label><span>Aggregate Demand (AD)</span><output>{adShift > 0 ? '+' : ''}{adShift}</output><input type="range" min="-24" max="24" step="1" value={adShift} onChange={(event) => setAdShift(Number(event.target.value))} aria-label="Aggregate Demand shift" /><small>−24</small><small>+24</small></label><label><span>Keynesian Aggregate Supply (AS)</span><output>{asShift > 0 ? '+' : ''}{asShift}</output><input type="range" min="-24" max="24" step="1" value={asShift} onChange={(event) => setAsShift(Number(event.target.value))} aria-label="Keynesian Aggregate Supply shift" /><small>−24</small><small>+24</small></label></div><p className="keynesian-control-note"><span>i</span> These controls demonstrate illustrative shifts in AD and Keynesian AS only. They are not additional inputs to the locked simulator model.</p>
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
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  const [chartMetric, setChartMetric] = useState<ChartMetric>('gdp')

  const quarterlyResults = useMemo(
    () => runSimulation(appliedInputs).scenario.quarters,
    [appliedInputs],
  )

  const finalQuarter = quarterlyResults[quarterlyResults.length - 1]
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
      </div><button className="run-button" type="button" onClick={runSelectedSimulation}>Run Simulation</button><div className="policy-note"><span>i</span><p>Results update when you run the selected user scenario.</p></div></aside>
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
    <AggregateDemandSupplyDiagram gdp={finalQuarter.gdp} inflation={finalQuarter.inflation} quarter={finalQuarter.quarter} />
    <KeynesianAggregateSupplyDiagram />
    <ScenarioComparison finalQuarter={finalQuarter} />
  </main>
}

export default App
