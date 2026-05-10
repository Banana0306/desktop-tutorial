import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'

const titleMap = {
  '/overview':   '控制總覽',
  '/products':  '產品管理',
  '/sales':     '銷貨管理',
  '/purchase':  '進貨管理',
  '/inventory': '庫存管理',
  '/customers': '客戶主檔',
  '/reports':   '報表分析',
  '/import':    '進口貿易',
  '/logistics': '物流路線規劃',
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const loc = useLocation()
  const title = titleMap[loc.pathname] ?? '管理系統'

  return (
    <div className={`layout${collapsed ? ' collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">{title}</span>
          <span className="topbar-spacer" />
          <span className="topbar-dot" />
          <span className="topbar-user">admin@scooterparts.tw</span>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
