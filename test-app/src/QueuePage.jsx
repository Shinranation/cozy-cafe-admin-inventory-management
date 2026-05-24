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

export default function QueuePage({ onNewOrder, onOpenReceived, refreshKey = 0 }) {
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
    <main className="min-h-screen bg-[#FDFBF4] py-10 px-4 font-sans text-gray-700">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-16">
          <h1 className="text-6xl md:text-7xl font-bold text-gray-500/80 leading-tight">
            Admin Dashboard <br /> Queue
          </h1>
        </header>

        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 px-2">
          <button
            type="button"
            onClick={() => onNewOrder?.()}
            className="inline-flex items-center rounded-full bg-[#D98C5F] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
          >
            + New Order
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                load().finally(() => setLoading(false))
              }}
              className="text-sm font-bold text-[#D98C5F] underline disabled:opacity-50"
              disabled={loading || !configured}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => onOpenReceived?.()}
              className="inline-flex items-center rounded-full border border-gray-400/40 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              View received orders →
            </button>
          </div>
        </div>

        {!configured && (
          <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            Configure Supabase to load the order queue.
          </p>
        )}

        {error && (
          <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            {error}
          </p>
        )}

        {loading && <p className="text-center text-gray-500 text-sm mb-6">Loading queue…</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-center text-gray-600 text-sm mb-8">
            No pending orders. Confirm an order from New Order to see it here.
          </p>
        )}

        <div className="space-y-12">
          {orders.map((order) => {
            const waitMs = getWaitMs(order.created_at, nowMs)
            const waitMinutes = getWaitMinutes(waitMs)

            return (
            <section key={order.order_id} className="relative">
              <div className="flex flex-wrap items-center gap-4 mb-4 px-2">
                <div className="bg-[#D9C5B2] px-6 py-2 rounded-full border border-gray-400/30 shadow-sm">
                  <span className="font-bold text-gray-700 text-sm whitespace-nowrap">
                    Order #{String(order.order_id).padStart(3, '0')}
                  </span>
                </div>
                <span
                  className="rounded-full bg-amber-100 text-amber-950 border border-amber-300/60 px-4 py-1 text-xs font-extrabold uppercase tracking-wide"
                  title="New orders are pending until marked received"
                >
                  Pending
                </span>
                <span
                  className={`rounded-full border px-4 py-1 text-xs font-extrabold uppercase tracking-wide ${waitBadgeClass(waitMs)}`}
                  title="0-15 min: green, over 15-29 min: yellow, 30+ min: red"
                >
                  {formatWaitTime(waitMinutes)}
                </span>
                <h2 className="text-3xl md:text-4xl font-bold text-gray-700 flex-1 min-w-[12rem]">
                  {order.customer_display}
                </h2>
                <button
                  type="button"
                  onClick={() => void handleReceived(order.order_id)}
                  disabled={busyOrderId === order.order_id || !configured}
                  className="shrink-0 rounded-full bg-[#3B2F2A] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {busyOrderId === order.order_id ? '…' : 'Received'}
                </button>
              </div>

              <div className="bg-white border-2 border-[#D98C5F]/40 rounded-[2.5rem] p-6 shadow-sm overflow-x-auto">
                <div className="flex gap-6 min-w-max">
                  {(order.items ?? []).map((it, i) => (
                    <div
                      key={`${order.order_id}-${i}-${it.menu_item_id}`}
                      className="w-36 bg-white border border-[#D98C5F]/30 rounded-[1.5rem] p-3 flex flex-col items-center gap-2"
                    >
                      <div className="w-full aspect-square bg-white border border-gray-300 rounded-lg relative overflow-hidden">
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
