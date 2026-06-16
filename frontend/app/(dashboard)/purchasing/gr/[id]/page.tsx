'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';

const STATUS_LABEL: Record<string, string> = { draft: '草稿', completed: '已完成', cancelled: '已取消' };

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [gr, setGr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/goods-receipts/${id}`);
      setGr(res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const complete = async () => {
    setError('');
    try { await api.post(`/goods-receipts/${id}/complete`); load(); }
    catch (e: any) { setError(e.response?.data?.error || '操作失敗'); }
  };

  const cancel = async () => {
    setError('');
    try { await api.post(`/goods-receipts/${id}/cancel`); load(); }
    catch (e: any) { setError(e.response?.data?.error || '操作失敗'); }
  };

  if (loading) return <div className="loading">載入中...</div>;
  if (!gr) return <div className="alert alert-error">收貨單不存在</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">收貨單 {gr.gr_number}</h1>
        <a href="/purchasing" className="btn btn-outline">返回列表</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div><div className="form-label">採購單</div><div>{gr.po_number}</div></div>
          <div><div className="form-label">供應商</div><div>{gr.supplier_name}</div></div>
          <div><div className="form-label">倉庫</div><div>{gr.warehouse_name}</div></div>
          <div><div className="form-label">狀態</div><span className="badge badge-blue">{STATUS_LABEL[gr.status] || gr.status}</span></div>
          <div><div className="form-label">收貨日期</div><div>{gr.received_date}</div></div>
          <div><div className="form-label">總金額 (TWD)</div><div>{Number(gr.total_amount_twd).toLocaleString()}</div></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <strong>收貨品項</strong>
        <table style={{ marginTop: '0.75rem' }}>
          <thead><tr><th>商品</th><th>數量</th><th>單價 (原幣)</th><th>小計 (原幣)</th></tr></thead>
          <tbody>
            {(gr.items || []).map((it: any) => (
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

      {gr.status === 'draft' && (
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-danger" onClick={cancel}>取消收貨單</button>
          <button className="btn btn-primary" onClick={complete}>完成收貨</button>
        </div>
      )}
    </div>
  );
}
