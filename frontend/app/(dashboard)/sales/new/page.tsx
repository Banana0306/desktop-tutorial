'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

interface Item { product_id: string; quantity: string; unit_price_orig: string; }

export default function NewSalesOrderPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [currency, setCurrency] = useState('TWD');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Item[]>([{ product_id: '', quantity: '1', unit_price_orig: '' }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/customers').then(res => setCustomers(res.data.data || []));
    api.get('/products').then(res => setProducts(res.data.data || []));
  }, []);

  const addItem = () => setItems(it => [...it, { product_id: '', quantity: '1', unit_price_orig: '' }]);
  const removeItem = (i: number) => setItems(it => it.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof Item, value: string) =>
    setItems(it => it.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  const submit = async () => {
    if (!customerId) { setError('請選擇客戶'); return; }
    const validItems = items.filter(it => it.product_id && it.quantity);
    if (!validItems.length) { setError('請至少填寫一項銷售品項'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/sales-orders', {
        customer_id: Number(customerId),
        currency_code: currency,
        exchange_rate: Number(exchangeRate),
        expected_delivery: expectedDelivery || null,
        notes: notes || null,
        items: validItems.map(it => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          unit_price_orig: it.unit_price_orig ? Number(it.unit_price_orig) : undefined,
        })),
      });
      router.push(`/sales/${res.data.id}`);
    } catch (e: any) {
      setError(e.response?.data?.error || '建立失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">新增銷售單</h1>
        <a href="/sales" className="btn btn-outline">返回列表</a>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">客戶 *</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">請選擇</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">幣別</label>
            <select value={currency} onChange={e => setCurrency(e.target.value)}>
              {['TWD', 'USD', 'THB', 'CNY', 'EUR', 'JPY'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">匯率</label>
            <input type="number" step="0.0001" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">預計交貨日</label>
            <input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: 'span 2' }}>
            <label className="form-label">備註</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <strong>銷售品項</strong>
          <button className="btn btn-outline btn-sm" onClick={addItem}>+ 新增品項</button>
        </div>
        <table>
          <thead><tr><th>商品</th><th>數量</th><th>單價 (原幣，留空則自動帶入)</th><th>小計</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td>
                  <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                    <option value="">請選擇商品</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>)}
                  </select>
                </td>
                <td><input type="number" value={it.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></td>
                <td><input type="number" step="0.01" value={it.unit_price_orig} onChange={e => updateItem(i, 'unit_price_orig', e.target.value)} /></td>
                <td style={{ textAlign: 'right' }}>{(Number(it.quantity || 0) * Number(it.unit_price_orig || 0)).toLocaleString()}</td>
                <td>{items.length > 1 && <button className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>移除</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <a href="/sales" className="btn btn-outline">取消</a>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? '建立中...' : '建立銷售單'}</button>
      </div>
    </div>
  );
}
