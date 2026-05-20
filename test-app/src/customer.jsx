import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

function parseRpcJsonArray(data) {
  if (data == null) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function normalizeMenuRows(rows) {
  return rows
    .map((r) => {
      const availabilityStatus = String(r.availability_status ?? 'available')

      return {
        id: Number(r.item_id),
        name: String(r.name ?? ''),
        description: String(r.description ?? ''),
        category: String(r.category ?? ''),
        price: Number(r.price),
        availabilityStatus,
      }
    })
    .filter(
      (r) =>
        Number.isFinite(r.id) &&
        r.id > 0 &&
        r.availabilityStatus.toLowerCase() === 'available',
    )
}

function mergeMenuRows(primaryRows, fallbackRows) {
  const rowsById = new Map()

  for (const row of fallbackRows) {
    rowsById.set(row.id, row)
  }

  for (const row of primaryRows) {
    rowsById.set(row.id, row)
  }

  return [...rowsById.values()].sort((a, b) => {
    const categoryOrder = a.category.localeCompare(b.category)
    if (categoryOrder !== 0) return categoryOrder
    return a.name.localeCompare(b.name)
  })
}

export default function Customer() {
  const configured = supabaseConfigured()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(configured)
  const [fetchError, setFetchError] = useState(null)
  const [expandedItemId, setExpandedItemId] = useState(null)

  const loadMenu = useCallback(async () => {
    if (!supabase) return
    setFetchError(null)

    const [directResult, rpcResult] = await Promise.all([
      supabase
        .from('menu')
        .select('item_id,name,description,price,category,availability_status')
        .order('category')
        .order('name'),
      supabase.rpc('get_menu_public'),
    ])

    const directItems = directResult.error ? [] : normalizeMenuRows(directResult.data ?? [])
    const rpcItems = rpcResult.error ? [] : normalizeMenuRows(parseRpcJsonArray(rpcResult.data))
    const nextItems = mergeMenuRows(directItems, rpcItems)

    if (nextItems.length > 0) {
      setItems(nextItems)
      return
    }

    if (directResult.error || rpcResult.error) {
      setFetchError(
        directResult.error?.message ||
          rpcResult.error?.message ||
          'Could not load menu items.',
      )
      setItems([])
      return
    }

    setItems([])
  }, [])

  useEffect(() => {
    if (!configured || !supabase) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      await loadMenu()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [configured, loadMenu])

  useEffect(() => {
    if (!configured || !supabase) return

    const refreshVisibleMenu = () => {
      if (document.visibilityState === 'visible') {
        void loadMenu()
      }
    }

    window.addEventListener('focus', refreshVisibleMenu)
    document.addEventListener('visibilitychange', refreshVisibleMenu)

    const channel = supabase
      .channel('customer-menu-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu' }, () => {
        void loadMenu()
      })
      .subscribe()

    return () => {
      window.removeEventListener('focus', refreshVisibleMenu)
      document.removeEventListener('visibilitychange', refreshVisibleMenu)
      supabase.removeChannel(channel)
    }
  }, [configured, loadMenu])

  const categories = useMemo(() => {
    const fromDb = [...new Set(items.map((i) => i.category).filter(Boolean))].sort()
    return ['All', ...fromDb]
  }, [items])

  const [activeCategory, setActiveCategory] = useState('All')

  const visibleItems = useMemo(() => {
    if (activeCategory === 'All') return items
    return items.filter((item) => item.category === activeCategory)
  }, [activeCategory, items])

  function toggleDetails(itemId) {
    setExpandedItemId((currentId) => (currentId === itemId ? null : itemId))
  }

  return (
    <div className="min-h-screen bg-[#F7F0E6] text-[#3B2F2A]">
      <main className="mx-auto max-w-6xl px-10 pb-16">
        <h2 className="py-28 text-center text-7xl font-extrabold tracking-tight text-gray-500/80">
          Promotions
        </h2>

        <section className="mx-auto max-w-4xl">
          <h3 className="mb-10 text-center text-5xl font-extrabold">Menu</h3>

          {!configured && (
            <p className="mb-8 text-center text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              Menu is unavailable: configure Supabase URL and anon key for this app.
            </p>
          )}

          {fetchError && (
            <p className="mb-8 text-center text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {fetchError}
              <button
                type="button"
                className="ml-2 text-xs font-bold underline text-[#D98C5F]"
                onClick={() => void loadMenu()}
              >
                Retry
              </button>
            </p>
          )}

          {loading && configured && (
            <p className="mb-8 text-center text-sm text-black/50" aria-live="polite">
              Loading menu...
            </p>
          )}

          <div className="mx-auto mb-12 flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-5">
            {categories.map((cat) => {
              const isActive = activeCategory === cat

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={[
                    'rounded-full border px-7 py-3 text-sm font-semibold transition-colors',
                    isActive
                      ? 'border-transparent bg-[#3B2F2A] text-white'
                      : 'border-black/50 bg-white text-[#3B2F2A] hover:bg-black/5',
                  ].join(' ')}
                >
                  {cat}
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => {
              const isExpanded = expandedItemId === item.id

              return (
                <article
                  key={item.id}
                  className="rounded-[28px] border-2 border-[#D98C5F] bg-white p-5"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-black/40 bg-white relative">
                    <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none">
                      <div className="absolute w-full h-[1px] bg-black rotate-45" />
                      <div className="absolute w-full h-[1px] bg-black -rotate-45" />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xl font-extrabold leading-tight text-[#3B2F2A]">
                        {item.name}
                      </p>

                      {item.category ? (
                        <span className="shrink-0 rounded-full bg-[#F7F0E6] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#3B2F2A]/70">
                          {item.category}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-lg font-extrabold text-[#D98C5F]">
                      {Number.isFinite(item.price) ? `₱${item.price.toFixed(2)}` : '₱—'}
                    </p>

                    {item.description ? (
                      <p
                        className={[
                          'mt-3 text-sm leading-relaxed text-black/65',
                          isExpanded ? '' : 'line-clamp-3',
                        ].join(' ')}
                      >
                        {item.description}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm leading-relaxed text-black/45">
                        No description added yet.
                      </p>
                    )}

                    <div className="mt-4 border-t border-[#D98C5F]/20 pt-4 text-xs text-black/55">
                      <div className="flex justify-between gap-4">
                        <span>Menu ID</span>
                        <span className="font-bold text-[#3B2F2A]">{item.id}</span>
                      </div>
                      <div className="mt-2 flex justify-between gap-4">
                        <span>Status</span>
                        <span className="font-bold text-[#3B2F2A]">
                          {item.availabilityStatus}
                        </span>
                      </div>
                    </div>

                    {item.description.length > 120 ? (
                      <button
                        type="button"
                        onClick={() => toggleDetails(item.id)}
                        className="mt-4 w-full rounded-full border border-[#D98C5F]/40 px-4 py-2 text-sm font-bold text-[#D98C5F] transition hover:bg-[#D98C5F]/10"
                      >
                        {isExpanded ? 'Show less' : 'More details'}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>

          {!loading && !fetchError && configured && visibleItems.length === 0 && (
            <p className="mt-10 text-center text-sm text-black/50">No items found in this category yet.</p>
          )}
        </section>
      </main>

      <footer className="mt-16">
        <div className="h-[2px] w-full bg-[#1E96AE]" />
      </footer>
    </div>
  )
}
