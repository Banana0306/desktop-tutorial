import KpiCard from '../components/KpiCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { salesTrend, categoryInventory, latestOrders, lowStockProducts, monthlySales } from '../data/mock.js'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

const PIE_COLORS = ['#00d9ff', '#00e676', '#ffd600', '#ff3b5c', '#8b9cbd', '#4a5f7a']

const TooltipStyle = {
  backgroundColor: '#0f1624',
  border: '1px solid #1a2332',
  borderRadius: 0,
  color: '#e8eaf0',
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
}

const fmtAmount = v => `NT$ ${(v / 1000).toFixed(0)}K`
const fmtFull = n => `NT$ ${n.toLocaleString()}`

const thisMonth = monthlySales[monthlySales.length - 2] // Nov
const prevMonth = monthlySales[monthlySales.length - 3]
const growthPct = (((thisMonth.sales - prevMonth.sales) / prevMonth.sales) * 100).toFixed(1)

export default function Overview() {
  const pendingCount = latestOrders.filter(o => ['待確認', '待出貨'].includes(o.status)).length

  return (
    <>
      <div className="page-header">
        <h1>控制總覽</h1>
        <p>最後更新 2024-11-20 09:30</p>
      </div>

      {/* KPI Row */}
      <div className="grid-4 mb-20">
        <KpiCard
          label="本月營收"
          value={`NT$ ${(thisMonth.sales / 10000).toFixed(1)}萬`}
          trend={{ direction: 'up', pct: `${growthPct}%` }}
          accentValue
        />
        <KpiCard
          label="待處理訂單"
          value={pendingCount}
          unit="張訂單需處理"
        />
        <KpiCard
          label="庫存品項"
          value={20}
          unit="種零件"
        />
        <KpiCard
          label="低庫存警示"
          value={lowStockProducts.length}
          unit="項需補貨"
        />
      </div>

      {/* Charts Row */}
      <div className="grid-2 mb-20">
        <div className="card">
          <div className="section-title mb-16">30 日銷售趨勢</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={salesTrend} margin={{ left: -10, right: 8 }}>
              <CartesianGrid stroke="#1a2332" />
              <XAxis dataKey="date" tick={{ fill: '#5a6b84', fontSize: 10 }} axisLine={false} tickLine={false}
                interval={4} />
              <YAxis tick={{ fill: '#5a6b84', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={fmtAmount} />
              <Tooltip contentStyle={TooltipStyle} formatter={v => [`NT$ ${v.toLocaleString()}`, '銷售額']} />
              <Line type="monotone" dataKey="amount" stroke="#00d9ff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-title mb-16">庫存類別分佈</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={categoryInventory} dataKey="value" cx="50%" cy="50%" outerRadius={70}
                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {categoryInventory.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend
                formatter={(v) => <span style={{ color: '#5a6b84', fontSize: 11 }}>{v}</span>}
              />
              <Tooltip contentStyle={TooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid-2">
        {/* Latest Orders */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 16px 10px' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>最新訂單</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>訂單號</th>
                <th>客戶</th>
                <th>金額</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map(o => (
                <tr key={o.id}>
                  <td className="mono-sm text-accent">{o.id}</td>
                  <td style={{ fontSize: 12 }}>{o.customer}</td>
                  <td className="mono-sm" style={{ fontSize: 12 }}>{fmtFull(o.amount)}</td>
                  <td><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Low Stock Alerts */}
        <div className="card">
          <div className="section-title mb-12">低庫存警示</div>
          <div className="alert-list">
            {lowStockProducts.map(p => (
              <div className="alert-item" key={p.id}>
                <div>
                  <div className="alert-item-id">{p.id}</div>
                  <div className="alert-item-name">{p.name}</div>
                </div>
                <div className="alert-item-stock">
                  {p.stock === 0 ? '缺貨' : `${p.stock} / ${p.safetyStock} ${p.unit}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
