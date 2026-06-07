'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: '', name: '', contact_name: '', phone: '', email: '', currency_code: 'TWD', payment_terms: '30' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/suppliers', { params: { search } });
      setSuppliers(res.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', contact_name: '', phone: '', email: '', currency_code: 'TWD', payment_terms: '30' });
    setError(''); setShowModal(true);
  };

  const openEdit = (s: any) => {
    setEditing(s);
    setForm({ code: s.code, name: s.name, contact_name: s.contact_name || '', phone: s.phone || '', email: s.email || '', currency_code: s.currency_code || 'TWD', payment_terms: String(s.payment_terms || 30) });
    setError(''); setShowModal(true);
  };

  const save = async () => {
    if (!form.code || !form.name) { setError('請填寫代碼和名稱'); return; }
    setSaving(true);
    try {
      const payload = { ...form, payment_terms: Number(form.payment_terms) };
      if (editing) await api.put(`/suppliers/${editing.id}`, payload);
      else await api.post('/suppliers', payload);
      setShowModal(false); load();
    } catch (e: any) { setError(e.response?.data?.error || '儲存失敗'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">供應商管理</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="search-bar"><span>🔍</span><input placeholder="搜尋供應商" value={search} onChange={e => setSearch(e.target.value)} /></div>
          <button className="btn btn-primary" onClick={openCreate}>+ 新增供應商</button>
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">載入中...</div> : (
          <table>
            <thead><tr><th>代碼</th><th>名稱</th><th>聯絡人</th><th>電話</th><th>幣別</th><th>付款天數</th><th>操作</th></tr></thead>
            <tbody>
              {suppliers.map((s: any) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.code}</td>
                  <td>{s.name}</td>
                  <td>{s.contact_name || '-'}</td>
                  <td>{s.phone || '-'}</td>
                  <td><span className="badge badge-blue">{s.currency_code}</span></td>
                  <td>{s.payment_terms} 天</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}>編輯</button></td>
                </tr>
              ))}
              {suppliers.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無供應商資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? '編輯供應商' : '新增供應商'}</div>
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group"><label className="form-label">代碼 *</label><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">名稱 *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">聯絡人</label><input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">電話</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">幣別</label>
                <select value={form.currency_code} onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}>
                  {['TWD', 'USD', 'THB', 'CNY', 'EUR', 'JPY'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">付款條件 (天)</label><input type="number" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} /></div>
            </div>
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
