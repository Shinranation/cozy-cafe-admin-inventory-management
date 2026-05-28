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

function dateRangeForCreatedAt(createdAt) {
  const date = new Date(createdAt)
  if (!Number.isFinite(date.getTime())) return null
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  }
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

const DELETE_ACTION_PHRASE = 'DELETE RECEIPTS'
const DELETE_SCOPE_PHRASE = 'DELETE SELECTED DATE'

export default function ReceivedQueuePage({ onBackToPending }) {
  const configured = supabaseConfigured()
  const [orders, setOrders] = useState(/** @type {any[]} */ ([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(/** @type {string | null} */ (null))
  const [selectedDateId, setSelectedDateId] = useState('')
  const [expandedOrderId, setExpandedOrderId] = useState(/** @type {number | null} */ (null))
  const [deleteDateMode, setDeleteDateMode] = useState(false)
  const [selectedDeleteDateIds, setSelectedDeleteDateIds] = useState(/** @type {string[]} */ ([]))
  const [deleteDialog, setDeleteDialog] = useState(/** @type {any | null} */ (null))
  const [deleteInputs, setDeleteInputs] = useState({ email: '', action: '', scope: '' })
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState(/** @type {string | null} */ (null))

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

    return [...groups.entries()].map(([name, groupOrders]) => {
      const sortedOrders = [...groupOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )

      const range = dateRangeForCreatedAt(sortedOrders[0]?.created_at)

      return {
        id: `received-date-${slugifyForId(name)}`,
        name,
        startAt: range?.startAt ?? '',
        endAt: range?.endAt ?? '',
        orders: sortedOrders,
      }
    })
  }, [orders])

  const selectedDateGroup = useMemo(() => {
    return dateGroups.find((group) => group.id === selectedDateId) ?? dateGroups[0] ?? null
  }, [dateGroups, selectedDateId])

  const selectedDeleteDateGroups = useMemo(() => {
    const selectedIds = new Set(selectedDeleteDateIds)
    return dateGroups.filter((group) => selectedIds.has(group.id))
  }, [dateGroups, selectedDeleteDateIds])

  useEffect(() => {
    if (dateGroups.length === 0) {
      setSelectedDateId('')
      setExpandedOrderId(null)
      setSelectedDeleteDateIds([])
      return
    }

    if (!dateGroups.some((group) => group.id === selectedDateId)) {
      setSelectedDateId(dateGroups[0].id)
      setExpandedOrderId(null)
    }

    setSelectedDeleteDateIds((previousIds) =>
      previousIds.filter((id) => dateGroups.some((group) => group.id === id)),
    )
  }, [dateGroups, selectedDateId])

  function selectDate(id) {
    setSelectedDateId(id)
    setExpandedOrderId(null)
  }

  async function openDeleteDialog(groups) {
    const validGroups = groups.filter((group) => group?.startAt && group?.endAt)
    if (!supabase || validGroups.length === 0) return

    setError(null)
    setDeleteMessage(null)
    setDeleteInputs({ email: '', action: '', scope: '' })

    const { data, error: userError } = await supabase.auth.getUser()
    if (userError || !data.user?.email) {
      setError(userError?.message ?? 'Could not confirm the signed-in account email.')
      return
    }

    setDeleteEmail(data.user.email)
    setDeleteDialog({
      groups: validGroups,
      name: validGroups.map((group) => group.name).join(', '),
      orderCount: validGroups.reduce((sum, group) => sum + group.orders.length, 0),
    })
  }

  function handleDateButton(group) {
    if (deleteDateMode) {
      setSelectedDeleteDateIds((previousIds) =>
        previousIds.includes(group.id)
          ? previousIds.filter((id) => id !== group.id)
          : [...previousIds, group.id],
      )
      return
    }

    selectDate(group.id)
  }

  function openSelectedDeleteDialog() {
    void openDeleteDialog(selectedDeleteDateGroups)
  }

  function handleDeleteInputChange(field, value) {
    setDeleteInputs((prev) => ({ ...prev, [field]: value }))
  }

  const deleteReady =
    deleteInputs.email.trim().toLowerCase() === deleteEmail.trim().toLowerCase() &&
    deleteInputs.action.trim() === DELETE_ACTION_PHRASE &&
    deleteInputs.scope.trim() === DELETE_SCOPE_PHRASE

  async function handleDeleteDate() {
    if (!supabase || !deleteDialog || !deleteReady) return

    setDeleteBusy(true)
    setError(null)
    setDeleteMessage(null)

    let totalDeletedOrders = 0

    for (const group of deleteDialog.groups) {
      const { data, error: deleteError } = await supabase.rpc('delete_received_orders_by_date', {
        p_start_at: group.startAt,
        p_end_at: group.endAt,
        p_confirm_email: deleteInputs.email.trim(),
        p_confirm_action: deleteInputs.action.trim(),
        p_confirm_scope: deleteInputs.scope.trim(),
      })

      if (deleteError) {
        setDeleteBusy(false)
        setError(deleteError.message)
        return
      }

      totalDeletedOrders += Number(data?.deleted_orders) || 0
    }

    setDeleteBusy(false)

    setDeleteMessage(
      `Deleted ${totalDeletedOrders} received order${totalDeletedOrders !== 1 ? 's' : ''} from ${deleteDialog.groups.length} date${deleteDialog.groups.length !== 1 ? 's' : ''}.`,
    )
    setDeleteDialog(null)
    setDeleteInputs({ email: '', action: '', scope: '' })
    setSelectedDeleteDateIds([])
    setDeleteDateMode(false)
    setExpandedOrderId(null)
    await load()
  }

  function orderItemSummary(order) {
    const items = order.items ?? []
    if (items.length === 0) return 'No items recorded'

    return items
      .slice(0, 3)
      .map((item) => `${item.quantity}x ${item.name}${item.size_label ? ` ${item.size_label}` : ''}`)
      .join(', ')
      .concat(items.length > 3 ? ` +${items.length - 3} more` : '')
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

        {deleteMessage && (
          <p className="text-center text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6">
            {deleteMessage}
          </p>
        )}

        {deleteDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-gray-900">Delete Receipt History</h3>
              <p className="mt-2 text-sm text-gray-600">
                This removes {deleteDialog.orderCount} received receipt record{deleteDialog.orderCount !== 1 ? 's' : ''}, order items, and payments from {deleteDialog.groups.length} selected date{deleteDialog.groups.length !== 1 ? 's' : ''}. It does not cancel sales or restore inventory quantities.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {deleteDialog.groups.map((group) => (
                  <span
                    key={group.id}
                    className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700"
                  >
                    {group.name} ({group.orders.length})
                  </span>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Account Email
                  <input
                    type="text"
                    value={deleteInputs.email}
                    onChange={(e) => handleDeleteInputChange('email', e.target.value)}
                    placeholder={deleteEmail}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={deleteBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Type DELETE RECEIPTS
                  <input
                    type="text"
                    value={deleteInputs.action}
                    onChange={(e) => handleDeleteInputChange('action', e.target.value)}
                    placeholder={DELETE_ACTION_PHRASE}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={deleteBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Type DELETE SELECTED DATE
                  <input
                    type="text"
                    value={deleteInputs.scope}
                    onChange={(e) => handleDeleteInputChange('scope', e.target.value)}
                    placeholder={DELETE_SCOPE_PHRASE}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={deleteBusy}
                  />
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteDialog(null)}
                  disabled={deleteBusy}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteDate()}
                  disabled={deleteBusy || !deleteReady}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                {deleteBusy ? 'Deleting...' : 'Delete Receipt History'}
                </button>
              </div>
            </div>
          </div>
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
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold text-gray-500">
                {deleteDateMode ? 'Delete mode: choose one or more receipt dates, then confirm deletion.' : 'Choose a date to view receipts.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {deleteDateMode ? (
                  <button
                    type="button"
                    onClick={openSelectedDeleteDialog}
                    disabled={selectedDeleteDateGroups.length === 0}
                    className="rounded-full bg-red-600 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Delete Selected Receipts ({selectedDeleteDateGroups.length})
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setDeleteDateMode((prev) => !prev)
                    setDeleteDialog(null)
                    setSelectedDeleteDateIds([])
                  }}
                  className={[
                    'rounded-full px-4 py-2 text-xs font-extrabold transition',
                    deleteDateMode
                      ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      : 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
                  ].join(' ')}
                >
                  {deleteDateMode ? 'Cancel Delete' : 'Delete Receipt Dates'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {dateGroups.map((group) => {
                const selectedForDelete = selectedDeleteDateIds.includes(group.id)

                return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleDateButton(group)}
                  className={[
                    'rounded-full border px-3 py-1.5 text-xs font-bold transition',
                    deleteDateMode
                      ? selectedForDelete
                        ? 'border-transparent bg-red-600 text-white'
                        : 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                      : selectedDateGroup?.id === group.id
                      ? 'border-transparent bg-[#3B2F2A] text-white'
                      : 'border-[#D98C5F]/50 bg-[#FAF8F5] text-gray-700 hover:border-[#D98C5F] hover:bg-white',
                  ].join(' ')}
                >
                  <span className="block">{group.name} ({group.orders.length})</span>
                </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-6">
          {selectedDateGroup ? (
            <section key={selectedDateGroup.id} className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 px-2">
                <h2 className="text-2xl font-bold text-gray-700">{selectedDateGroup.name}</h2>
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-500">
                  {selectedDateGroup.orders.length} order{selectedDateGroup.orders.length !== 1 ? 's' : ''}
                </span>
              </div>

              {selectedDateGroup.orders.map((order) => {
                const isExpanded = expandedOrderId === order.order_id

                return (
                <section key={order.order_id} className="relative">
                  <button
                    type="button"
                    onClick={() => setExpandedOrderId(isExpanded ? null : order.order_id)}
                    className="flex w-full flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-[#D98C5F]/60 hover:bg-[#FFF7F1]/60"
                    aria-expanded={isExpanded}
                  >
                    <span className="rounded-full bg-[#D9C5B2] px-5 py-2 text-sm font-extrabold text-gray-700">
                      Order #{String(order.order_id).padStart(3, '0')}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-900">
                      Received
                    </span>
                    <span className="text-xs font-bold text-gray-500">
                      {timeLabel(order.created_at)}
                    </span>
                    <span className="min-w-[12rem] flex-1">
                      <span className="block text-base font-extrabold text-gray-800">
                        {order.customer_display}
                      </span>
                      <span className="mt-1 block truncate text-xs font-semibold text-gray-500">
                        {orderItemSummary(order)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg font-extrabold text-[#D98C5F]">
                        {formatPeso(order.total_amount)}
                      </span>
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        {isExpanded ? 'Hide receipt' : 'View receipt'}
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                  <div className="mt-3 bg-white border-2 border-[#D98C5F]/40 rounded-[2rem] p-6 shadow-sm">
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
                  ) : null}
                </section>
                )
              })}
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
