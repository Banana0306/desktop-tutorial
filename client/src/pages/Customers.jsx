import { useState } from 'react'
import { customers } from '../data/mock.js'

export default function Customers() {
  const [search, setSearch] = useState('')
  const filtered = customers.filter(c =>
    c.name.includes(search) || c.city.includes(search) || c.id.includes(search)
  )
  const fmt = n => `NT$ ${n.toLocaleString()}`

  return (
    <>
      <div className="page-header">
        <h1>客戶主檔</h1>
        <p>共 {customers.length} 筆客戶資料</p>
      </div>

      <div className="controls-row">
        <input
          className="input-search"
          placeholder="搜尋客戶名稱 / 城市 / 編號…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="text-muted mono-sm" style={{ marginLeft: 'auto' }}>
          顯示 {filtered.length} / {customers.length} 筆
        </span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>客戶編號</th>
                <th>名稱</th>
                <th>電話</th>
                <th>城市</th>
                <th>信用額度</th>
                <th>付款天數</th>
                <th>最後訂購</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td className="mono-sm text-accent">{c.id}</td>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="mono-sm text-muted">{c.phone}</td>
                  <td>{c.city}</td>
                  <td className="mono-sm">{fmt(c.creditLimit)}</td>
                  <td className="mono-sm">
                    <span style={{ color: c.paymentDays >= 60 ? 'var(--amber)' : 'var(--text-muted)' }}>
                      {c.paymentDays} 天
                    </span>
                  </td>
                  <td className="mono-sm text-muted">{c.lastOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
