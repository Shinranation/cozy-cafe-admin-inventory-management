import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured, defaultPosCashierId } from './lib/supabaseClient.js'

/** @typedef {{ item_id: number, name: string, size_label: string, price: number, category: string, availability_status: string }} MenuItemRow */

function menuItemLabel(item) {
  return item.size_label ? `${item.name} (${item.size_label})` : item.name
}

export default function NewOrder({ onBack, onCancel }) {
  const configured = supabaseConfigured()
  const [items, setItems] = useState(/** @type {MenuItemRow[]} */ ([]))
  const [menuLoading, setMenuLoading] = useState(configured)
  const [menuError, setMenuError] = useState(/** @type {string | null} */ (null))

  const [activeCategory, setActiveCategory] = useState('All')
  /** cart: menu item_id -> qty */
  const [qty, setQty] = useState(/** @type {Record<number, number>} */ ({}))
  const [stockMessage, setStockMessage] = useState(/** @type {string | null} */ (null))
  const [confirmError, setConfirmError] = useState(/** @type {string | null} */ (null))
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [guestDisplayName, setGuestDisplayName] = useState('')

  const loadMenu = useCallback(async () => {
    if (!supabase) return
    setMenuError(null)
    setMenuLoading(true)

    const { data, error } = await supabase
      .from('menu')
      .select('item_id,name,size_label,price,category,availability_status')
      .order('category')
      .order('name')

    if (error) {
      setMenuError(error.message)
      setItems([])
      setMenuLoading(false)
      return
    }

    setItems(
      (data ?? [])
        .map((r) => ({
          item_id: Number(r.item_id),
          name: String(r.name ?? ''),
          size_label: String(r.size_label ?? ''),
          price: Number(r.price) || 0,
          category: String(r.category ?? ''),
          availability_status: String(r.availability_status ?? ''),
        }))
        .filter(
          (r) =>
            Number.isFinite(r.item_id) &&
            r.item_id > 0 &&
            r.availability_status.toLowerCase() === 'available',
        ),
    )
    setMenuLoading(false)
  }, [])

  useEffect(() => {
    if (!configured || !supabase) return
    const timeoutId = window.setTimeout(() => {
      void loadMenu()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [configured, loadMenu])

  const categories = useMemo(() => {
    const fromDb = [...new Set(items.map((i) => i.category).filter(Boolean))].sort()
    return ['All', ...fromDb]
  }, [items])

  const visibleItems = useMemo(() => {
    if (activeCategory === 'All') return items
    return items.filter((i) => i.category === activeCategory)
  }, [activeCategory, items])

  const orderList = useMemo(() => {
    const byId = new Map(items.map((i) => [i.item_id, i]))
    return Object.entries(qty)
      .map(([id, n]) => {
        const item = byId.get(Number(id))
        if (!item) return null
        return {
          id: item.item_id,
          name: menuItemLabel(item),
          price: item.price,
          qty: n,
          lineTotal: item.price * n,
        }
      })
      .filter(Boolean)
  }, [qty, items])

  const totalItems = useMemo(() => Object.values(qty).reduce((sum, n) => sum + n, 0), [qty])

  const totalPrice = useMemo(() => orderList.reduce((sum, row) => sum + row.lineTotal, 0), [orderList])

  function inc(item) {
    setStockMessage(null)
    setConfirmError(null)
    const id = item.item_id
    const cur = qty[id] ?? 0
    setQty((prev) => ({ ...prev, [id]: cur + 1 }))
  }

  function dec(id) {
    setStockMessage(null)
    setConfirmError(null)
    setQty((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) - 1)
      const copy = { ...prev }
      if (next === 0) delete copy[id]
      else copy[id] = next
      return copy
    })
  }

  async function handleConfirmOrder() {
    if (!supabase || totalItems === 0) return
    setConfirmError(null)
    setStockMessage(null)
    setConfirmBusy(true)

    const p_lines = orderList.map((row) => ({
      menu_item_id: row.id,
      quantity: row.qty,
    }))

    const { error } = await supabase.rpc('confirm_pos_order', {
      p_cashier_id: defaultPosCashierId(),
      p_client_id: null,
      p_guest_display_name: guestDisplayName.trim() || null,
      p_lines,
    })

    setConfirmBusy(false)
    if (error) {
      const msg = error.message ?? String(error)
      if (msg.includes('NO_RECIPE')) {
        setConfirmError('One or more menu items do not have linked ingredients yet. Add recipe ingredients in Inventory > Menu Item.')
      } else if (msg.includes('ARCHIVED_INGREDIENT')) {
        setConfirmError('One or more menu recipes use archived ingredients. Update the recipe links in Inventory > Menu Item.')
      } else if (msg.includes('inventory_ingredient_id is null')) {
        setConfirmError('Order function is outdated. Run the menu_ingredients order SQL migration so orders use recipe ingredients.')
      } else if (msg.includes('INSUFFICIENT_STOCK')) {
        setConfirmError(msg.replace(/^.*INSUFFICIENT_STOCK:\s*/i, ''))
      } else {
        setConfirmError(msg)
      }
      return
    }

    setQty({})
    setGuestDisplayName('')
    onBack?.()
  }

  return (
    <main className="min-h-screen bg-[#FDFBF4] px-4 py-10 font-sans text-gray-700">
      <div className="mx-auto max-w-[90rem]">
        <header className="mb-10 text-center">
          <h1 className="text-6xl md:text-7xl font-bold text-gray-500/80 leading-tight">New Order</h1>
          {onCancel && (
            <button
              type="button"
              onClick={() => onCancel()}
              className="mt-4 text-sm font-bold text-[#D98C5F] underline hover:opacity-90"
            >
              ← Back to queue
            </button>
          )}
        </header>

        {!configured && (
          <p className="mb-6 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            Supabase is not configured. Set <code className="text-xs bg-white px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-xs bg-white px-1 rounded">VITE_SUPABASE_ANON_KEY</code>.
          </p>
        )}

        {menuError && (
          <p className="mb-6 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {menuError}
            <button
              type="button"
              className="ml-2 text-xs font-bold underline text-[#D98C5F]"
              onClick={() => void loadMenu()}
            >
              Retry
            </button>
          </p>
        )}

        {(stockMessage || confirmError) && (
          <div
            className="mb-6 text-center text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
            role="alert"
          >
            {stockMessage ?? confirmError}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[260px_1fr_360px]">
          <aside className="-ml-6 space-y-3">
            {categories.map((cat) => {
              const active = cat === activeCategory
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={[
                    'min-w-55 rounded-xl px-4 py-2 text-left text-sm font-bold border shadow-sm transition',
                    active
                      ? 'bg-[#3B2F2A] text-white border-transparent'
                      : 'bg-[#D9C5B2]/40 text-gray-700 border-gray-400/30 hover:bg-[#D9C5B2]/55',
                  ].join(' ')}
                >
                  {cat}
                </button>
              )
            })}
          </aside>

          <section>
            {menuLoading && (
              <p className="text-center text-gray-500 text-sm py-12" aria-live="polite">
                Loading menu…
              </p>
            )}
            {!menuLoading && items.length === 0 && !menuError && (
              <p className="text-center text-gray-500 text-sm py-12">No menu items returned.</p>
            )}
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((item) => {
                const count = qty[item.item_id] ?? 0
                return (
                  <article
                    key={item.item_id}
                    className="bg-white border border-gray-400/40 shadow-sm rounded-2xl p-4"
                  >
                    <p className="text-center text-xs font-extrabold tracking-wide text-gray-700 uppercase">
                      {item.name}
                    </p>
                    {item.size_label && (
                      <p className="mt-1 text-center text-[10px] font-bold uppercase text-gray-500">
                        {item.size_label}
                      </p>
                    )}

                    <div className="mt-3 aspect-square w-full rounded-xl border border-gray-300 bg-white relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center opacity-20">
                        <div className="absolute w-full h-[1px] bg-black rotate-45" />
                        <div className="absolute w-full h-[1px] bg-black -rotate-45" />
                      </div>
                    </div>

                    <p className="mt-3 text-center text-sm font-extrabold text-gray-700">₱{item.price.toFixed(2)}</p>
                    <div className="mt-3 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => inc(item)}
                        disabled={!configured}
                        className="grid h-8 w-10 place-items-center rounded-lg border border-[#D98C5F]/40 bg-[#D98C5F]/10 text-[#D98C5F] font-extrabold hover:bg-[#D98C5F]/15 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Add ${item.name}`}
                      >
                        +
                      </button>

                      <span className="min-w-8 text-center font-bold text-gray-700">{count}</span>

                      <button
                        type="button"
                        onClick={() => dec(item.item_id)}
                        className="grid h-8 w-10 place-items-center rounded-lg border border-gray-400/40 bg-black/5 text-gray-700 font-extrabold hover:bg-black/10"
                        aria-label={`Remove ${item.name}`}
                        disabled={count === 0}
                      >
                        −
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

          <aside className="xl:sticky xl:top-6 h-fit">
            <div className="bg-white border border-gray-400/40 shadow-sm rounded-2xl p-5">
              <h2 className="text-lg font-extrabold text-gray-700">Order List</h2>

              <label className="mt-3 block text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                Customer name (optional)
                <input
                  type="text"
                  value={guestDisplayName}
                  onChange={(e) => setGuestDisplayName(e.target.value)}
                  placeholder="Walk-in guest"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal text-gray-800"
                  maxLength={120}
                />
              </label>

              <div className="mt-4 max-h-[420px] overflow-auto pr-1">
                {orderList.length === 0 ? (
                  <p className="text-sm text-gray-500">No items added yet. Use the + button to add items.</p>
                ) : (
                  <ul className="space-y-3">
                    {orderList.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-gray-400/30 p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-gray-700 truncate">{row.name}</p>
                          <p className="text-xs text-gray-500">
                            ₱{row.price.toFixed(2)} × {row.qty}
                          </p>
                        </div>

                        <p className="shrink-0 font-extrabold text-gray-800">₱{row.lineTotal.toFixed(2)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-600">
                  {totalItems} {totalItems === 1 ? 'item' : 'items'} added
                </p>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-lg font-extrabold text-gray-800">TOTAL:</p>
                  <p className="text-lg font-extrabold text-gray-800">₱{totalPrice.toFixed(2)}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleConfirmOrder()}
                  disabled={totalItems === 0 || confirmBusy || !configured || menuLoading}
                  className={[
                    'mt-4 w-full rounded-full px-8 py-4 font-extrabold shadow-md transition',
                    totalItems === 0 || confirmBusy || !configured || menuLoading
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                      : 'bg-[#D98C5F] text-white hover:opacity-90',
                  ].join(' ')}
                >
                  {confirmBusy ? 'Saving…' : 'Confirm Order'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
