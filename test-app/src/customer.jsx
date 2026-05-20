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

export default function Customer() {
  const configured = supabaseConfigured()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(configured)
  const [fetchError, setFetchError] = useState(null)

  const loadMenu = useCallback(async () => {
    if (!supabase) return
    setFetchError(null)

    const { data, error } = await supabase.rpc('get_menu_public')

    if (error) {
      const { data: directData, error: directError } = await supabase
        .from('menu')
        .select('item_id,name,description,price,category,availability_status')
        .order('category')
        .order('name')

      if (directError) {
        setFetchError(`${error.message}; fallback failed: ${directError.message}`)
        setItems([])
        return
      }

      setItems(normalizeMenuRows(directData ?? []))
      return
    }

    const rpcItems = normalizeMenuRows(parseRpcJsonArray(data))

    if (rpcItems.length > 0) {
      setItems(rpcItems)
      return
    }

    const { data: directData, error: directError } = await supabase
      .from('menu')
      .select('item_id,name,description,price,category,availability_status')
      .order('category')
      .order('name')

    if (directError) {
      setFetchError(directError.message)
      setItems([])
      return
    }

    setItems(normalizeMenuRows(directData ?? []))
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

  const categories = useMemo(() => {
    const fromDb = [...new Set(items.map((i) => i.category).filter(Boolean))].sort()
    return ['All', ...fromDb]
  }, [items])

  const [activeCategory, setActiveCategory] = useState('All')

  const visibleItems = useMemo(() => {
    if (activeCategory === 'All') return items
    return items.filter((item) => item.category === activeCategory)
  }, [activeCategory, items])

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
              Loading menu…
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
            {visibleItems.map((item) => (
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
                  <p className="text-xl font-extrabold leading-tight text-[#3B2F2A]">{item.name}</p>
                  {item.description ? (
                    <p className="mt-1 text-xs text-black/55 line-clamp-3">{item.description}</p>
                  ) : null}
                  <p className="mt-2 text-lg font-extrabold text-[#D98C5F]">
                    {Number.isFinite(item.price) ? `₱${item.price.toFixed(2)}` : '₱—'}
                  </p>
                </div>
              </article>
            ))}
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
