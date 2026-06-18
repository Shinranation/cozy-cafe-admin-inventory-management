import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

function getWaitMs(createdAt, nowMs) {
  const createdMs = new Date(createdAt).getTime()
  if (!Number.isFinite(createdMs)) return 0
  return Math.max(0, nowMs - createdMs)
}

function getWaitMinutes(waitMs) {
  return Math.floor(waitMs / 60000)
}

function formatWaitTime(minutes) {
  if (minutes < 1) return 'Waiting <1 min'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `Waiting ${minutes} min`
  return `Waiting ${hours}h ${mins}m`
}

function waitBadgeClass(waitMs) {
  if (waitMs >= 30 * 60000) return 'bg-red-100 text-red-900 border-red-300/70'
  if (waitMs > 15 * 60000) return 'bg-yellow-100 text-yellow-950 border-yellow-300/80'
  return 'bg-emerald-100 text-emerald-900 border-emerald-300/70'
}

function parseRpcJsonArray(data) {
  if (data == null) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      const p = JSON.parse(data)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

export default function OrdersPage({ onNewOrder, onOpenReceipts, refreshKey = 0 }) {
  const configured = supabaseConfigured()
  const [orders, setOrders] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [busyOrderId, setBusyOrderId] = useState(/** @type {number | null} */ (null))
  const [nowMs, setNowMs] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (!supabase) return
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('list_pending_orders_with_items')
    if (rpcErr) {
      setError(rpcErr.message)
      setOrders([])
      return
    }
    setOrders(parseRpcJsonArray(data))
  }, [])

  useEffect(() => {
    if (!configured || !supabase) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      await load()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [configured, load, refreshKey])

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(intervalId)
  }, [])

  async function handleReceived(orderId) {
    if (!supabase) return
    setBusyOrderId(orderId)
    setError(null)
    const { error: rpcErr } = await supabase.rpc('mark_order_received', { p_order_id: orderId })
    setBusyOrderId(null)
    if (rpcErr) {
      setError(rpcErr.message)
      return
    }
    await load()
  }

  return (
    <main className="min-h-screen bg-[#FDFBF4] px-3 py-6 font-sans text-gray-700 sm:px-4 sm:py-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 text-center sm:mb-16">
          <h1 className="text-5xl font-bold leading-tight text-gray-500/80 md:text-7xl">
            Admin Dashboard <br /> Orders
          </h1>
        </header>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-1 sm:mb-10 sm:gap-4 sm:px-2">
          <button
            type="button"
            onClick={() => onNewOrder?.()}
            className="inline-flex items-center rounded-full bg-[#D98C5F] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 sm:px-6 sm:py-3"
          >
            + New Order
          </button>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                load().finally(() => setLoading(false))
              }}
              className="rounded-full border border-[#D98C5F]/40 bg-white px-4 py-2 text-xs font-bold text-[#D98C5F] shadow-sm transition hover:bg-[#FFF7F1] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-2.5 sm:text-sm"
              disabled={loading || !configured}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => onOpenReceipts?.()}
              className="inline-flex items-center rounded-full border border-gray-400/40 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              View receipts →
            </button>
          </div>
        </div>

        {!configured && (
          <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            Configure Supabase to load orders.
          </p>
        )}

        {error && (
          <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            {error}
          </p>
        )}

        {loading && <p className="text-center text-gray-500 text-sm mb-6">Loading orders...</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-center text-gray-600 text-sm mb-8">
            No pending orders. Confirm an order from New Order to see it here.
          </p>
        )}

        <div className="space-y-8 sm:space-y-12">
          {orders.map((order) => {
            const waitMs = getWaitMs(order.created_at, nowMs)
            const waitMinutes = getWaitMinutes(waitMs)

            return (
            <section key={order.order_id} className="relative">
              <div className="mb-3 flex flex-wrap items-center gap-2 px-1 sm:mb-4 sm:gap-4 sm:px-2">
                <div className="rounded-full border border-gray-400/30 bg-[#D9C5B2] px-4 py-1.5 shadow-sm sm:px-6 sm:py-2">
                  <span className="whitespace-nowrap text-xs font-bold text-gray-700 sm:text-sm">
                    Order #{String(order.order_id).padStart(3, '0')}
                  </span>
                </div>
                <span
                  className="rounded-full border border-amber-300/60 bg-amber-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-950 sm:px-4 sm:text-xs"
                  title="New orders are pending until marked received"
                >
                  Pending
                </span>
                <span
                  className={`rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide sm:px-4 sm:text-xs ${waitBadgeClass(waitMs)}`}
                  title="0-15 min: green, over 15-29 min: yellow, 30+ min: red"
                >
                  {formatWaitTime(waitMinutes)}
                </span>
                <h2 className="min-w-[10rem] flex-1 text-2xl font-bold text-gray-700 md:text-4xl">
                  {order.customer_display}
                </h2>
                <button
                  type="button"
                  onClick={() => void handleReceived(order.order_id)}
                  disabled={busyOrderId === order.order_id || !configured}
                  className="shrink-0 rounded-full bg-[#3B2F2A] px-5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50 sm:px-6 sm:py-2.5 sm:text-sm"
                >
                  {busyOrderId === order.order_id ? '...' : 'Mark Received'}
                </button>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-[#D98C5F]/40 bg-white p-3 shadow-sm sm:rounded-[2.5rem] sm:border-2 sm:p-6">
                <div className="flex min-w-max gap-3 sm:gap-6">
                  {(order.items ?? []).map((it, i) => (
                    <div
                      key={`${order.order_id}-${i}-${it.menu_item_id}`}
                      className="flex w-24 flex-col items-center gap-1.5 rounded-xl border border-[#D98C5F]/30 bg-white p-2 sm:w-36 sm:gap-2 sm:rounded-[1.5rem] sm:p-3"
                    >
                      <div className="relative aspect-square w-full overflow-hidden rounded-md border border-gray-300 bg-white sm:rounded-lg">
                        <div className="absolute inset-0 flex items-center justify-center opacity-20">
                          <div className="absolute w-full h-[1px] bg-black rotate-45" />
                          <div className="absolute w-full h-[1px] bg-black -rotate-45" />
                        </div>
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-[10px] font-bold text-gray-500">×{it.quantity}</p>
                        <div className="border border-gray-400 rounded-full px-2 py-0.5">
                          <p className="text-[9px] font-bold text-gray-600 uppercase leading-tight line-clamp-2">
                            {it.name}
                          </p>
                          {it.size_label ? (
                            <p className="text-[8px] font-bold text-gray-400 uppercase leading-tight">
                              {it.size_label}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}
