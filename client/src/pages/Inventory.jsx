import { products } from '../data/mock.js'
import StatusBadge from '../components/StatusBadge.jsx'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const chartData = products.map(p => ({
  name: p.name.length > 7 ? p.name.slice(0, 7) + '…' : p.name,
  現貨: p.stock,
  安全庫存: p.safetyStock,
}))

function stockColor(stock, safety) {
  if (stock === 0) return 'var(--red)'
  if (stock < safety) return 'var(--amber)'
  return 'var(--green)'
}

const TooltipStyle = {
  backgroundColor: '#0f1624',
  border: '1px solid #1a2332',
  borderRadius: 0,
  color: '#e8eaf0',
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
}

export default function Inventory() {
  const totalStock = products.reduce((s, p) => s + p.stock, 0)
  const lowCount = products.filter(p => p.stock < p.safetyStock).length

  return (
    <>
      <div className="page-header">
        <h1>庫存管理</h1>
        <p>總在庫 {totalStock} 件 ｜ {lowCount} 項低於安全庫存</p>
      </div>

      <div className="grid-6040" style={{ alignItems: 'start' }}>
        {/* Table */}
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>零件編號</th>
                  <th>名稱</th>
                  <th>類別</th>
                  <th>現貨</th>
                  <th>安全庫存</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td className="mono-sm text-accent">{p.id}</td>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</td>
                    <td className="text-muted" style={{ fontSize: 11 }}>{p.category}</td>
                    <td className="mono-sm" style={{ color: stockColor(p.stock, p.safetyStock), fontWeight: 700 }}>
                      {p.stock}
                    </td>
                    <td className="mono-sm text-muted">{p.safetyStock}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chart */}
        <div className="card">
          <div className="section-title mb-16">現貨 vs 安全庫存</div>
          <ResponsiveContainer width="100%" height={480}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} stroke="#1a2332" />
              <XAxis type="number" tick={{ fill: '#5a6b84', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: '#5a6b84', fontSize: 10 }} width={72} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TooltipStyle} cursor={{ fill: 'rgba(0,217,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#5a6b84' }} />
              <Bar dataKey="現貨" fill="#00d9ff" barSize={6} />
              <Bar dataKey="安全庫存" fill="#ffd600" barSize={6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}
