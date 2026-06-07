'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function InventoryPage() {
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stock' | 'valuation' | 'aging'>('stock');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'stock') {
        const res = await api.get('/inventory', { params: { search } });
        setStock(res.data.data || []);
      } else if (tab === 'valuation') {
        const res = await api.get('/reports/inventory-valuation');
        setStock(res.data.data || []);
      } else {
        const res = await api.get('/inventory/aging');
        setStock(res.data.data || []);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab, search]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">庫存管理</h1>
        {tab === 'stock' && (
          <div className="search-bar"><span>🔍</span><input placeholder="搜尋商品" value={search} onChange={e => setSearch(e.target.value)} /></div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {([['stock', '庫存總覽'], ['valuation', '庫存評價'], ['aging', '庫存老化']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '0.4rem 1rem', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer', border: 'none',
              background: tab === t ? '#3b82f6' : '#e2e8f0', color: tab === t ? '#fff' : '#64748b', fontWeight: tab === t ? 600 : 400 }}>
            {l}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">載入中...</div> : tab === 'stock' ? (
          <table>
            <thead><tr><th>SKU</th><th>品名</th><th>倉庫</th><th>可用數量</th><th>預留數量</th></tr></thead>
            <tbody>
              {stock.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.sku}</td>
                  <td>{r.product_name}</td>
                  <td>{r.warehouse_code}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span className={Number(r.available_qty) < 10 ? 'badge badge-red' : 'badge badge-green'}>{r.available_qty}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{r.reserved_qty || 0}</td>
                </tr>
              ))}
              {stock.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無庫存資料</td></tr>}
            </tbody>
          </table>
        ) : tab === 'valuation' ? (
          <table>
            <thead><tr><th>SKU</th><th>品名</th><th>倉庫</th><th>數量</th><th>庫存值 (TWD)</th><th>平均成本</th></tr></thead>
            <tbody>
              {stock.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{r.sku}</td>
                  <td>{r.product_name}</td>
                  <td>{r.warehouse_code}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.qty || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.value_twd || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.avg_unit_cost || 0).toFixed(2)}</td>
                </tr>
              ))}
              {stock.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無庫存評價資料</td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>批次</th><th>SKU</th><th>品名</th><th>倉庫</th><th>剩餘數量</th><th>單位成本</th><th>入庫日期</th><th>庫齡 (天)</th></tr></thead>
            <tbody>
              {stock.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.batch_number}</td>
                  <td style={{ fontWeight: 600 }}>{r.sku}</td>
                  <td>{r.product_name}</td>
                  <td>{r.warehouse_code}</td>
                  <td style={{ textAlign: 'right' }}>{r.remaining_qty}</td>
                  <td style={{ textAlign: 'right' }}>{Number(r.unit_cost_twd || 0).toFixed(2)}</td>
                  <td>{r.received_date}</td>
                  <td>
                    <span className={`badge ${Number(r.age_days) > 180 ? 'badge-red' : Number(r.age_days) > 90 ? 'badge-yellow' : 'badge-green'}`}>
                      {r.age_days}
                    </span>
                  </td>
                </tr>
              ))}
              {stock.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無庫存老化資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
