'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';

const STATUS_LABEL: Record<string, string> = { draft: '草稿', confirmed: '已確認', delivering: '出貨中', completed: '已完成', cancelled: '已取消' };

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [so, setSo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/sales-orders/${id}`);
      setSo(res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const confirm = async () => {
    setError('');
    try { await api.post(`/sales-orders/${id}/confirm`); load(); }
    catch (e: any) { setError(e.response?.data?.error || '操作失敗'); }
  };

  const cancel = async () => {
    setError('');
    try { await api.post(`/sales-orders/${id}/cancel`); load(); }
    catch (e: any) { setError(e.response?.data?.error || '操作失敗'); }
  };

  if (loading) return <div className="loading">載入中...</div>;
  if (!so) return <div className="alert alert-error">銷售單不存在</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">銷售單 {so.so_number}</h1>
        <a href="/sales" className="btn btn-outline">返回列表</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div><div className="form-label">客戶</div><div>{so.customer_name}</div></div>
          <div><div className="form-label">狀態</div><span className="badge badge-blue">{STATUS_LABEL[so.status] || so.status}</span></div>
          <div><div className="form-label">幣別</div><div>{so.currency_code} (匯率 {so.exchange_rate})</div></div>
          <div><div className="form-label">總金額 (TWD)</div><div>{Number(so.total_amount_twd).toLocaleString()}</div></div>
          <div><div className="form-label">預計交貨日</div><div>{so.expected_delivery || '-'}</div></div>
          <div><div className="form-label">備註</div><div>{so.notes || '-'}</div></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong>銷售品項</strong>
        <table style={{ marginTop: '0.75rem' }}>
          <thead><tr><th>商品</th><th>數量</th><th>單價 (原幣)</th><th>小計 (原幣)</th></tr></thead>
          <tbody>
            {(so.items || []).map((it: any) => (
              <tr key={it.id}>
                <td>{it.product_snapshot?.name} ({it.product_snapshot?.sku})</td>
                <td>{Number(it.quantity).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{Number(it.unit_price_orig).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{Number(it.subtotal_orig).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        {so.status === 'draft' && <button className="btn btn-danger" onClick={cancel}>取消銷售單</button>}
        {so.status === 'draft' && <button className="btn btn-primary" onClick={confirm}>確認銷售單</button>}
        {['confirmed', 'delivering'].includes(so.status) && (
          <a href={`/sales/sd/new?so_id=${so.id}`} className="btn btn-primary">+ 新增出貨單</a>
        )}
      </div>
    </div>
  );
}
