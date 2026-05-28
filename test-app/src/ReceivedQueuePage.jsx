import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

function parseOrders(data) {
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return Array.isArray(data) ? data : []
}

function dateLabel(createdAt) {
  const date = new Date(createdAt)
  if (!Number.isFinite(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function timeLabel(createdAt) {
  const date = new Date(createdAt)
  if (!Number.isFinite(date.getTime())) return 'Unknown time'
  return date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dateTimeLabel(createdAt) {
  const date = new Date(createdAt)
  if (!Number.isFinite(date.getTime())) return 'Unknown date and time'
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatPeso(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'PHP 0.00'
  return `PHP ${amount.toFixed(2)}`
}

function slugifyForId(value) {
  return String(value || 'unknown-date')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-date'
}

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
    setOrders(parseOrders(data))
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

  const dateGroups = useMemo(() => {
    const groups = new Map()

    for (const order of orders) {
      const name = dateLabel(order.created_at)
      const existing = groups.get(name) ?? []
      existing.push(order)
      groups.set(name, existing)
    }

    return [...groups.entries()].map(([name, groupOrders]) => ({
      id: `received-date-${slugifyForId(name)}`,
      name,
      timeSummary: groupOrders.map((order) => timeLabel(order.created_at)).join(', '),
      orders: groupOrders,
    }))
  }, [orders])

  function scrollToDate(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
            Back to pending queue
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

        {loading && <p className="text-center text-gray-500 text-sm">Loading...</p>}

        {!loading && !error && orders.length === 0 && (
          <p className="text-center text-gray-600 text-sm">No received orders yet.</p>
        )}

        {!loading && !error && dateGroups.length > 0 && (
          <div className="sticky top-3 z-20 mt-6 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              Dates
            </p>
            <div className="flex flex-wrap gap-2">
              {dateGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => scrollToDate(group.id)}
                  className="rounded-full border border-[#D98C5F]/50 bg-[#FAF8F5] px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:border-[#D98C5F] hover:bg-white"
                >
                  <span className="block">{group.name} ({group.orders.length})</span>
                  <span className="block max-w-[14rem] truncate text-[10px] font-semibold text-gray-500">
                    {group.timeSummary}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-12 mt-6">
          {dateGroups.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-28 space-y-8">
              <div className="flex flex-wrap items-center gap-2 px-2">
                <h2 className="text-2xl font-bold text-gray-700">{group.name}</h2>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-500">
                  {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                </span>
              </div>

              {group.orders.map((order) => (
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
                    <span className="rounded-full border border-gray-200 bg-white px-4 py-1 text-xs font-bold text-gray-500">
                      {dateTimeLabel(order.created_at)}
                    </span>
                    <h3 className="min-w-[12rem] flex-1 text-3xl md:text-4xl font-bold text-gray-700">
                      {order.customer_display}
                    </h3>
                  </div>

                  <div className="bg-white border-2 border-[#D98C5F]/40 rounded-[2rem] p-6 shadow-sm">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Receipt
                        </p>
                        <p className="mt-1 text-sm font-bold text-gray-800">
                          Order #{String(order.order_id).padStart(3, '0')}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {dateTimeLabel(order.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                          Total
                        </p>
                        <p className="mt-1 text-2xl font-extrabold text-[#D98C5F]">
                          {formatPeso(order.total_amount)}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[36rem] text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <th className="py-2 pr-3">Qty</th>
                            <th className="py-2 pr-3">Item</th>
                            <th className="py-2 pr-3 text-right">Unit</th>
                            <th className="py-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(order.items ?? []).map((it, i) => (
                            <tr key={`${order.order_id}-${i}-${it.menu_item_id}`}>
                              <td className="py-3 pr-3 font-bold text-gray-700">
                                x{it.quantity}
                              </td>
                              <td className="py-3 pr-3">
                                <p className="font-bold text-gray-800">{it.name}</p>
                                {it.size_label ? (
                                  <p className="mt-0.5 text-xs font-semibold uppercase text-gray-400">
                                    {it.size_label}
                                  </p>
                                ) : null}
                              </td>
                              <td className="py-3 pr-3 text-right font-semibold text-gray-600">
                                {formatPeso(it.unit_price)}
                              </td>
                              <td className="py-3 text-right font-extrabold text-gray-800">
                                {formatPeso(it.sub_total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-200">
                            <td colSpan={3} className="pt-4 pr-3 text-right text-sm font-extrabold text-gray-700">
                              Total
                            </td>
                            <td className="pt-4 text-right text-lg font-extrabold text-[#D98C5F]">
                              {formatPeso(order.total_amount)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </section>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
