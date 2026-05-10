import { useState, useMemo } from 'react'
import { erpOrders, logisticsCustomers } from '../data/logistics.js'
import { planRoutes } from '../services/routePlanner.js'

const customerMap = Object.fromEntries(logisticsCustomers.map(c => [c.id, c.name]))

const STATUS_LABEL = { ok: '準時', wait: '等候', closed: '已關閉' }
const STATUS_CLASS = { ok: 'badge-green', wait: 'badge-amber', closed: 'badge-red' }

function StopRow({ stop, index }) {
  const [open, setOpen] = useState(false)
  const isSupplier = stop.type === 'supplier'

  return (
    <div className={`route-stop ${isSupplier ? 'stop-supplier' : 'stop-customer'}`}>
      <div className="stop-header" onClick={() => setOpen(o => !o)}>
        <span className="stop-seq">{index + 1}</span>
        <span className={`stop-type-badge ${isSupplier ? 'badge-amber' : 'badge-cyan'}`}>
          {isSupplier ? '調貨' : '送貨'}
        </span>
        <span className="stop-name">{stop.name}</span>
        <span className="stop-city text-muted mono-sm">{stop.city}</span>
        <span className="stop-times mono-sm">
          抵達 {stop.arrivalTime}
          {stop.waitMin > 0 && <span className="text-amber"> (+等{stop.waitMin}分)</span>}
          {' '}→ 離開 {stop.departTime}
        </span>
        <span className={`badge ${STATUS_CLASS[stop.status]}`}>{STATUS_LABEL[stop.status]}</span>
        <span className="stop-travel mono-sm text-muted">
          ↑ {stop.travelMin}分/{Math.round(stop.travelMin)} 分車程
        </span>
        <button className="btn stop-expand">{open ? '▲' : '▼'}</button>
      </div>

      {open && (
        <div className="stop-detail">
          <div className="stop-addr text-muted mono-sm">📍 {stop.address}</div>
          <div className="stop-detail-grid">
            <div>
              <div className="card-label">時間明細</div>
              <div className="detail-row"><span>行車</span><span className="mono-sm">{stop.travelMin} 分</span></div>
              {stop.waitMin > 0 && <div className="detail-row text-amber"><span>等候開門</span><span className="mono-sm">{stop.waitMin} 分</span></div>}
              <div className="detail-row"><span>服務時間</span><span className="mono-sm">{stop.serviceMin} 分</span></div>
            </div>
            <div>
              <div className="card-label">{isSupplier ? '調貨品項' : '送貨品項'}</div>
              {(isSupplier ? stop.items : stop.items).map((item, i) => (
                <div key={i} className="detail-row">
                  <span className="mono-sm text-muted">{item.productId || item.name}</span>
                  <span className="mono-sm">{item.name || ''} × {item.qty}</span>
                </div>
              ))}
              {!isSupplier && stop.orders && (
                <div className="mt-8">
                  <div className="card-label">訂單</div>
                  {stop.orders.map(o => (
                    <span key={o} className="badge badge-muted mono-sm" style={{ marginRight: 4 }}>{o}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Logistics() {
  const [cutoff, setCutoff] = useState('08:00')
  const [generated, setGenerated] = useState(false)
  const [plan, setPlan] = useState(null)
  const [selectedOrders, setSelectedOrders] = useState(
    () => new Set(erpOrders.map(o => o.id))
  )

  const pendingOrders = erpOrders

  function toggleOrder(id) {
    setSelectedOrders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setGenerated(false)
  }

  function generate() {
    const active = pendingOrders.filter(o => selectedOrders.has(o.id))
    const result = planRoutes(active, cutoff)
    setPlan(result)
    setGenerated(true)
  }

  const outOfStockItems = useMemo(() => {
    const items = []
    for (const o of pendingOrders) {
      for (const item of o.items) {
        if (item.warehouseQty < item.qty) {
          items.push({ ...item, orderId: o.id })
        }
      }
    }
    return items
  }, [])

  return (
    <>
      <div className="page-header">
        <h1>物流路線規劃</h1>
        <p>ERP 出貨截止後自動排程 — 缺貨先調廠商，依客戶營業時間安排送貨路線</p>
      </div>

      {/* ── ERP Orders Panel ── */}
      <div className="section-title">ERP 待出貨訂單</div>
      <div className="card mb-16" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>訂單編號</th>
                <th>客戶</th>
                <th>品項數</th>
                <th>缺貨品項</th>
                <th>日期</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map(o => {
                const shortage = o.items.filter(i => i.warehouseQty < i.qty)
                return (
                  <tr key={o.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(o.id)}
                        onChange={() => toggleOrder(o.id)}
                        style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                    </td>
                    <td className="mono-sm text-accent">{o.id}</td>
                    <td style={{ fontWeight: 600 }}>{customerMap[o.customerId] ?? o.customerId}</td>
                    <td className="mono-sm">{o.items.length}</td>
                    <td>
                      {shortage.length > 0
                        ? shortage.map(i => (
                          <span key={i.productId} className="badge badge-red mono-sm" style={{ marginRight: 4 }}>
                            {i.name} ×{i.qty - i.warehouseQty}
                          </span>
                        ))
                        : <span className="text-muted mono-sm">—</span>
                      }
                    </td>
                    <td className="mono-sm text-muted">{o.date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Out-of-stock alert ── */}
      {outOfStockItems.length > 0 && (
        <>
          <div className="section-title">缺貨警示 — 需先調貨</div>
          <div className="alert-list mb-16">
            {outOfStockItems.map((item, i) => (
              <div key={i} className="alert-item">
                <span className="alert-item-id">{item.orderId}</span>
                <span className="alert-item-name">{item.name}</span>
                <span className="alert-item-stock">
                  庫存 {item.warehouseQty} / 需求 {item.qty} → 缺 {item.qty - item.warehouseQty}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Controls ── */}
      <div className="section-title">出貨截止設定</div>
      <div className="card mb-16">
        <div className="controls-row" style={{ alignItems: 'flex-end', gap: 16 }}>
          <div className="calc-field">
            <label>出發時間（截止後）</label>
            <input
              type="time"
              value={cutoff}
              onChange={e => { setCutoff(e.target.value); setGenerated(false) }}
              style={{ width: 140 }}
            />
          </div>
          <div className="calc-field">
            <label>選取訂單</label>
            <div className="mono-sm" style={{ paddingTop: 8, color: 'var(--text-primary)' }}>
              {selectedOrders.size} / {pendingOrders.length} 張
            </div>
          </div>
          <button className="btn btn-primary" onClick={generate} style={{ alignSelf: 'flex-end' }}>
            ▶ 產生路線
          </button>
        </div>
      </div>

      {/* ── Route Plan ── */}
      {generated && plan && (
        <>
          <div className="section-title">路線規劃結果</div>

          {/* Summary KPIs */}
          <div className="grid-4 mb-16">
            <div className="card card-sm">
              <div className="card-label">出發時間</div>
              <div className="card-value accent mono">{plan.departureTime}</div>
            </div>
            <div className="card card-sm">
              <div className="card-label">預計回倉</div>
              <div className="card-value mono">{plan.returnTime}</div>
            </div>
            <div className="card card-sm">
              <div className="card-label">總里程</div>
              <div className="card-value mono">{plan.totalDistKm} <span style={{ fontSize: 14 }}>km</span></div>
            </div>
            <div className="card card-sm">
              <div className="card-label">總時數</div>
              <div className="card-value mono">
                {Math.floor(plan.totalDurationMin / 60)}h {plan.totalDurationMin % 60}m
              </div>
            </div>
          </div>

          <div className="grid-2 mb-16">
            <div className="card card-sm">
              <div className="card-label">調貨站點</div>
              <div className="card-value" style={{ color: 'var(--amber)' }}>{plan.supplierStops}</div>
              <div className="card-unit">廠商調貨</div>
            </div>
            <div className="card card-sm">
              <div className="card-label">送貨站點</div>
              <div className="card-value" style={{ color: 'var(--accent)' }}>{plan.customerStops}</div>
              <div className="card-unit">客戶送達</div>
            </div>
          </div>

          {/* Route timeline */}
          <div className="section-title">路線時刻表</div>
          <div className="route-timeline">
            {/* Warehouse start */}
            <div className="route-stop stop-warehouse">
              <div className="stop-header">
                <span className="stop-seq">0</span>
                <span className="badge badge-muted">出發</span>
                <span className="stop-name">總倉庫 (台北)</span>
                <span className="stop-times mono-sm">出發 {plan.departureTime}</span>
              </div>
            </div>

            {plan.stops.map((stop, i) => (
              <StopRow key={stop.id + i} stop={stop} index={i} />
            ))}

            {/* Warehouse return */}
            <div className="route-stop stop-warehouse">
              <div className="stop-header">
                <span className="stop-seq">{plan.stops.length + 1}</span>
                <span className="badge badge-muted">回倉</span>
                <span className="stop-name">總倉庫 (台北)</span>
                <span className="stop-times mono-sm">抵達 {plan.returnTime}</span>
              </div>
            </div>
          </div>

          {/* Supplier pickup summary */}
          {plan.supplierPickups.length > 0 && (
            <>
              <div className="section-title mt-16">調貨清單</div>
              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>品號</th>
                        <th>品名</th>
                        <th>調貨數量</th>
                        <th>供應商</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.supplierPickups.map((p, i) => (
                        <tr key={i}>
                          <td className="mono-sm text-accent">{p.productId}</td>
                          <td>{p.name}</td>
                          <td className="mono-sm text-amber">{p.qty}</td>
                          <td className="mono-sm text-muted">{p.supplierName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}
