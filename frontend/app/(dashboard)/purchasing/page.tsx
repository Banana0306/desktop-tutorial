'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

const STATUS_BADGE: Record<string, string> = { draft: 'badge-gray', confirmed: 'badge-blue', receiving: 'badge-yellow', completed: 'badge-green', cancelled: 'badge-red' };
const STATUS_LABEL: Record<string, string> = { draft: '草稿', confirmed: '已確認', receiving: '收貨中', completed: '已完成', cancelled: '已取消' };

export default function PurchasingPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'po' | 'gr'>('po');

  const load = async () => {
    setLoading(true);
    try {
      const endpoint = tab === 'po' ? '/purchase-orders' : '/goods-receipts';
      const res = await api.get(endpoint);
      setOrders(res.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const confirm = async (id: number) => {
    await api.post(`/purchase-orders/${id}/confirm`);
    load();
  };

  const statusBadge = (s: string) => <span className={`badge ${STATUS_BADGE[s] || 'badge-gray'}`}>{STATUS_LABEL[s] || s}</span>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">採購管理</h1>
        <a href="/purchasing/new" className="btn btn-primary">+ 新增採購單</a>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {([['po', '採購訂單'], ['gr', '收貨單']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '0.4rem 1rem', borderRadius: '0.375rem', fontSize: '0.875rem', cursor: 'pointer', border: 'none',
              background: tab === t ? '#3b82f6' : '#e2e8f0', color: tab === t ? '#fff' : '#64748b', fontWeight: tab === t ? 600 : 400 }}>
            {l}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">載入中...</div> : tab === 'po' ? (
          <table>
            <thead><tr><th>PO 編號</th><th>供應商</th><th>幣別</th><th>金額 (TWD)</th><th>狀態</th><th>建立日期</th><th>操作</th></tr></thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.po_number}</td>
                  <td>{o.supplier_name || o.supplier_id}</td>
                  <td>{o.currency_code}</td>
                  <td style={{ textAlign: 'right' }}>{Number(o.total_amount_twd || 0).toLocaleString()}</td>
                  <td>{statusBadge(o.status)}</td>
                  <td>{o.created_at?.slice(0, 10)}</td>
                  <td>
                    {o.status === 'draft' && <button className="btn btn-outline btn-sm" onClick={() => confirm(o.id)}>確認</button>}
                    <a href={`/purchasing/${o.id}`} className="btn btn-outline btn-sm" style={{ marginLeft: '0.375rem', textDecoration: 'none' }}>詳情</a>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無採購單</td></tr>}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>GR 編號</th><th>供應商</th><th>倉庫</th><th>金額 (TWD)</th><th>狀態</th><th>收貨日期</th><th>操作</th></tr></thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{o.gr_number}</td>
                  <td>{o.supplier_name || o.supplier_id}</td>
                  <td>{o.warehouse_code || o.warehouse_id}</td>
                  <td style={{ textAlign: 'right' }}>{Number(o.total_amount_twd || 0).toLocaleString()}</td>
                  <td>{statusBadge(o.status)}</td>
                  <td>{o.received_date}</td>
                  <td>
                    {o.status === 'draft' && <button className="btn btn-outline btn-sm" onClick={async () => { await api.post(`/goods-receipts/${o.id}/complete`); load(); }}>完成</button>}
                    <a href={`/purchasing/gr/${o.id}`} className="btn btn-outline btn-sm" style={{ marginLeft: '0.375rem', textDecoration: 'none' }}>詳情</a>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無收貨單</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
