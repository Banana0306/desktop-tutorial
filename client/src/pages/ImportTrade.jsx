import { useState } from 'react'
import { exchangeRates, customsRecords } from '../data/mock.js'
import StatusBadge from '../components/StatusBadge.jsx'

export default function ImportTrade() {
  const [cost, setCost] = useState('')
  const [rate, setRate] = useState(String(exchangeRates.USD.sell))
  const [tariffRate, setTariffRate] = useState('6')
  const [shipping, setShipping] = useState('')
  const [other, setOther] = useState('')

  const costTWD  = (parseFloat(cost) || 0) * (parseFloat(rate) || 0)
  const tariff   = costTWD * ((parseFloat(tariffRate) || 0) / 100)
  const shippingN = parseFloat(shipping) || 0
  const otherN   = parseFloat(other) || 0
  const total    = costTWD + tariff + shippingN + otherN

  const fmt = (n, dec = 0) => n > 0 ? `NT$ ${n.toLocaleString('zh-TW', { minimumFractionDigits: dec, maximumFractionDigits: dec })}` : '—'

  return (
    <>
      <div className="page-header">
        <h1>進口貿易</h1>
        <p>匯率更新 {exchangeRates.updatedAt}</p>
      </div>

      {/* Exchange Rates */}
      <div className="section-title mb-12">即時匯率</div>
      <div className="grid-3 mb-20">
        {Object.entries(exchangeRates).filter(([k]) => k !== 'updatedAt').map(([currency, data]) => (
          <div className="rate-card" key={currency}>
            <div className="rate-pair">{currency} / TWD</div>
            <div className="rate-values">
              <div>
                <span className="rate-sub">買入</span>
                <span className="rate-buy">{data.buy.toFixed(currency === 'JPY' ? 4 : 2)}</span>
              </div>
              <div>
                <span className="rate-sub">賣出</span>
                <span className="rate-sell">{data.sell.toFixed(currency === 'JPY' ? 4 : 2)}</span>
              </div>
            </div>
            <div className={`rate-change ${data.change >= 0 ? 'text-green' : 'text-red'}`}>
              {data.change >= 0 ? '▲' : '▼'} {Math.abs(data.change).toFixed(currency === 'JPY' ? 4 : 2)}
            </div>
          </div>
        ))}
      </div>

      {/* Customs Records */}
      <div className="section-title mb-12">進口記錄</div>
      <div className="card mb-20" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>進口單號</th>
                <th>提單號</th>
                <th>產地</th>
                <th>品項數</th>
                <th>申報金額 (USD)</th>
                <th>關稅 (TWD)</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {customsRecords.map(r => (
                <tr key={r.id}>
                  <td className="mono-sm text-accent">{r.id}</td>
                  <td className="mono-sm text-muted">{r.shipment}</td>
                  <td>{r.origin}</td>
                  <td className="mono-sm">{r.items}</td>
                  <td className="mono-sm">$ {r.declaredValue.toLocaleString()}</td>
                  <td className="mono-sm">NT$ {r.tariff.toLocaleString()}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Landing Cost Calculator */}
      <div className="section-title mb-12">落地成本試算機</div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="calc-grid">
            <div className="calc-field">
              <label>商品成本 (USD)</label>
              <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" />
            </div>
            <div className="calc-field">
              <label>USD/TWD 匯率</label>
              <input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} />
            </div>
            <div className="calc-field">
              <label>關稅率 (%)</label>
              <input type="number" step="0.1" value={tariffRate} onChange={e => setTariffRate(e.target.value)} />
            </div>
            <div className="calc-field">
              <label>運費 (TWD)</label>
              <input type="number" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="0" />
            </div>
            <div className="calc-field" style={{ gridColumn: '1/-1' }}>
              <label>其他費用 (TWD)</label>
              <input type="number" value={other} onChange={e => setOther(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title mb-12">試算結果</div>
          <div className="calc-result">
            <div className="calc-row">
              <span className="calc-row-label">商品成本 (TWD)</span>
              <span className="calc-row-val mono">{fmt(costTWD)}</span>
            </div>
            <div className="calc-row">
              <span className="calc-row-label">關稅</span>
              <span className="calc-row-val mono">{fmt(tariff)}</span>
            </div>
            <div className="calc-row">
              <span className="calc-row-label">運費</span>
              <span className="calc-row-val mono">{fmt(shippingN)}</span>
            </div>
            <div className="calc-row">
              <span className="calc-row-label">其他費用</span>
              <span className="calc-row-val mono">{fmt(otherN)}</span>
            </div>
            <hr className="calc-divider" />
            <div className="calc-row calc-row-total">
              <span className="calc-row-label">合計落地成本</span>
              <span className="calc-row-val mono">{fmt(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
