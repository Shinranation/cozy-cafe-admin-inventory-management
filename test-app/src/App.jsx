import { useEffect, useRef, useState } from 'react'
import Customer from './customer.jsx'
import InventoryDashboard from './InventoryDashboard.jsx'
import RevenuePage from './RevenuePage.jsx'
import QueuePage from './QueuePage.jsx'
import ReceivedQueuePage from './ReceivedQueuePage.jsx'
import NewOrder from './NewOrder.jsx'
import Login from './Login.jsx'
import Signup from './Signup.jsx'
import { supabase } from './lib/supabaseClient.js'

/** @typedef {'customer' | 'inventory' | 'revenue' | 'queue' | 'queueReceived' | 'newOrder' | 'login' | 'signup'} AppPage */

export default function App() {
  const [page, setPage] = useState('customer')
  const [queueRefreshKey, setQueueRefreshKey] = useState(0)
  const [session, setSession] = useState(null)
  const [adminSignedIn, setAdminSignedIn] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
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
      setAdminSignedIn(false)
      return
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
      return
    }

    setUserMenuOpen((open) => !open)
  }

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    setUserMenuOpen(false)
    setPage('customer')
  }

  return (
    <div className="min-h-screen bg-[#FDF8F1] flex flex-col">

      {/* NAVBAR */}
      <nav className="flex justify-between items-center px-6 py-4 bg-white border-b">
        <h1 className="font-bold text-[#5BC0DE]">
          Cozy Coffee
        </h1>

        <div className="flex gap-3 items-center">

          {/* PUBLIC PAGE */}
          <button
            className={navBtn}
            onClick={() => setPage('customer')}
          >
            Customer
          </button>

          {/* ADMIN PAGES (only show if admin) */}
          {adminSignedIn && (
            <>
              <button
                className={navBtn}
                onClick={() => setPage('inventory')}
              >
                Inventory
              </button>

              <button
                className={navBtn}
                onClick={() => setPage('revenue')}
              >
                Revenue
              </button>

              <button
                className={navBtn}
                onClick={() => setPage('queue')}
              >
                Queue
              </button>

              <button
                className={navBtn}
                onClick={() => setPage('queueReceived')}
              >
                Received
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
      </nav>

      {/* PAGE ROUTING */}
      {page === 'customer' && <Customer />}

      {page === 'inventory' && adminSignedIn && <InventoryDashboard />}

      {page === 'revenue' && adminSignedIn && <RevenuePage />}

      {page === 'queue' && adminSignedIn && (
        <QueuePage
          refreshKey={queueRefreshKey}
          onNewOrder={() => setPage('newOrder')}
          onOpenReceived={() => setPage('queueReceived')}
        />
      )}

      {page === 'queueReceived' && adminSignedIn && (
        <ReceivedQueuePage onBackToPending={() => setPage('queue')} />
      )}

      {page === 'newOrder' && adminSignedIn && (
        <NewOrder
          onCancel={() => setPage('queue')}
          onBack={() => {
            setQueueRefreshKey((k) => k + 1)
            setPage('queue')
          }}
        />
      )}

      {page === 'login' && (
        <Login
          onClose={() => setPage('customer')}
          onAdminAccess={() => setPage('customer')}
          onGoToSignup={() => setPage('signup')}
          adminSignedIn={adminSignedIn}
          signedInEmail={signedInUser?.email ?? null}
        />
      )}

      {page === 'signup' && (
        <Signup
          onBackToLogin={() => setPage('login')}
          onClose={() => setPage('customer')}
        />
      )}
    </div>
  )
}
