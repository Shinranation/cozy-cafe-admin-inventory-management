import { useEffect, useRef, useState } from 'react'

const navBtn =
  'rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-[#D98C5F]/50 hover:bg-[#FFF7F1]'

const navItems = [
  { page: 'menu', label: 'Menu', adminOnly: false },
  { page: 'inventory', label: 'Inventory', adminOnly: true },
  { page: 'sales', label: 'Sales', adminOnly: true },
  { page: 'orders', label: 'Orders', adminOnly: true },
  { page: 'receipts', label: 'Receipts', adminOnly: true },
  { page: 'activityLogs', label: 'Activity Logs', adminOnly: true },
]

export default function Navbar({
  adminSignedIn,
  signedInUser,
  onNavigate,
  onSignOut,
}) {
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navMenuRef = useRef(null)
  const userMenuRef = useRef(null)

  const visibleNavItems = navItems.filter((item) => !item.adminOnly || adminSignedIn)

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

  function handleNavigate(page) {
    onNavigate(page)
    setNavMenuOpen(false)
    setUserMenuOpen(false)
  }

  function handleUserButtonClick() {
    if (!signedInUser) {
      handleNavigate('login')
      return
    }

    setUserMenuOpen((open) => !open)
  }

  function handleSignOut() {
    setNavMenuOpen(false)
    setUserMenuOpen(false)
    onSignOut()
  }

  return (
    <nav className="relative flex items-center justify-between gap-4 border-b bg-white px-6 py-4">
      <h1 className="min-w-0 text-xl font-extrabold leading-tight text-[#5BC0DE] sm:text-2xl md:text-3xl">
        The Cozzy Cup Cafe
      </h1>

      <div className="hidden flex-wrap items-center justify-end gap-3 md:flex">
        {visibleNavItems.map((item) => (
          <button
            key={item.page}
            className={navBtn}
            onClick={() => handleNavigate(item.page)}
          >
            {item.label}
          </button>
        ))}

        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
            onClick={handleUserButtonClick}
            title={signedInUser?.email ?? 'Login'}
            aria-haspopup={signedInUser ? 'menu' : undefined}
            aria-expanded={signedInUser ? userMenuOpen : undefined}
          >
            U
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
            {visibleNavItems.map((item) => (
              <button
                key={item.page}
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                onClick={() => handleNavigate(item.page)}
              >
                {item.label}
              </button>
            ))}

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
  )
}
