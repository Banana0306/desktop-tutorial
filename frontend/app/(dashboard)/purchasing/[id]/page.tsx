'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';

const STATUS_LABEL: Record<string, string> = { draft: '草稿', confirmed: '已確認', receiving: '收貨中', completed: '已完成', cancelled: '已取消' };

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/purchase-orders/${id}`);
      setPo(res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const confirm = async () => {
    setError('');
    try { await api.post(`/purchase-orders/${id}/confirm`); load(); }
    catch (e: any) { setError(e.response?.data?.error || '操作失敗'); }
  };

  const cancel = async () => {
    setError('');
    try { await api.post(`/purchase-orders/${id}/cancel`); load(); }
    catch (e: any) { setError(e.response?.data?.error || '操作失敗'); }
  };

  if (loading) return <div className="loading">載入中...</div>;
  if (!po) return <div className="alert alert-error">採購單不存在</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">採購單 {po.po_number}</h1>
        <a href="/purchasing" className="btn btn-outline">返回列表</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div><div className="form-label">供應商</div><div>{po.supplier_name}</div></div>
          <div><div className="form-label">狀態</div><span className="badge badge-blue">{STATUS_LABEL[po.status] || po.status}</span></div>
          <div><div className="form-label">幣別</div><div>{po.currency_code} (匯率 {po.exchange_rate})</div></div>
          <div><div className="form-label">總金額 (TWD)</div><div>{Number(po.total_amount_twd).toLocaleString()}</div></div>
          <div><div className="form-label">預計交貨日</div><div>{po.expected_delivery || '-'}</div></div>
          <div><div className="form-label">備註</div><div>{po.notes || '-'}</div></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong>採購品項</strong>
        <table style={{ marginTop: '0.75rem' }}>
          <thead><tr><th>商品</th><th>數量</th><th>單價 (原幣)</th><th>小計 (原幣)</th></tr></thead>
          <tbody>
            {(po.items || []).map((it: any) => (
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
        {po.status === 'draft' && <button className="btn btn-danger" onClick={cancel}>取消採購單</button>}
        {po.status === 'draft' && <button className="btn btn-primary" onClick={confirm}>確認採購單</button>}
        {['confirmed', 'receiving'].includes(po.status) && (
          <a href={`/purchasing/gr/new?po_id=${po.id}`} className="btn btn-primary">+ 新增收貨單</a>
        )}
      </div>
    </div>
  );
}
