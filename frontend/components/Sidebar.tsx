'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/',              label: '儀表板',   icon: '📊' },
  { href: '/products',      label: '商品管理', icon: '📦' },
  { href: '/customers',     label: '客戶管理', icon: '👥' },
  { href: '/suppliers',     label: '供應商',   icon: '🏭' },
  { href: '/purchasing',    label: '採購管理', icon: '🛒' },
  { href: '/sales',         label: '銷售管理', icon: '💰' },
  { href: '/inventory',     label: '庫存管理', icon: '🏪' },
  { href: '/reports',       label: '報表中心', icon: '📈' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <aside style={{
      width: '220px', minHeight: '100vh', background: '#1e293b',
      display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.25rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>瑞城企業 ERP</div>
        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>Enterprise Resource Planning</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.75rem 0.5rem', overflowY: 'auto' }}>
        {navItems.map(item => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.5rem 0.75rem', borderRadius: '0.375rem', marginBottom: '0.125rem',
                fontSize: '0.875rem', fontWeight: active ? 600 : 400,
                color: active ? '#fff' : '#94a3b8',
                background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '1rem' }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{user?.full_name}</div>
          <div style={{ fontSize: '0.7rem', marginTop: '0.1rem' }}>{user?.role}</div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '0.375rem', borderRadius: '0.375rem',
            background: 'rgba(239,68,68,0.1)', color: '#fca5a5',
            border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.8rem', cursor: 'pointer',
          }}
        >
          登出
        </button>
      </div>
    </aside>
  );
}
