import './App.css'

type MetricCardProps = { label: string; value: string; trend: string; direction?: 'up' | 'down' }

function MetricCard({ label, value, trend, direction = 'up' }: MetricCardProps) {
  return <article className="metric-card"><div className="metric-label-row"><span>{label}</span><span className={`trend ${direction}`}>{direction === 'up' ? '↑' : '↓'} {trend}</span></div><strong>{value}</strong><span className="metric-caption">Projected indicator</span></article>
}

function PolicyControl({ label, description, value, min, max, step, suffix }: { label: string; description: string; value: number; min: number; max: number; step: number; suffix: string }) {
  return <div className="policy-control"><div className="control-heading"><div><label htmlFor={label}>{label}</label><p>{description}</p></div><output htmlFor={label}>{value}{suffix}</output></div><input id={label} type="range" min={min} max={max} step={step} defaultValue={value} aria-label={label} /><div className="range-labels"><span>{min}{suffix}</span><span>{max}{suffix}</span></div></div>
}

function App() {
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#dashboard" aria-label="Monetary Policy Simulator home"><span className="brand-mark">M</span><span>MACRO<span>LAB</span></span></a><div className="topbar-meta"><span className="status-dot" /> Static preview <span className="divider" /> Academic edition</div></header>
    <section className="page-heading" id="dashboard"><div><p className="eyebrow">Policy laboratory</p><h1>Monetary Policy Simulator</h1><p className="subtitle">Explore how changes to monetary policy could shape the wider economy. Configure a policy setting to prepare your experiment.</p></div><div className="period-card"><span>Scenario horizon</span><strong>Q1 2026 — Q4 2027</strong></div></section>
    <section className="dashboard-layout" aria-label="Monetary policy dashboard">
      <aside className="policy-panel"><div className="panel-title"><div><p className="eyebrow">Inputs</p><h2>Policy settings</h2></div><span className="panel-icon" aria-hidden="true">⌘</span></div><p className="panel-intro">These are illustrative values only. Economic modelling will be added in a later phase.</p><div className="controls"><PolicyControl label="Interest Rate" description="Central bank policy rate" value={4.5} min={0} max={10} step={0.25} suffix="%" /><PolicyControl label="Quantitative Easing" description="Asset purchase programme" value={350} min={0} max={800} step={25} suffix="bn" /><PolicyControl label="Reserve Requirement" description="Minimum bank reserves" value={8} min={0} max={20} step={1} suffix="%" /></div><div className="policy-note"><span>i</span><p>Controls are presented for interface preview. They do not yet affect results.</p></div></aside>
      <div className="results-area"><div className="results-heading"><div><p className="eyebrow">Overview</p><h2>Economic outlook</h2></div><span className="scenario-pill">Baseline scenario</span></div><div className="metrics-grid"><MetricCard label="GDP" value="£2.84T" trend="2.1%" /><MetricCard label="Inflation" value="2.6%" trend="0.3 pp" direction="down" /><MetricCard label="Consumption" value="£1.73T" trend="1.8%" /><MetricCard label="Investment" value="£482B" trend="3.4%" /><MetricCard label="Unemployment" value="4.2%" trend="0.2 pp" direction="down" /></div>
        <section className="chart-card" aria-labelledby="output-title"><div className="chart-header"><div><p className="eyebrow">Projection</p><h2 id="output-title">Economic Output</h2></div><div className="chart-key"><span /><span>Illustrative trend</span></div></div><div className="chart-placeholder" role="img" aria-label="Illustrative economic output chart placeholder"><div className="chart-y-labels"><span>3.2T</span><span>2.8T</span><span>2.4T</span><span>2.0T</span></div><div className="chart-grid"><svg viewBox="0 0 720 245" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2e8276" stopOpacity=".27" /><stop offset="100%" stopColor="#2e8276" stopOpacity="0" /></linearGradient></defs><path className="area" d="M0,175 C55,162 74,180 120,153 S186,130 225,139 S282,101 329,115 S384,87 432,94 S495,60 540,71 S606,43 650,51 S688,29 720,25 L720,245 L0,245 Z" /><path className="line" d="M0,175 C55,162 74,180 120,153 S186,130 225,139 S282,101 329,115 S384,87 432,94 S495,60 540,71 S606,43 650,51 S688,29 720,25" /></svg><div className="chart-x-labels"><span>Q1 26</span><span>Q3 26</span><span>Q1 27</span><span>Q3 27</span></div></div></div><div className="chart-footer"><span>Placeholder preview — results will respond to policy changes once the model is connected.</span><strong>GDP output index</strong></div></section>
      </div>
    </section>
  </main>
}

export default App
