import { useEffect, useState } from 'react'
import Customer from './customer.jsx'
import InventoryDashboard from './InventoryDashboard.jsx'
import RevenuePage from './RevenuePage.jsx'
import QueuePage from './QueuePage.jsx'
import Login from './Login.jsx'
import { supabase } from './lib/supabaseClient.js'

/** @typedef {'customer' | 'inventory' | 'revenue' | 'queue' | 'login'} AppPage */

export default function App() {
  const [page, setPage] = useState('customer')
  const [session, setSession] = useState(null)
  const [adminSignedIn, setAdminSignedIn] = useState(false)

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

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
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

          {/* ADMIN PAGES (always visible buttons, but protected on render) */}
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

          {/* LOGIN BUTTON */}
          <button
            className="text-lg px-2"
            onClick={() => setPage('login')}
            title={signedInUser?.email ?? 'Login'}
          >
            👤
          </button>

          {/* SIGN OUT */}
          {signedInUser && (
            <button
              onClick={handleSignOut}
              className="text-xs text-red-500 ml-2"
            >
              Sign out
            </button>
          )}
        </div>
      </nav>

      {/* PAGE ROUTING */}
      {page === 'customer' && <Customer />}

      {page === 'inventory' && adminSignedIn && <InventoryDashboard />}

      {page === 'revenue' && adminSignedIn && <RevenuePage />}

      {page === 'queue' && adminSignedIn && <QueuePage />}

      {page === 'login' && (
        <Login
          onClose={() => setPage('customer')}
          onAdminAccess={() => setPage('customer')}
          adminSignedIn={adminSignedIn}
          signedInEmail={signedInUser?.email ?? null}
        />
      )}
    </div>
  )
}