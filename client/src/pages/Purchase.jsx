import { useState } from 'react'
import { purchaseOrders } from '../data/mock.js'
import StatusBadge from '../components/StatusBadge.jsx'

const STATUS_LIST = ['全部', '待確認', '備貨中', '運送中', '已到貨']

export default function Purchase() {
  const [filter, setFilter] = useState('全部')
  const filtered = filter === '全部' ? purchaseOrders : purchaseOrders.filter(o => o.status === filter)
  const count = s => purchaseOrders.filter(o => o.status === s).length
  const fmt = n => `NT$ ${n.toLocaleString()}`

  return (
    <>
      <div className="page-header">
        <h1>進貨管理</h1>
        <p>共 {purchaseOrders.length} 張進貨單</p>
      </div>

      <div className="stat-row mb-16">
        {['待確認', '備貨中', '運送中', '已到貨'].map(s => (
          <div className="stat-box" key={s}>
            <span className="stat-box-num mono">{count(s)}</span>
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
                <th>PO 號碼</th>
                <th>供應商</th>
                <th>品項數</th>
                <th>金額</th>
                <th>預計到貨</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td className="mono-sm text-accent">{o.id}</td>
                  <td style={{ fontWeight: 600 }}>{o.supplier}</td>
                  <td className="mono-sm">{o.items}</td>
                  <td className="mono-sm">{fmt(o.amount)}</td>
                  <td className="mono-sm text-muted">{o.eta}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn">查看</button>
                      <button className="btn" disabled={o.status !== '待確認'}>確認</button>
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
