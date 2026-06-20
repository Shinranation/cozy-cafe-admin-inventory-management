import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseConfigured } from '../../lib/supabaseClient.js'
import { parseRpcArray } from '../../shared/rpc.js'
import { listSoldItemsReport } from './soldItemsReportApi.js'

function todayInputValue() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateInputToLocalDate(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function nextDateInputValue(value) {
  const date = dateInputToLocalDate(value)
  if (!date) return ''
  date.setDate(date.getDate() + 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function cafeDayStartIso(value) {
  return dateInputToLocalDate(value) ? `${value}T00:00:00+08:00` : ''
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMoney(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 'PHP 0.00'
  return `PHP ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function itemLabel(row) {
  return [row.item_name, row.size_label].filter(Boolean).join(' - ') || 'Unknown item'
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function buildCsv(rows, startDate, endDate) {
  const header = [
    'Report Start',
    'Report End',
    'Item',
    'Size',
    'Category',
    'Quantity Sold',
    'Gross Sales',
    'Order Count',
    'Average Unit Price',
    'First Sold At',
    'Last Sold At',
  ]

  const lines = rows.map((row) => [
    startDate,
    endDate,
    row.item_name,
    row.size_label,
    row.category,
    row.quantity_sold,
    safeNumber(row.gross_sales).toFixed(2),
    row.order_count,
    safeNumber(row.average_unit_price).toFixed(2),
    formatDateTime(row.first_sold_at),
    formatDateTime(row.last_sold_at),
  ])

  return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')
}

export default function SoldItemsReportPage({ embedded = false }) {
  const configured = supabaseConfigured()
  const today = todayInputValue()
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState(null)

  const period = useMemo(() => {
    return {
      startIso: cafeDayStartIso(startDate),
      endExclusiveIso: cafeDayStartIso(nextDateInputValue(endDate)),
      valid: Boolean(cafeDayStartIso(startDate) && cafeDayStartIso(endDate) && startDate <= endDate),
    }
  }, [endDate, startDate])

  const reportTitle = startDate === endDate
    ? `Sold Items for ${formatDate(startDate)}`
    : `Sold Items from ${formatDate(startDate)} to ${formatDate(endDate)}`

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        quantity: acc.quantity + safeNumber(row.quantity_sold),
        sales: acc.sales + safeNumber(row.gross_sales),
        orders: acc.orders + safeNumber(row.order_count),
      }),
      { quantity: 0, sales: 0, orders: 0 },
    )
  }, [rows])

  const loadReport = useCallback(async () => {
    if (!period.valid) {
      setRows([])
      setError('Choose a valid date range.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: reportError } = await listSoldItemsReport({
      startAt: period.startIso,
      endAt: period.endExclusiveIso,
    })

    if (reportError) {
      setRows([])
      setError(reportError.message)
    } else {
      setRows(parseRpcArray(data))
    }

    setLoading(false)
  }, [period.endExclusiveIso, period.startIso, period.valid])

  useEffect(() => {
    if (!configured) {
      const timeoutId = window.setTimeout(() => setLoading(false), 0)
      return () => window.clearTimeout(timeoutId)
    }

    const timeoutId = window.setTimeout(() => {
      void loadReport()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [configured, loadReport])

  useEffect(() => {
    if (configured) {
      return
    }
    const timeoutId = window.setTimeout(() => setRows([]), 0)
    return () => window.clearTimeout(timeoutId)
  }, [configured])

  function handleToday() {
    const nextToday = todayInputValue()
    setStartDate(nextToday)
    setEndDate(nextToday)
  }

  function handleSaveCsv() {
    const csv = buildCsv(rows, startDate, endDate)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `sold-items-${startDate}-to-${endDate}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const content = (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }

          #sold-items-print-area,
          #sold-items-print-area * {
            visibility: visible;
          }

          #sold-items-print-area {
            position: absolute;
            inset: 0;
            width: 100%;
            padding: 24px;
            background: white;
            color: #111827;
          }

          .sold-items-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-7xl">
        <header className={`sold-items-no-print flex flex-col gap-3 md:flex-row md:items-end md:justify-between ${embedded ? 'mb-5 sm:mb-6' : 'mb-8 sm:mb-10'}`}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#D98C5F]">
              Sales report
            </p>
            <h1 className={`${embedded ? 'mt-1 text-2xl sm:text-3xl' : 'mt-2 text-4xl md:text-6xl'} font-bold text-gray-600`}>
              Sold Items
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleToday}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => void loadReport()}
              disabled={!configured || loading}
              className="rounded-full bg-[#3B2F2A] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </header>

        {!configured && (
          <p className="sold-items-no-print mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Configure Supabase URL and anon key to load the sold items report.
          </p>
        )}

        {error && (
          <p className="sold-items-no-print mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="sold-items-no-print mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:mb-6 sm:gap-4 sm:p-4 md:grid-cols-[1fr_1fr_auto_auto]">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Start Date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-gray-800"
            />
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
            End Date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-gray-800"
            />
          </label>

          <div className="col-span-2 flex items-end sm:col-span-1">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={rows.length === 0}
              className="w-full rounded-lg border border-[#D98C5F]/30 bg-white px-3 py-2 text-xs font-bold text-[#3B2F2A] transition hover:bg-[#FFF7F1] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:text-sm"
            >
              Print / Save PDF
            </button>
          </div>

          <div className="col-span-2 flex items-end sm:col-span-1">
            <button
              type="button"
              onClick={handleSaveCsv}
              disabled={rows.length === 0}
              className="w-full rounded-lg bg-[#D98C5F] px-3 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:px-4 sm:text-sm"
            >
              Save CSV
            </button>
          </div>
        </section>

        <section id="sold-items-print-area" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-col gap-4 border-b border-gray-100 pb-4 md:flex-row md:items-start md:justify-between sm:mb-6 sm:pb-5">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-[#D98C5F]">
                The Cozzy Cup Cafe
              </p>
              <h2 className="mt-1 text-2xl font-bold text-gray-800 sm:text-3xl">{reportTitle}</h2>
              <p className="mt-2 text-sm text-gray-500">
                Received orders only. Generated {formatDateTime(new Date())}.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
              <div className="rounded-xl border border-gray-200 px-2 py-2 sm:px-4 sm:py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Items Sold
                </p>
                <p className="mt-1 text-xl font-extrabold text-gray-800 sm:text-2xl">
                  {totals.quantity}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 px-2 py-2 sm:px-4 sm:py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Lines
                </p>
                <p className="mt-1 text-xl font-extrabold text-gray-800 sm:text-2xl">
                  {rows.length}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 px-2 py-2 sm:px-4 sm:py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Sales
                </p>
                <p className="mt-1 text-xl font-extrabold text-green-700 sm:text-2xl">
                  {formatMoney(totals.sales)}
                </p>
              </div>
            </div>
          </div>

          {loading && (
            <p className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
              Loading sold items...
            </p>
          )}

          {!loading && rows.length === 0 && !error && (
            <p className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
              No received sold items found for this period.
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    <th className="py-3 pr-3">Item</th>
                    <th className="py-3 pr-3">Category</th>
                    <th className="py-3 pr-3 text-right">Qty Sold</th>
                    <th className="py-3 pr-3 text-right">Avg Price</th>
                    <th className="py-3 pr-3 text-right">Gross Sales</th>
                    <th className="py-3 text-right">Last Sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={`${row.menu_item_id}-${row.item_name}-${row.size_label}`}>
                      <td className="py-3 pr-3">
                        <p className="font-bold text-gray-800">{itemLabel(row)}</p>
                        <p className="mt-0.5 text-xs font-semibold text-gray-400">
                          {safeNumber(row.order_count)} order line{safeNumber(row.order_count) !== 1 ? 's' : ''}
                        </p>
                      </td>
                      <td className="py-3 pr-3 font-semibold text-gray-600">
                        {row.category || 'Uncategorized'}
                      </td>
                      <td className="py-3 pr-3 text-right text-lg font-extrabold text-gray-800">
                        {safeNumber(row.quantity_sold)}
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold text-gray-600">
                        {formatMoney(row.average_unit_price)}
                      </td>
                      <td className="py-3 pr-3 text-right font-extrabold text-green-700">
                        {formatMoney(row.gross_sales)}
                      </td>
                      <td className="py-3 text-right text-xs font-semibold text-gray-500">
                        {formatDateTime(row.last_sold_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200">
                    <td className="pt-4 pr-3 text-base font-extrabold text-gray-800" colSpan={2}>
                      Total
                    </td>
                    <td className="pt-4 pr-3 text-right text-base font-extrabold text-gray-800">
                      {totals.quantity}
                    </td>
                    <td className="pt-4 pr-3" />
                    <td className="pt-4 pr-3 text-right text-base font-extrabold text-green-700">
                      {formatMoney(totals.sales)}
                    </td>
                    <td className="pt-4" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )

  if (embedded) return content

  return (
    <main className="min-h-screen bg-[#FDFBF4] px-3 py-6 font-sans text-gray-700 sm:px-4 sm:py-10">
      {content}
    </main>
  )
}
