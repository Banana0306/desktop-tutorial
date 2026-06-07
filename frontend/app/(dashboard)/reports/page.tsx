'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function ReportsPage() {
  const [tab, setTab] = useState<'gp' | 'product' | 'customer' | 'trend'>('gp');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'gp') {
        const res = await api.get(`/reports/gross-profit?start=${startDate}&end=${endDate}`);
        setData(res.data.data || []);
      } else if (tab === 'product') {
        const res = await api.get(`/reports/product-analysis?start=${startDate}&end=${endDate}`);
        setData(res.data.data || []);
      } else if (tab === 'customer') {
        const res = await api.get('/reports/customer-profitability');
        setData(res.data.data || []);
      } else {
        const res = await api.get('/reports/monthly-sales-trend');
        setData(res.data.data || []);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">報表中心</h1>
        {(tab === 'gp' || tab === 'product') && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: 'auto' }} />
            <span style={{ color: '#64748b' }}>~</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width: 'auto' }} />
            <button className="btn btn-primary" onClick={load}>查詢</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {([['gp', '毛利報表'], ['product', '商品分析'], ['customer', '客戶獲利'], ['trend', '月銷售趨勢']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '0.4rem 1rem', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer', border: 'none',
              background: tab === t ? '#3b82f6' : '#e2e8f0', color: tab === t ? '#fff' : '#64748b', fontWeight: tab === t ? 600 : 400 }}>
            {l}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">載入報表...</div> : tab === 'gp' ? (
          <table>
            <thead><tr><th>指標</th><th style={{ textAlign: 'right' }}>金額 (TWD)</th></tr></thead>
            <tbody>
              {data.map((r: any, i: number) => (
                <tr key={i} style={{ fontWeight: r.metric === '毛利' || r.metric === '稅前淨利' ? 700 : 400 }}>
                  <td>{r.metric}</td>
                  <td style={{ textAlign: 'right', color: Number(r.amount_twd) < 0 ? '#ef4444' : 'inherit' }}>
                    {Number(r.amount_twd || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === 'product' ? (
          <table>
            <thead><tr><th>SKU</th><th>品名</th><th>銷售數量</th><th>營收 (TWD)</th><th>成本 (TWD)</th><th>毛利 (TWD)</th><th>毛利率</th></tr></thead>
            <tbody>
              {data.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.sku}</td>
                  <td>{r.product_name}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.qty_sold || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.revenue_twd || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.cogs_twd || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.gross_profit || 0).toLocaleString()}</td>
                  <td><span className={`badge ${Number(r.margin_rate) > 20 ? 'badge-green' : Number(r.margin_rate) > 0 ? 'badge-yellow' : 'badge-red'}`}>{r.margin_rate}%</span></td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無資料</td></tr>}
            </tbody>
          </table>
        ) : tab === 'customer' ? (
          <table>
            <thead><tr><th>客戶</th><th>等級</th><th>訂單數</th><th>營收 (TWD)</th><th>成本 (TWD)</th><th>毛利 (TWD)</th><th>毛利率</th></tr></thead>
            <tbody>
              {data.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.customer_name}</td>
                  <td>{r.tier}</td>
                  <td style={{ textAlign: 'right' }}>{r.order_count}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.revenue_twd || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.cogs_twd || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.gross_profit_twd || 0).toLocaleString()}</td>
                  <td><span className={`badge ${Number(r.margin_rate) > 20 ? 'badge-green' : 'badge-yellow'}`}>{r.margin_rate}%</span></td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無資料</td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>月份</th><th>出貨次數</th><th>訂單數</th><th>營收 (TWD)</th><th>成本 (TWD)</th><th>毛利 (TWD)</th></tr></thead>
            <tbody>
              {data.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.period_code}</td>
                  <td style={{ textAlign: 'right' }}>{r.delivery_count}</td>
                  <td style={{ textAlign: 'right' }}>{r.order_count}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.revenue_twd || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.cogs_twd || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.gross_profit_twd || 0).toLocaleString()}</td>
                </tr>
              ))}
              {data.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
