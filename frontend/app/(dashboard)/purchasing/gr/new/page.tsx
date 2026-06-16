'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

export default function NewGoodsReceiptPage() {
  return (
    <Suspense fallback={<div className="loading">載入中...</div>}>
      <NewGoodsReceiptForm />
    </Suspense>
  );
}

function NewGoodsReceiptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const poId = searchParams.get('po_id');

  const [po, setPo] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!poId) { setLoading(false); return; }
    Promise.all([api.get(`/purchase-orders/${poId}`), api.get('/warehouses')]).then(([poRes, whRes]) => {
      setPo(poRes.data);
      setWarehouses(whRes.data.data || []);
      const initial: Record<string, string> = {};
      (poRes.data.items || []).forEach((it: any) => { initial[it.id] = String(it.quantity); });
      setQuantities(initial);
    }).finally(() => setLoading(false));
  }, [poId]);

  const submit = async () => {
    if (!warehouseId) { setError('請選擇收貨倉庫'); return; }
    const items = (po.items || [])
      .filter((it: any) => Number(quantities[it.id]) > 0)
      .map((it: any) => ({
        po_item_id: it.id,
        product_id: it.product_id,
        quantity: Number(quantities[it.id]),
        unit_price_orig: Number(it.unit_price_orig),
      }));
    if (!items.length) { setError('請至少填寫一項收貨數量'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/goods-receipts', {
        po_id: Number(poId),
        warehouse_id: Number(warehouseId),
        received_date: receivedDate,
        exchange_rate: po.exchange_rate,
        notes: notes || null,
        items,
      });
      router.push(`/purchasing/gr/${res.data.id}`);
    } catch (e: any) {
      setError(e.response?.data?.error || '建立失敗');
    } finally {
      setSaving(false);
    }
  };

  if (!poId) return <div className="alert alert-error">缺少採購單編號</div>;
  if (loading) return <div className="loading">載入中...</div>;
  if (!po) return <div className="alert alert-error">採購單不存在</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">新增收貨單 - {po.po_number}</h1>
        <a href={`/purchasing/${po.id}`} className="btn btn-outline">返回採購單</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">收貨倉庫 *</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              <option value="">請選擇</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">收貨日期</label>
            <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">備註</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <strong>收貨品項</strong>
        <table style={{ marginTop: '0.75rem' }}>
          <thead><tr><th>商品</th><th>採購數量</th><th>收貨數量</th><th>單價 (原幣)</th></tr></thead>
          <tbody>
            {(po.items || []).map((it: any) => (
              <tr key={it.id}>
                <td>{it.product_snapshot?.name} ({it.product_snapshot?.sku})</td>
                <td>{Number(it.quantity).toLocaleString()}</td>
                <td>
                  <input type="number" value={quantities[it.id] || ''}
                    onChange={e => setQuantities(q => ({ ...q, [it.id]: e.target.value }))} />
                </td>
                <td style={{ textAlign: 'right' }}>{Number(it.unit_price_orig).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <a href={`/purchasing/${po.id}`} className="btn btn-outline">取消</a>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '建立中...' : '建立收貨單'}</button>
      </div>
    </div>
  );
}
