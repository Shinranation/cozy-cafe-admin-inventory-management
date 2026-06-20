import { useState } from 'react'
import ActivityLogsPage from '../features/activity-logs/ActivityLogsPage.jsx'
import Login from '../features/auth/Login.jsx'
import Signup from '../features/auth/Signup.jsx'
import InventoryPage from '../features/inventory/InventoryPage.jsx'
import MenuPage from '../features/menu/MenuPage.jsx'
import NewOrderPage from '../features/new-order/NewOrderPage.jsx'
import OrdersPage from '../features/orders/OrdersPage.jsx'
import ReceiptsPage from '../features/receipts/ReceiptsPage.jsx'
import SalesPage from '../features/sales/SalesPage.jsx'
import { supabase } from '../lib/supabaseClient.js'
import { useAdminRole } from './auth/useAdminRole.js'
import { useSession } from './auth/useSession.js'
import Navbar from './navigation/Navbar.jsx'

/** @typedef {'menu' | 'inventory' | 'sales' | 'orders' | 'receipts' | 'newOrder' | 'activityLogs' | 'login' | 'signup'} AppPage */

export default function App() {
  const [page, setPage] = useState('menu')
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)
  const session = useSession()
  const signedInUser = session?.user ?? null
  const adminSignedIn = useAdminRole(signedInUser)

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setPage('menu')
  }

  return (
    <div className="min-h-screen bg-[#FDF8F1] flex flex-col">
      <Navbar
        adminSignedIn={adminSignedIn}
        signedInUser={signedInUser}
        onNavigate={setPage}
        onSignOut={handleSignOut}
      />

      {page === 'menu' && <MenuPage />}

      {page === 'inventory' && adminSignedIn && <InventoryPage />}

      {page === 'sales' && adminSignedIn && <SalesPage />}

      {page === 'orders' && adminSignedIn && (
        <OrdersPage
          refreshKey={ordersRefreshKey}
          onNewOrder={() => setPage('newOrder')}
          onOpenReceipts={() => setPage('receipts')}
        />
      )}

      {page === 'receipts' && adminSignedIn && (
        <ReceiptsPage onBackToOrders={() => setPage('orders')} />
      )}

      {page === 'activityLogs' && adminSignedIn && <ActivityLogsPage />}

      {page === 'newOrder' && adminSignedIn && (
        <NewOrderPage
          onCancel={() => setPage('orders')}
          onBack={() => {
            setOrdersRefreshKey((k) => k + 1)
            setPage('orders')
          }}
        />
      )}

      {page === 'login' && (
        <Login
          onClose={() => setPage('menu')}
          onAdminAccess={() => setPage('menu')}
          onGoToSignup={() => setPage('signup')}
          adminSignedIn={adminSignedIn}
          signedInEmail={signedInUser?.email ?? null}
        />
      )}

      {page === 'signup' && (
        <Signup
          onBackToLogin={() => setPage('login')}
          onClose={() => setPage('menu')}
        />
      )}
    </div>
  )
}
