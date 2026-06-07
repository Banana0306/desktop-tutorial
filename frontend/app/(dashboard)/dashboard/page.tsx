'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface KPI { label: string; value: string; sub?: string; color: string; }

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';

    Promise.all([
      api.get(`/reports/gross-profit?start=${monthStart}&end=${today}`),
      api.get('/inventory?low_stock=true').catch(() => ({ data: { data: [] } })),
      api.get('/reports/inventory-valuation'),
      api.get('/ar-invoices?status=unpaid').catch(() => ({ data: { data: [] } })),
    ]).then(([gp, ls, iv, ar]) => {
      const gpData = gp.data.data || [];
      const revenue = gpData.find((r: any) => r.metric === '營業收入')?.amount_twd || 0;
      const grossProfit = gpData.find((r: any) => r.metric === '毛利')?.amount_twd || 0;
      const ivTotal = (iv.data.data || []).reduce((s: number, r: any) => s + Number(r.value_twd || 0), 0);
      const arTotal = (ar.data.data || []).reduce((s: number, r: any) => s + Number(r.amount_remaining || 0), 0);
      setKpis([
        { label: '本月營業收入', value: `NT$ ${Number(revenue).toLocaleString()}`, color: '#3b82f6' },
        { label: '本月毛利', value: `NT$ ${Number(grossProfit).toLocaleString()}`, color: '#22c55e' },
        { label: '庫存總值', value: `NT$ ${Math.round(ivTotal).toLocaleString()}`, color: '#8b5cf6' },
        { label: '應收帳款餘額', value: `NT$ ${Math.round(arTotal).toLocaleString()}`, color: '#f59e0b' },
      ]);
      setLowStock((ls.data.data || []).slice(0, 5));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">載入儀表板...</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">儀表板</h1>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {kpis.map(kpi => (
          <div key={kpi.label} className="kpi-card">
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: kpi.color, marginTop: '0.5rem' }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* Low Stock */}
      {lowStock.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '0.875rem', fontSize: '0.9rem' }}>⚠️ 庫存預警</div>
          <table>
            <thead><tr><th>商品</th><th>SKU</th><th>倉庫</th><th>庫存數量</th></tr></thead>
            <tbody>
              {lowStock.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.product_name}</td>
                  <td style={{ color: '#64748b' }}>{r.sku}</td>
                  <td>{r.warehouse_code}</td>
                  <td><span className="badge badge-red">{r.qty}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {[
          { href: '/purchasing', label: '新增採購單', icon: '🛒', desc: '向供應商下訂單' },
          { href: '/sales', label: '新增銷售單', icon: '💰', desc: '建立客戶訂單' },
          { href: '/reports', label: '查看報表', icon: '📈', desc: '毛利、庫存分析' },
        ].map(item => (
          <a key={item.href} href={item.href} className="card" style={{ textDecoration: 'none', display: 'block', cursor: 'pointer', transition: 'transform 0.15s' }}>
            <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{item.icon}</div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>{item.label}</div>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>{item.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
