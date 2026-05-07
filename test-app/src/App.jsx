import { useEffect, useState } from 'react'
import PromotionsPage from './PromotionsPage.jsx'
import InventoryDashboard from './InventoryDashboard.jsx'
import Login from './Login.jsx'
import { supabase } from './lib/supabaseClient.js'

/** @typedef {'promotions' | 'inventory' | 'login'} AppPage */

export default function App() {
  const [page, setPage] = useState(/** @type {AppPage} */ ('promotions'))
  const [session, setSession] = useState(null)
  const [adminSignedIn, setAdminSignedIn] = useState(false)

  const navBtn =
    'text-sm font-semibold pb-0.5 border-b-2 border-transparent hover:opacity-80 transition-colors'
  const signedInUser = session?.user ?? null

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !signedInUser) {
      setAdminSignedIn(false)
      return
    }

    let alive = true
    void (async () => {
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
    setPage('promotions')
  }

  return (
    <div className="min-h-screen bg-[#FDF8F1] font-sans text-gray-800 flex flex-col">
      <nav className="flex flex-wrap justify-between items-center gap-4 px-6 sm:px-10 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl sm:text-2xl font-bold text-[#5BC0DE]">Cozy Coffee</h1>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => setPage('promotions')}
            className={`${navBtn} ${page === 'promotions' ? 'text-[#D98C5F] border-[#D98C5F]' : 'text-[#5BC0DE]'}`}
          >
            Promotions
          </button>
          {adminSignedIn && (
            <button
              type="button"
              onClick={() => setPage('inventory')}
              className={`${navBtn} ${page === 'inventory' ? 'text-[#D98C5F] border-[#D98C5F]' : 'text-[#5BC0DE]'}`}
            >
              Admin Inventory
            </button>
          )}
          <span className="text-[#5BC0DE] text-sm font-semibold opacity-70 cursor-default">Menu</span>
          <span className="text-[#5BC0DE] text-sm font-semibold opacity-70 cursor-default">About Us</span>
          <button
            type="button"
            onClick={() => setPage('login')}
            className="w-9 h-9 rounded-full border-2 border-[#5BC0DE] flex items-center justify-center text-[#5BC0DE] text-lg"
            title={signedInUser ? `Signed in as ${signedInUser.email ?? 'user'}` : 'Login'}
          >
            👤
          </button>
          {signedInUser && (
            <button type="button" onClick={handleSignOut} className="text-xs font-semibold text-[#D98C5F]">
              Sign out
            </button>
          )}
        </div>
      </nav>

      {page === 'promotions' && <PromotionsPage />}
      {page === 'inventory' && adminSignedIn && <InventoryDashboard />}
      {page === 'login' && (
        <Login
          onClose={() => setPage('promotions')}
          onAdminAccess={() => setPage('promotions')}
          adminSignedIn={adminSignedIn}
          signedInEmail={signedInUser?.email ?? null}
        />
      )}

      <footer className="w-full h-16 bg-[#D9C8B1] border-t border-[#BFA888] mt-auto" />
    </div>
  )
}
