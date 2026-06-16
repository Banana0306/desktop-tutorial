'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

export default function NewSalesDeliveryPage() {
  return (
    <Suspense fallback={<div className="loading">載入中...</div>}>
      <NewSalesDeliveryForm />
    </Suspense>
  );
}

function NewSalesDeliveryForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const soId = searchParams.get('so_id');

  const [so, setSo] = useState<any>(null);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!soId) { setLoading(false); return; }
    Promise.all([api.get(`/sales-orders/${soId}`), api.get('/warehouses')]).then(([soRes, whRes]) => {
      setSo(soRes.data);
      setWarehouses(whRes.data.data || []);
      const initial: Record<string, string> = {};
      (soRes.data.items || []).forEach((it: any) => { initial[it.id] = String(it.quantity); });
      setQuantities(initial);
    }).finally(() => setLoading(false));
  }, [soId]);

  const submit = async () => {
    if (!warehouseId) { setError('請選擇出貨倉庫'); return; }
    const items = (so.items || [])
      .filter((it: any) => Number(quantities[it.id]) > 0)
      .map((it: any) => ({
        so_item_id: it.id,
        product_id: it.product_id,
        warehouse_id: Number(warehouseId),
        quantity: Number(quantities[it.id]),
        unit_price_twd: Number(it.unit_price_twd),
      }));
    if (!items.length) { setError('請至少填寫一項出貨數量'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/sales-deliveries', {
        so_id: Number(soId),
        delivery_date: deliveryDate,
        notes: notes || null,
        items,
      });
      router.push(`/sales/sd/${res.data.id}`);
    } catch (e: any) {
      setError(e.response?.data?.error || '建立失敗');
    } finally {
      setSaving(false);
    }
  };

  if (!soId) return <div className="alert alert-error">缺少銷售單編號</div>;
  if (loading) return <div className="loading">載入中...</div>;
  if (!so) return <div className="alert alert-error">銷售單不存在</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">新增出貨單 - {so.so_number}</h1>
        <a href={`/sales/${so.id}`} className="btn btn-outline">返回銷售單</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">出貨倉庫 *</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              <option value="">請選擇</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">出貨日期</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">備註</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <strong>出貨品項</strong>
        <table style={{ marginTop: '0.75rem' }}>
          <thead><tr><th>商品</th><th>訂購數量</th><th>出貨數量</th><th>單價 (TWD)</th></tr></thead>
          <tbody>
            {(so.items || []).map((it: any) => (
              <tr key={it.id}>
                <td>{it.product_snapshot?.name} ({it.product_snapshot?.sku})</td>
                <td>{Number(it.quantity).toLocaleString()}</td>
                <td>
                  <input type="number" value={quantities[it.id] || ''}
                    onChange={e => setQuantities(q => ({ ...q, [it.id]: e.target.value }))} />
                </td>
                <td style={{ textAlign: 'right' }}>{Number(it.unit_price_twd).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <a href={`/sales/${so.id}`} className="btn btn-outline">取消</a>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '建立中...' : '建立出貨單'}</button>
      </div>
    </div>
  );
}
