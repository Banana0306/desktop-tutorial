import { monthlySales, dailyOrders, topProducts } from '../data/mock.js'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const TooltipStyle = {
  backgroundColor: '#0f1624',
  border: '1px solid #1a2332',
  borderRadius: 0,
  color: '#e8eaf0',
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
}

const fmtMoney = v => `NT$ ${(v / 10000).toFixed(0)}萬`

export default function Reports() {
  const totalRevenue = monthlySales.reduce((s, m) => s + m.sales, 0)
  const totalOrders = monthlySales.reduce((s, m) => s + m.orders, 0)

  return (
    <>
      <div className="page-header">
        <h1>報表分析</h1>
        <p>年度總營收 NT$ {totalRevenue.toLocaleString()} ｜ 總訂單 {totalOrders} 張</p>
      </div>

      {/* Monthly Sales Bar Chart */}
      <div className="card mb-16">
        <div className="section-title mb-16">月度銷售金額 (2024)</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthlySales} margin={{ left: 8, right: 8 }}>
            <CartesianGrid stroke="#1a2332" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#5a6b84', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#5a6b84', fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={fmtMoney} />
            <Tooltip contentStyle={TooltipStyle} formatter={v => [`NT$ ${v.toLocaleString()}`, '銷售額']} />
            <Bar dataKey="sales" fill="#00d9ff" barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Orders Line Chart */}
      <div className="card mb-16">
        <div className="section-title mb-16">日訂單數趨勢 (近 30 日)</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dailyOrders} margin={{ left: -10, right: 8 }}>
            <CartesianGrid stroke="#1a2332" />
            <XAxis dataKey="date" tick={{ fill: '#5a6b84', fontSize: 10 }} axisLine={false} tickLine={false}
              interval={4} />
            <YAxis tick={{ fill: '#5a6b84', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TooltipStyle} formatter={v => [v, '訂單數']} />
            <Line type="monotone" dataKey="count" stroke="#00e676" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top 10 Ranking */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 16px 10px' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>商品銷售排行 Top 10</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>排名</th>
                <th>商品名稱</th>
                <th>類別</th>
                <th>銷售數量</th>
                <th>銷售金額</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map(p => (
                <tr key={p.rank}>
                  <td className={`mono-sm rank-${p.rank <= 3 ? p.rank : ''}`}
                    style={p.rank > 3 ? { color: 'var(--text-muted)' } : {}}>
                    #{p.rank}
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="text-muted">{p.category}</td>
                  <td className="mono-sm">{p.qty.toLocaleString()}</td>
                  <td className="mono-sm text-accent">NT$ {p.revenue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
