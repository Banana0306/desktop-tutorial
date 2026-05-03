import { useState } from 'react'
import { orders } from '../data/mock.js'
import StatusBadge from '../components/StatusBadge.jsx'

const STATUS_LIST = ['全部', '待確認', '待出貨', '運送中', '已完成', '已取消']

export default function Sales() {
  const [filter, setFilter] = useState('全部')
  const filtered = filter === '全部' ? orders : orders.filter(o => o.status === filter)
  const count = s => orders.filter(o => o.status === s).length
  const total = orders.reduce((s, o) => s + (o.status === '已完成' ? o.amount : 0), 0)
  const fmt = n => `NT$ ${n.toLocaleString()}`

  return (
    <>
      <div className="page-header">
        <h1>銷貨管理</h1>
        <p>完成訂單總額 {fmt(total)}</p>
      </div>

      <div className="stat-row mb-16">
        <div className="stat-box">
          <span className="stat-box-num mono">{orders.length}</span>
          <span className="stat-box-label">全部</span>
        </div>
        {['待確認', '待出貨', '運送中', '已完成', '已取消'].map(s => (
          <div className="stat-box" key={s}>
            <span className="stat-box-num mono"
              style={{ color: s === '已完成' ? 'var(--green)' : s === '已取消' ? 'var(--red)' : s === '待出貨' ? 'var(--amber)' : '' }}
            >{count(s)}</span>
            <span className="stat-box-label">{s}</span>
          </div>
        ))}
      </div>

      <div className="controls-row">
        {STATUS_LIST.map(s => (
          <button
            key={s}
            className={`btn${filter === s ? ' btn-primary' : ''}`}
            onClick={() => setFilter(s)}
          >{s}</button>
        ))}
        <span className="text-muted mono-sm" style={{ marginLeft: 'auto' }}>
          {filtered.length} 筆
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>訂單號</th>
                <th>日期</th>
                <th>客戶</th>
                <th>品項數</th>
                <th>金額</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td className="mono-sm text-accent">{o.id}</td>
                  <td className="mono-sm text-muted">{o.date}</td>
                  <td style={{ fontWeight: 600 }}>{o.customer}</td>
                  <td className="mono-sm">{o.items}</td>
                  <td className="mono-sm">{fmt(o.amount)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn">查看</button>
                      <button className="btn" disabled={o.status !== '待出貨'}>出貨</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
