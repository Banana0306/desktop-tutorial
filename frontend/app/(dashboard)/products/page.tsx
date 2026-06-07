'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface Product {
  id: number; sku: string; name: string; unit: string;
  list_price: number; weight_kg?: number; is_active: boolean;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ sku: '', name: '', unit: '件', list_price: '', weight_kg: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/products', { params: { search } });
      setProducts(res.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ sku: '', name: '', unit: '件', list_price: '', weight_kg: '' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ sku: p.sku, name: p.name, unit: p.unit, list_price: String(p.list_price), weight_kg: String(p.weight_kg || '') });
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    if (!form.sku || !form.name || !form.list_price) { setError('請填寫必填欄位'); return; }
    setSaving(true);
    try {
      const payload = { ...form, list_price: Number(form.list_price), weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined };
      if (editing) await api.put(`/products/${editing.id}`, payload);
      else await api.post('/products', payload);
      setShowModal(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || '儲存失敗');
    } finally { setSaving(false); }
  };

  const toggleActive = async (p: Product) => {
    await api.patch(`/products/${p.id}`, { is_active: !p.is_active });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">商品管理</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="search-bar">
            <span>🔍</span>
            <input placeholder="搜尋 SKU 或品名" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ 新增商品</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">載入中...</div> : (
          <table>
            <thead><tr><th>SKU</th><th>品名</th><th>單位</th><th>售價 (TWD)</th><th>重量 (kg)</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.unit}</td>
                  <td style={{ textAlign: 'right' }}>{Number(p.list_price).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{p.weight_kg || '-'}</td>
                  <td>
                    <span className={p.is_active ? 'badge badge-green' : 'badge badge-gray'}>
                      {p.is_active ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)} style={{ marginRight: '0.375rem' }}>編輯</button>
                    <button className={`btn btn-sm ${p.is_active ? 'btn-danger' : 'btn-outline'}`} onClick={() => toggleActive(p)}>
                      {p.is_active ? '停用' : '啟用'}
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無商品資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? '編輯商品' : '新增商品'}</div>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group"><label className="form-label">SKU *</label><input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="例: MIC-100-12" /></div>
            <div className="form-group"><label className="form-label">品名 *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="商品名稱" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group"><label className="form-label">單位</label><input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">售價 (TWD) *</label><input type="number" value={form.list_price} onChange={e => setForm(f => ({ ...f, list_price: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">重量 (kg)</label><input type="number" step="0.01" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '儲存中...' : '儲存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
