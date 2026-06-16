'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';

const STATUS_LABEL: Record<string, string> = { draft: '草稿', completed: '已完成', cancelled: '已取消' };

export default function SalesDeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sd, setSd] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/sales-deliveries/${id}`);
      setSd(res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const complete = async () => {
    setError('');
    try { await api.post(`/sales-deliveries/${id}/complete`); load(); }
    catch (e: any) { setError(e.response?.data?.error || '操作失敗'); }
  };

  if (loading) return <div className="loading">載入中...</div>;
  if (!sd) return <div className="alert alert-error">出貨單不存在</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">出貨單 {sd.sd_number}</h1>
        <a href="/sales" className="btn btn-outline">返回列表</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div><div className="form-label">銷售單</div><div>{sd.so_number}</div></div>
          <div><div className="form-label">客戶</div><div>{sd.customer_name}</div></div>
          <div><div className="form-label">狀態</div><span className="badge badge-blue">{STATUS_LABEL[sd.status] || sd.status}</span></div>
          <div><div className="form-label">出貨日期</div><div>{sd.delivery_date}</div></div>
          <div><div className="form-label">總金額 (TWD)</div><div>{Number(sd.total_amount_twd).toLocaleString()}</div></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong>出貨品項</strong>
        <table style={{ marginTop: '0.75rem' }}>
          <thead><tr><th>商品</th><th>倉庫</th><th>數量</th><th>單價 (TWD)</th><th>小計</th></tr></thead>
          <tbody>
            {(sd.items || []).map((it: any) => (
              <tr key={it.id}>
                <td>{it.product_snapshot?.name} ({it.product_snapshot?.sku})</td>
                <td>{it.warehouse_name}</td>
                <td>{Number(it.quantity).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{Number(it.unit_price_twd).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{Number(it.subtotal_twd).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sd.status === 'draft' && (
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={complete}>完成出貨</button>
        </div>
      )}
    </div>
  );
}
