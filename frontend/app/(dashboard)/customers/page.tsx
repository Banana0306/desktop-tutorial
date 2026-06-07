'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

const TIERS = ['regular', 'silver', 'gold', 'platinum'];
const TIER_LABELS: Record<string, string> = { regular: '一般', silver: '銀', gold: '金', platinum: '白金' };
const TIER_BADGE: Record<string, string> = { regular: 'badge-gray', silver: 'badge-blue', gold: 'badge-yellow', platinum: 'badge-purple' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ code: '', name: '', contact_name: '', phone: '', email: '', tier: 'regular', credit_limit: '0', payment_terms: '30', currency_code: 'TWD' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers', { params: { search } });
      setCustomers(res.data.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: '', name: '', contact_name: '', phone: '', email: '', tier: 'regular', credit_limit: '0', payment_terms: '30', currency_code: 'TWD' });
    setError(''); setShowModal(true);
  };

  const openEdit = (c: any) => {
    setEditing(c);
    setForm({ code: c.code, name: c.name, contact_name: c.contact_name || '', phone: c.phone || '', email: c.email || '', tier: c.tier, credit_limit: String(c.credit_limit || 0), payment_terms: String(c.payment_terms || 30), currency_code: c.currency_code || 'TWD' });
    setError(''); setShowModal(true);
  };

  const save = async () => {
    if (!form.code || !form.name) { setError('請填寫代碼和名稱'); return; }
    setSaving(true);
    try {
      const payload = { ...form, credit_limit: Number(form.credit_limit), payment_terms: Number(form.payment_terms) };
      if (editing) await api.put(`/customers/${editing.id}`, payload);
      else await api.post('/customers', payload);
      setShowModal(false); load();
    } catch (e: any) { setError(e.response?.data?.error || '儲存失敗'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">客戶管理</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="search-bar">
            <span>🔍</span>
            <input placeholder="搜尋客戶" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={openCreate}>+ 新增客戶</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="loading">載入中...</div> : (
          <table>
            <thead><tr><th>代碼</th><th>客戶名稱</th><th>聯絡人</th><th>電話</th><th>等級</th><th>信用額度</th><th>幣別</th><th>操作</th></tr></thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.contact_name || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td><span className={`badge ${TIER_BADGE[c.tier] || 'badge-gray'}`}>{TIER_LABELS[c.tier] || c.tier}</span></td>
                  <td style={{ textAlign: 'right' }}>{Number(c.credit_limit || 0).toLocaleString()}</td>
                  <td>{c.currency_code}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => openEdit(c)}>編輯</button></td>
                </tr>
              ))}
              {customers.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>無客戶資料</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">{editing ? '編輯客戶' : '新增客戶'}</div>
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group"><label className="form-label">代碼 *</label><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">名稱 *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">聯絡人</label><input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">電話</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">等級</label>
                <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}>
                  {TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">信用額度</label><input type="number" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">付款條件 (天)</label><input type="number" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">幣別</label>
                <select value={form.currency_code} onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}>
                  {['TWD', 'USD', 'THB', 'CNY', 'EUR', 'JPY'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
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
