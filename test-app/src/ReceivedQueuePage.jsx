import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

export default function ReceivedQueuePage({ onBackToPending }) {
  const configured = supabaseConfigured()
  const [orders, setOrders] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(/** @type {string | null} */ (null))

  const load = useCallback(async () => {
    if (!supabase) return
    setError(null)
    const { data, error: rpcErr } = await supabase.rpc('list_received_orders_with_items')
    if (rpcErr) {
      setError(rpcErr.message)
      setOrders([])
      return
    }
    const parsed = Array.isArray(data) ? data : typeof data === 'string' ? JSON.parse(data) : data ?? []
    setOrders(Array.isArray(parsed) ? parsed : [])
  }, [])

  useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      await load()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [configured, load])

  return (
    <main className="min-h-screen bg-[#FDFBF4] py-10 px-4 font-sans text-gray-700">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-6xl md:text-7xl font-bold text-gray-500/80 leading-tight">
            Admin Dashboard <br /> Received Orders
          </h1>
        </header>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 px-2">
          <button
            type="button"
            onClick={() => onBackToPending?.()}
            className="inline-flex items-center rounded-full border border-gray-400/40 bg-white px-6 py-3 text-sm font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            ← Back to pending queue
          </button>
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
        </div>

        {!configured && (
          <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            Configure Supabase URL and anon key to load received orders.
          </p>
        )}

        {error && (
          <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            {error}
          </p>
        )}

        {loading && <p className="text-center text-gray-500 text-sm">Loading…</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-center text-gray-600 text-sm">No received orders yet.</p>
        )}

        <div className="space-y-12 mt-6">
          {orders.map((order) => (
            <section key={order.order_id} className="relative">
              <div className="flex flex-wrap items-center gap-4 mb-4 px-2">
                <div className="bg-[#D9C5B2] px-6 py-2 rounded-full border border-gray-400/30 shadow-sm">
                  <span className="font-bold text-gray-700 text-sm whitespace-nowrap">
                    Order #{String(order.order_id).padStart(3, '0')}
                  </span>
                </div>
                <span className="rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300/60 px-4 py-1 text-xs font-extrabold uppercase tracking-wide">
                  Received
                </span>
                <h2 className="text-3xl md:text-4xl font-bold text-gray-700">{order.customer_display}</h2>
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
          ))}
        </div>
      </div>
    </main>
  )
}
