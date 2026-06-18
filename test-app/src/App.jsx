import { useEffect, useRef, useState } from 'react'
import MenuPage from './MenuPage.jsx'
import InventoryPage from './InventoryPage.jsx'
import SalesPage from './SalesPage.jsx'
import OrdersPage from './OrdersPage.jsx'
import ReceiptsPage from './ReceiptsPage.jsx'
import NewOrderPage from './NewOrderPage.jsx'
import ActivityLogsPage from './ActivityLogsPage.jsx'
import Login from './Login.jsx'
import Signup from './Signup.jsx'
import { supabase } from './lib/supabaseClient.js'

/** @typedef {'menu' | 'inventory' | 'sales' | 'orders' | 'receipts' | 'newOrder' | 'activityLogs' | 'login' | 'signup'} AppPage */

export default function App() {
  const [page, setPage] = useState('menu')
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)
  const [session, setSession] = useState(null)
  const [adminSignedIn, setAdminSignedIn] = useState(false)
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navMenuRef = useRef(null)
  const userMenuRef = useRef(null)

  const signedInUser = session?.user ?? null

  // NAV BUTTON STYLE (optional if you want styling later)
  const navBtn =
    'text-sm font-semibold px-3 py-1 rounded hover:opacity-80 transition'

  // GET SESSION
  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession ?? null)
      }
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  // CHECK ADMIN ROLE
  useEffect(() => {
    if (!supabase || !signedInUser) {
      const timeoutId = window.setTimeout(() => setAdminSignedIn(false), 0)
      return () => window.clearTimeout(timeoutId)
    }

    let alive = true

    ;(async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', signedInUser.id)
        .maybeSingle()

      if (!alive) return

      if (error) {
        setAdminSignedIn(false)
        return
      }

      setAdminSignedIn(data?.role === 'admin')
    })()

    return () => {
      alive = false
    }
  }, [signedInUser])

  useEffect(() => {
    function handlePointerDown(event) {
      if (!navMenuRef.current?.contains(event.target)) {
        setNavMenuOpen(false)
      }

      if (!userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  function handleUserButtonClick() {
    if (!signedInUser) {
      setPage('login')
      setNavMenuOpen(false)
      return
    }

    setUserMenuOpen((open) => !open)
  }

  function handleNavigate(nextPage) {
    setPage(nextPage)
    setNavMenuOpen(false)
    setUserMenuOpen(false)
  }

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setNavMenuOpen(false)
    setUserMenuOpen(false)
    setPage('menu')
  }

  return (
    <div className="min-h-screen bg-[#FDF8F1] flex flex-col">

      {/* NAVBAR */}
      <nav className="relative flex items-center justify-between gap-4 border-b bg-white px-6 py-4">
        <h1 className="min-w-0 text-xl font-extrabold leading-tight text-[#5BC0DE] sm:text-2xl md:text-3xl">
          The Cozzy Cup Cafe
        </h1>

        <div className="hidden flex-wrap items-center justify-end gap-3 md:flex">

          {/* PUBLIC PAGE */}
          <button
            className={navBtn}
            onClick={() => handleNavigate('menu')}
          >
            Menu
          </button>

          {/* ADMIN PAGES (only show if admin) */}
          {adminSignedIn && (
            <>
              <button
                className={navBtn}
                onClick={() => handleNavigate('inventory')}
              >
                Inventory
              </button>

              <button
                className={navBtn}
                onClick={() => handleNavigate('sales')}
              >
                Sales
              </button>

              <button
                className={navBtn}
                onClick={() => handleNavigate('orders')}
              >
                Orders
              </button>

              <button
                className={navBtn}
                onClick={() => handleNavigate('receipts')}
              >
                Receipts
              </button>

              <button
                className={navBtn}
                onClick={() => handleNavigate('activityLogs')}
              >
                Activity Logs
              </button>
            </>
          )}

          <div className="relative" ref={userMenuRef}>
            {/* LOGIN BUTTON (ALWAYS VISIBLE) */}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-lg shadow-sm transition hover:bg-gray-50"
              onClick={handleUserButtonClick}
              title={signedInUser?.email ?? 'Login'}
              aria-haspopup={signedInUser ? 'menu' : undefined}
              aria-expanded={signedInUser ? userMenuOpen : undefined}
            >
            👤
          </button>

            {signedInUser && userMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-gray-200 bg-white p-2 text-sm shadow-lg"
              >
                <div className="border-b border-gray-100 px-3 py-2">
                  <p className="truncate font-semibold text-gray-800">{signedInUser.email}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {adminSignedIn ? 'Admin access' : 'Signed in'}
                  </p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="mt-2 w-full rounded-lg px-3 py-2 text-left font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 md:hidden" ref={navMenuRef}>
          <button
            type="button"
            onClick={() => setNavMenuOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white shadow-sm transition hover:bg-gray-50"
            aria-label="Open navigation menu"
            aria-expanded={navMenuOpen}
          >
            <span className="flex flex-col gap-1.5">
              <span className="h-0.5 w-5 rounded bg-gray-800" />
              <span className="h-0.5 w-5 rounded bg-gray-800" />
              <span className="h-0.5 w-5 rounded bg-gray-800" />
            </span>
            </button>

          {navMenuOpen && (
            <div className="absolute right-4 top-[calc(100%+0.5rem)] z-50 w-64 rounded-xl border border-gray-200 bg-white p-2 text-sm shadow-lg">
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                onClick={() => handleNavigate('menu')}
              >
                Menu
              </button>

              {adminSignedIn && (
                <>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                    onClick={() => handleNavigate('inventory')}
                  >
                    Inventory
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                    onClick={() => handleNavigate('sales')}
                  >
                    Sales
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                    onClick={() => handleNavigate('orders')}
                  >
                    Orders
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                    onClick={() => handleNavigate('receipts')}
                  >
                    Receipts
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                    onClick={() => handleNavigate('activityLogs')}
                  >
                    Activity Logs
                  </button>
                </>
              )}

              <div className="mt-2 border-t border-gray-100 pt-2">
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                  onClick={() => {
                    if (!signedInUser) handleUserButtonClick()
                  }}
                >
                  {signedInUser ? signedInUser.email : 'Login'}
                </button>

                {signedInUser && (
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left font-semibold text-red-600 transition hover:bg-red-50"
                    onClick={handleSignOut}
                  >
                    Sign out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* PAGE ROUTING */}
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
