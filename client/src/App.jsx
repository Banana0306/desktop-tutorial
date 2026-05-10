import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Overview    from './pages/Overview.jsx'
import Products    from './pages/Products.jsx'
import Sales       from './pages/Sales.jsx'
import Purchase    from './pages/Purchase.jsx'
import Inventory   from './pages/Inventory.jsx'
import Customers   from './pages/Customers.jsx'
import Reports     from './pages/Reports.jsx'
import ImportTrade from './pages/ImportTrade.jsx'
import Logistics   from './pages/Logistics.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview"   element={<Overview />} />
        <Route path="products"   element={<Products />} />
        <Route path="sales"      element={<Sales />} />
        <Route path="purchase"   element={<Purchase />} />
        <Route path="inventory"  element={<Inventory />} />
        <Route path="customers"  element={<Customers />} />
        <Route path="reports"    element={<Reports />} />
        <Route path="import"     element={<ImportTrade />} />
        <Route path="logistics"  element={<Logistics />} />
      </Route>
    </Routes>
  )
}
