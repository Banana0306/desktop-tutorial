export default function KpiCard({ label, value, unit, trend, accentValue }) {
  return (
    <div className="card card-sm">
      <div className="card-label">{label}</div>
      <div className={`card-value${accentValue ? ' accent' : ''}`}>{value}</div>
      {unit && <div className="card-unit">{unit}</div>}
      {trend && (
        <div className={`card-trend ${trend.direction === 'up' ? 'trend-up' : 'trend-down'}`}>
          {trend.direction === 'up' ? '▲' : '▼'} {trend.pct}
        </div>
      )}
    </div>
  )
}
