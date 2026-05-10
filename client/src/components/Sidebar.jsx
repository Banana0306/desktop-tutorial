import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/overview',    icon: '◈', label: '控制總覽' },
  { to: '/products',   icon: '▤', label: '產品管理' },
  { to: '/sales',      icon: '▶', label: '銷貨管理' },
  { to: '/purchase',   icon: '▼', label: '進貨管理' },
  { to: '/inventory',  icon: '▣', label: '庫存管理' },
  { to: '/customers',  icon: '◉', label: '客戶主檔' },
  { to: '/reports',    icon: '▦', label: '報表分析' },
  { to: '/import',     icon: '✈', label: '進口貿易' },
  { to: '/logistics',  icon: '🚛', label: '物流路線' },
]

export default function Sidebar({ collapsed, setCollapsed }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-icon">⚙</span>
        <span className="sidebar-brand-text">零件管理系統</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink key={item.to} to={item.to} className="nav-item">
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-toggle" onClick={() => setCollapsed(c => !c)}>
          <span className="toggle-icon">{collapsed ? '»' : '«'}</span>
          <span className="toggle-label">收合側欄</span>
        </button>
      </div>
    </aside>
  )
}
