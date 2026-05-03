import { useState } from 'react'
import { products } from '../data/mock.js'
import StatusBadge from '../components/StatusBadge.jsx'

const CATEGORIES = ['全部', '煞車系統', '傳動系統', '引擎零件', '電氣系統', '外殼車身', '輪胎輪框']

function stockColor(stock, safety) {
  if (stock === 0) return 'var(--red)'
  if (stock < safety) return 'var(--amber)'
  return 'var(--green)'
}

export default function Products() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('全部')

  const filtered = products
    .filter(p => category === '全部' || p.category === category)
    .filter(p => p.name.includes(search) || p.id.includes(search))

  const fmt = n => `NT$ ${n.toLocaleString()}`

  return (
    <>
      <div className="page-header">
        <h1>產品管理</h1>
        <p>共 {products.length} 種零件，{products.filter(p => p.status !== '正常').length} 項庫存異常</p>
      </div>

      <div className="controls-row">
        <input
          className="input-search"
          placeholder="搜尋料號 / 品名…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="text-muted mono-sm" style={{ marginLeft: 'auto' }}>
          顯示 {filtered.length} / {products.length} 筆
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>零件編號</th>
                <th>名稱</th>
                <th>類別</th>
                <th>單價</th>
                <th>現貨</th>
                <th>安全庫存</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id}>
                  <td className="mono-sm text-accent">{p.id}</td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="text-muted">{p.category}</td>
                  <td className="mono-sm">{fmt(p.price)}</td>
                  <td className="mono-sm" style={{ color: stockColor(p.stock, p.safetyStock), fontWeight: 700 }}>
                    {p.stock} {p.unit}
                  </td>
                  <td className="mono-sm text-muted">{p.safetyStock} {p.unit}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <button className="btn">編輯</button>
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
