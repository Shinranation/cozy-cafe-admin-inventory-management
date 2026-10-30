import { useState } from 'react'
import ActivityLogsPage from '../features/activity-logs/ActivityLogsPage.jsx'
import InventoryPage from '../features/inventory/InventoryPage.jsx'
import MenuPage from '../features/menu/MenuPage.jsx'
import NewOrderPage from '../features/new-order/NewOrderPage.jsx'
import OrdersPage from '../features/orders/OrdersPage.jsx'
import ReceiptsPage from '../features/receipts/ReceiptsPage.jsx'
import SalesPage from '../features/sales/SalesPage.jsx'
import Navbar from './navigation/Navbar.jsx'
import { demoMode, supabaseConfigured } from '../lib/supabaseClient.js'

/** @typedef {'menu' | 'inventory' | 'sales' | 'orders' | 'receipts' | 'newOrder' | 'activityLogs'} AppPage */

export default function App() {
  const [page, setPage] = useState('menu')
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)
  return (
    <div className="min-h-screen bg-[#FDF8F1] flex flex-col">
      <Navbar onNavigate={setPage} />
      {demoMode && (
        <div role="status" className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-900">
          {supabaseConfigured()
            ? 'Public demo: everyone can edit this shared sample data.'
            : 'Public demo setup is incomplete. Configure the demo database URL and public key.'}
        </div>
      )}

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
