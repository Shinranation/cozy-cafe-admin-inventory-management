import { useState } from 'react'
import ActivityLogsPage from '../features/activity-logs/ActivityLogsPage.jsx'
import InventoryPage from '../features/inventory/InventoryPage.jsx'
import MenuPage from '../features/menu/MenuPage.jsx'
import NewOrderPage from '../features/new-order/NewOrderPage.jsx'
import OrdersPage from '../features/orders/OrdersPage.jsx'
import ReceiptsPage from '../features/receipts/ReceiptsPage.jsx'
import SalesPage from '../features/sales/SalesPage.jsx'
import Navbar from './navigation/Navbar.jsx'

/** @typedef {'menu' | 'inventory' | 'sales' | 'orders' | 'receipts' | 'newOrder' | 'activityLogs'} AppPage */

export default function App() {
  const [page, setPage] = useState('menu')
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)
  return (
    <div className="min-h-screen bg-[#FDF8F1] flex flex-col">
      <Navbar onNavigate={setPage} />

      {page === 'menu' && <MenuPage />}

      {page === 'inventory' && <InventoryPage />}

      {page === 'sales' && <SalesPage />}

      {page === 'orders' && (
        <OrdersPage
          refreshKey={ordersRefreshKey}
          onNewOrder={() => setPage('newOrder')}
          onOpenReceipts={() => setPage('receipts')}
        />
      )}

      {page === 'receipts' && (
        <ReceiptsPage onBackToOrders={() => setPage('orders')} />
      )}

      {page === 'activityLogs' && <ActivityLogsPage />}

      {page === 'newOrder' && (
        <NewOrderPage
          onCancel={() => setPage('orders')}
          onBack={() => {
            setOrdersRefreshKey((k) => k + 1)
            setPage('orders')
          }}
        />
      )}

    </div>
  )
}
