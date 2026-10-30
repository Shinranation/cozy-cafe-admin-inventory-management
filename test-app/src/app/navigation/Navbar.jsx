import { useEffect, useRef, useState } from 'react'

const navBtn =
  'rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-[#D98C5F]/50 hover:bg-[#FFF7F1]'

const navItems = [
  { page: 'menu', label: 'Menu' },
  { page: 'inventory', label: 'Inventory' },
  { page: 'sales', label: 'Sales' },
  { page: 'orders', label: 'Orders' },
  { page: 'receipts', label: 'Receipts' },
  { page: 'activityLogs', label: 'Activity Logs' },
]

export default function Navbar({ onNavigate }) {
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const navMenuRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (!navMenuRef.current?.contains(event.target)) {
        setNavMenuOpen(false)
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
  }

  return (
    <nav className="relative flex items-center justify-between gap-4 border-b bg-white px-6 py-4">
      <h1 className="min-w-0 text-xl font-extrabold leading-tight text-[#5BC0DE] sm:text-2xl md:text-3xl">
        The Cozzy Cup Cafe
      </h1>

      <div className="hidden flex-wrap items-center justify-end gap-3 md:flex">
        {navItems.map((item) => (
          <button
            key={item.page}
            className={navBtn}
            onClick={() => handleNavigate(item.page)}
          >
            {item.label}
          </button>
        ))}

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
            {navItems.map((item) => (
              <button
                key={item.page}
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left font-semibold text-gray-800 transition hover:bg-[#FFF7F1]"
                onClick={() => handleNavigate(item.page)}
              >
                {item.label}
              </button>
            ))}

          </div>
        )}
      </div>
    </nav>
  )
}
