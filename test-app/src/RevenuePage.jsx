import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function formatCurrency(value) {
  return `₱${safeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getYear(dateValue) {
  const date = new Date(dateValue)
  return Number.isNaN(date.getTime()) ? null : date.getFullYear()
}

function getMonthIndex(dateValue) {
  const date = new Date(dateValue)
  return Number.isNaN(date.getTime()) ? -1 : date.getMonth()
}

function getWeekIndex(dateValue) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return 0
  return Math.min(4, Math.floor((date.getDate() - 1) / 7))
}

function emptyMonthRows() {
  return MONTHS.map((month) => ({
    month,
    totalRevenue: 0,
    totalExpenses: 0,
    netIncome: 0,
    weeklyRevenue: [0, 0, 0, 0, 0],
    weeklyExpenses: [0, 0, 0, 0, 0],
    orderCount: 0,
    expenseCount: 0,
  }))
}

function normalizeRpcArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

const RESET_ACTION_PHRASE = 'RESET REVENUE'
const RESET_SCOPE_PHRASE = 'DELETE ORDERS AND EXPENSES'

function getAvailableYears(orders, expenses, fallbackYear) {
  const years = new Set()

  for (const order of orders) {
    const orderYear = getYear(order.created_at)
    if (orderYear) years.add(orderYear)
  }

  for (const expense of expenses) {
    const expenseYear = getYear(expense.expense_date)
    if (expenseYear) years.add(expenseYear)
  }

  if (years.size === 0) return [fallbackYear]
  return [...years].sort((a, b) => b - a)
}

function buildMonthlyRows(orders, expenses, year) {
  const nextRows = emptyMonthRows()

  for (const order of orders) {
    if (getYear(order.created_at) !== year) continue

    const monthIndex = getMonthIndex(order.created_at)
    if (monthIndex < 0) continue

    const amount = safeNumber(order.total_amount)
    const weekIndex = getWeekIndex(order.created_at)

    nextRows[monthIndex].totalRevenue += amount
    nextRows[monthIndex].weeklyRevenue[weekIndex] += amount
    nextRows[monthIndex].orderCount += 1
  }

  for (const expense of expenses) {
    if (getYear(expense.expense_date) !== year) continue

    const monthIndex = getMonthIndex(expense.expense_date)
    if (monthIndex < 0) continue

    const expenseAmount = safeNumber(expense.amount)
    if (expenseAmount <= 0) continue

    const weekIndex = getWeekIndex(expense.expense_date)

    nextRows[monthIndex].totalExpenses += expenseAmount
    nextRows[monthIndex].weeklyExpenses[weekIndex] += expenseAmount
    nextRows[monthIndex].expenseCount += 1
  }

  return nextRows.map((row) => ({
    ...row,
    netIncome: row.totalRevenue - row.totalExpenses,
  }))
}

function isInSelectedPeriod(dateValue, year, monthName) {
  return getYear(dateValue) === year && MONTHS[getMonthIndex(dateValue)] === monthName
}

function ingredientNameFromExpense(expense) {
  const name = String(expense.expense_name ?? '').trim()
  const prefix = 'Inventory stock in:'
  if (name.toLowerCase().startsWith(prefix.toLowerCase())) {
    return name.slice(prefix.length).trim() || 'Unknown Ingredient'
  }
  return name || expense.category || 'Other Cost'
}

function buildIngredientCostRows(expenses, year, monthName) {
  const byIngredient = new Map()

  for (const expense of expenses) {
    if (!isInSelectedPeriod(expense.expense_date, year, monthName)) continue

    const amount = safeNumber(expense.amount)
    if (amount <= 0) continue

    const ingredientName = ingredientNameFromExpense(expense)
    const current = byIngredient.get(ingredientName) ?? {
      ingredientName,
      totalCost: 0,
      entryCount: 0,
    }

    current.totalCost += amount
    current.entryCount += 1
    byIngredient.set(ingredientName, current)
  }

  return [...byIngredient.values()].sort((a, b) => b.totalCost - a.totalCost)
}

function menuItemDisplayName(item) {
  return [item?.name, item?.size_label].filter(Boolean).join(' - ') || 'Unknown Menu Item'
}

function buildBestSellingRows(orders, year, monthName) {
  const byMenuItem = new Map()

  for (const order of orders) {
    if (!isInSelectedPeriod(order.created_at, year, monthName)) continue

    for (const item of order.items ?? []) {
      const key = String(item.menu_item_id ?? menuItemDisplayName(item))
      const quantity = safeNumber(item.quantity)
      const revenue = safeNumber(item.sub_total)
      const current = byMenuItem.get(key) ?? {
        name: menuItemDisplayName(item),
        quantitySold: 0,
        totalRevenue: 0,
        orderLineCount: 0,
      }

      current.quantitySold += quantity
      current.totalRevenue += revenue
      current.orderLineCount += 1
      byMenuItem.set(key, current)
    }
  }

  return [...byMenuItem.values()].sort(
    (a, b) => b.quantitySold - a.quantitySold || b.totalRevenue - a.totalRevenue,
  )
}

export default function AdminDashboardCosts() {
  const configured = supabaseConfigured()
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = MONTHS[currentDate.getMonth()] ?? MONTHS[0]

  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [year, setYear] = useState(currentYear)
  const [orders, setOrders] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(configured)
  const [fetchError, setFetchError] = useState(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetInputs, setResetInputs] = useState({ email: '', action: '', scope: '' })
  const [resetEmail, setResetEmail] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetMessage, setResetMessage] = useState(null)

  const resetReady =
    resetInputs.email.trim().toLowerCase() === resetEmail.trim().toLowerCase() &&
    resetInputs.action.trim() === RESET_ACTION_PHRASE &&
    resetInputs.scope.trim() === RESET_SCOPE_PHRASE

  const fetchFinancialData = useCallback(async () => {
    if (!supabase) return

    setLoading(true)
    setFetchError(null)

    const [receivedOrdersResult, expensesResult] = await Promise.all([
      supabase.rpc('list_received_orders_with_items'),
      supabase.from('expenses').select('expense_date,expense_name,amount,category'),
    ])

    if (receivedOrdersResult.error) {
      setFetchError(
        receivedOrdersResult.error?.message ||
          'Could not load revenue data.',
      )
      setOrders([])
      setExpenses([])
      setLoading(false)
      return
    }

    const nextOrders = normalizeRpcArray(receivedOrdersResult.data)
    const nextExpenses = expensesResult.error ? [] : expensesResult.data ?? []
    const nextYears = getAvailableYears(nextOrders, nextExpenses, currentYear)

    setOrders(nextOrders)
    setExpenses(nextExpenses)
    setYear((previousYear) => (nextYears.includes(previousYear) ? previousYear : nextYears[0]))

    if (expensesResult.error) {
      setFetchError(`Revenue loaded, but costs could not load: ${expensesResult.error.message}`)
    }

    setLoading(false)
  }, [currentYear])

  useEffect(() => {
    if (!configured || !supabase) return
    const timeoutId = window.setTimeout(() => {
      void fetchFinancialData()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [configured, fetchFinancialData])

  const openResetDialog = useCallback(async () => {
    if (!supabase) return
    setResetMessage(null)
    setFetchError(null)
    setResetInputs({ email: '', action: '', scope: '' })

    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user?.email) {
      setFetchError(error?.message ?? 'Could not confirm the signed-in account email.')
      return
    }

    setResetEmail(data.user.email)
    setResetDialogOpen(true)
  }, [])

  const handleResetInputChange = useCallback((field, value) => {
    setResetInputs((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleResetRevenueData = useCallback(async () => {
    if (!supabase || !resetReady) return

    setResetBusy(true)
    setFetchError(null)
    setResetMessage(null)

    const { data, error } = await supabase.rpc('reset_revenue_data', {
      p_confirm_email: resetInputs.email.trim(),
      p_confirm_action: resetInputs.action.trim(),
      p_confirm_scope: resetInputs.scope.trim(),
    })

    setResetBusy(false)

    if (error) {
      setFetchError(error.message)
      return
    }

    const deletedOrders = Number(data?.deleted_orders) || 0
    const deletedExpenses = Number(data?.deleted_expenses) || 0
    setResetMessage(`Revenue reset complete. Deleted ${deletedOrders} orders and ${deletedExpenses} expenses.`)
    setResetDialogOpen(false)
    setResetInputs({ email: '', action: '', scope: '' })
    await fetchFinancialData()
  }, [fetchFinancialData, resetInputs, resetReady])

  const availableYears = useMemo(
    () => getAvailableYears(orders, expenses, currentYear),
    [orders, expenses, currentYear],
  )

  const computedData = useMemo(
    () => buildMonthlyRows(orders, expenses, year),
    [orders, expenses, year],
  )

  const yearRevenue = useMemo(
    () => computedData.reduce((sum, item) => sum + item.totalRevenue, 0),
    [computedData],
  )

  const yearExpenses = useMemo(
    () => computedData.reduce((sum, item) => sum + item.totalExpenses, 0),
    [computedData],
  )

  const yearNetIncome = yearRevenue - yearExpenses

  const currentMonthData =
    computedData.find((item) => item.month === selectedMonth) || computedData[0]

  const ingredientCostRows = useMemo(
    () => buildIngredientCostRows(expenses, year, selectedMonth),
    [expenses, selectedMonth, year],
  )

  const bestSellingRows = useMemo(
    () => buildBestSellingRows(orders, year, selectedMonth),
    [orders, selectedMonth, year],
  )

  const selectedIngredientCost = useMemo(
    () => ingredientCostRows.reduce((sum, item) => sum + item.totalCost, 0),
    [ingredientCostRows],
  )

  const selectedBestSellerRevenue = useMemo(
    () => bestSellingRows.reduce((sum, item) => sum + item.totalRevenue, 0),
    [bestSellingRows],
  )

  const maxRevenue = Math.max(1, ...computedData.map((item) => item.totalRevenue))
  const maxCost = Math.max(1, ...computedData.map((item) => item.totalExpenses))
  const maxNet = Math.max(1, ...computedData.map((item) => Math.abs(item.netIncome)))
  const maxWeeklyRevenue = Math.max(1, ...currentMonthData.weeklyRevenue)

  return (
    <main className="min-h-screen bg-[#FDFBF4] py-10 px-4 font-sans text-gray-700">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-6xl md:text-7xl font-bold text-gray-500/80 leading-tight">
            Admin Dashboard <br /> Costs
          </h1>
        </header>

        {!configured && (
          <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            Missing Supabase URL/key. Set your Vite Supabase env values, then restart the dev server.
          </p>
        )}

        {fetchError && configured && (
          <div className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            <p>{fetchError}</p>
            <button
              type="button"
              onClick={fetchFinancialData}
              className="mt-2 text-xs font-bold underline text-[#D98C5F]"
            >
              Retry
            </button>
          </div>
        )}

        {resetMessage && configured && (
          <div className="text-center text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6">
            {resetMessage}
          </div>
        )}

        {resetDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-bold text-gray-900">Reset Revenue Data</h3>
              <p className="mt-2 text-sm text-gray-600">
                This clears orders, order items, payments, and expenses. Inventory quantities and menu recipes stay unchanged.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Account Email
                  <input
                    type="text"
                    value={resetInputs.email}
                    onChange={(e) => handleResetInputChange('email', e.target.value)}
                    placeholder={resetEmail}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={resetBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Type RESET REVENUE
                  <input
                    type="text"
                    value={resetInputs.action}
                    onChange={(e) => handleResetInputChange('action', e.target.value)}
                    placeholder={RESET_ACTION_PHRASE}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={resetBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Type DELETE ORDERS AND EXPENSES
                  <input
                    type="text"
                    value={resetInputs.scope}
                    onChange={(e) => handleResetInputChange('scope', e.target.value)}
                    placeholder={RESET_SCOPE_PHRASE}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={resetBusy}
                  />
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetDialogOpen(false)}
                  disabled={resetBusy}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetRevenueData()}
                  disabled={resetBusy || !resetReady}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {resetBusy ? 'Resetting...' : 'Reset Revenue'}
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="bg-white border-2 border-[#D98C5F]/40 rounded-[2.5rem] p-8 mb-8 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Supabase totals
              </p>
              <h2 className="text-2xl font-bold text-gray-700">{year} Monthly Overview</h2>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={year}
                onChange={(e) => setYear(safeNumber(e.target.value, currentYear))}
                className="w-28 rounded-xl border border-[#D98C5F]/30 px-3 py-2 text-sm font-semibold outline-none"
                aria-label="Revenue year"
              >
                {availableYears.map((availableYear) => (
                  <option key={availableYear} value={availableYear}>
                    {availableYear}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={fetchFinancialData}
                disabled={!configured || loading}
                className="rounded-xl bg-[#D98C5F] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={() => void openResetDialog()}
                disabled={!configured || loading}
                className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset Data
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="rounded-2xl border border-[#D98C5F]/30 p-5">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Year Revenue
              </p>
              <p className="mt-2 text-2xl font-bold text-green-700">{formatCurrency(yearRevenue)}</p>
            </div>

            <div className="rounded-2xl border border-[#D98C5F]/30 p-5">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Year Cost
              </p>
              <p className="mt-2 text-2xl font-bold text-red-500">{formatCurrency(yearExpenses)}</p>
            </div>

            <div className="rounded-2xl border border-[#D98C5F]/30 p-5">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Year Net Income
              </p>
              <p
                className={`mt-2 text-2xl font-bold ${
                  yearNetIncome >= 0 ? 'text-orange-500' : 'text-red-700'
                }`}
              >
                {formatCurrency(yearNetIncome)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {computedData.map((data) => {
              const revenueHeight = (data.totalRevenue / maxRevenue) * 130
              const costHeight = (data.totalExpenses / maxCost) * 130
              const netHeight = (Math.abs(data.netIncome) / maxNet) * 130
              const netColor = data.netIncome >= 0 ? 'bg-orange-400' : 'bg-red-700'

              return (
                <button
                  type="button"
                  key={data.month}
                  onClick={() => setSelectedMonth(data.month)}
                  className={`
                    cursor-pointer
                    rounded-3xl
                    p-4
                    transition-all
                    border-2
                    text-left
                    ${
                      selectedMonth === data.month
                        ? 'border-[#D98C5F] bg-[#FFF7F1]'
                        : 'border-[#D98C5F]/20 bg-white hover:bg-[#FFF7F1]/60'
                    }
                  `}
                >
                  <h3 className="text-center font-bold mb-6">{data.month}</h3>

                  <div className="flex items-end justify-center gap-2 h-40 mb-6 border-b border-gray-200 pb-2">
                    <div className="flex flex-col items-center">
                      <div
                        style={{ height: `${costHeight}px` }}
                        className="w-5 bg-red-500 rounded-t-md"
                      />
                      <span className="text-[10px] mt-1">Cost</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div
                        style={{ height: `${revenueHeight}px` }}
                        className="w-5 bg-green-600 rounded-t-md"
                      />
                      <span className="text-[10px] mt-1">Revenue</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div
                        style={{ height: `${netHeight}px` }}
                        className={`w-5 ${netColor} rounded-t-md`}
                      />
                      <span className="text-[10px] mt-1">Net</span>
                    </div>
                  </div>

                  <div className="border border-[#D98C5F]/30 rounded-2xl p-3 text-xs space-y-2">
                    <div className="flex justify-between gap-3">
                      <span>Total Cost</span>
                      <span>{formatCurrency(data.totalExpenses)}</span>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span>Revenue</span>
                      <span>{formatCurrency(data.totalRevenue)}</span>
                    </div>

                    <div className="flex justify-between gap-3 font-semibold">
                      <span>Net Income</span>
                      <span>{formatCurrency(data.netIncome)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="bg-white border-2 border-[#D98C5F]/40 rounded-[2.5rem] p-8 mb-8 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
                Receipt report
              </p>
              <h2 className="text-3xl font-bold text-gray-700">
                {selectedMonth} {year}
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Ingredient costs come from Inventory Stock In expenses. Best sellers come from received orders.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchFinancialData}
              disabled={!configured || loading}
              className="rounded-full border border-[#D98C5F]/30 bg-white px-5 py-2 text-sm font-bold text-[#3B2F2A] transition hover:bg-[#FFF7F1] disabled:opacity-50"
            >
              Refresh Receipt
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-8">
            <div className="rounded-2xl border border-[#D98C5F]/30 bg-[#FDFBF4] p-5">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Ingredient Cost Total
              </p>
              <p className="mt-2 text-3xl font-bold text-red-600">
                {formatCurrency(selectedIngredientCost)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#D98C5F]/30 bg-[#FDFBF4] p-5">
              <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Best-Seller Revenue
              </p>
              <p className="mt-2 text-3xl font-bold text-green-700">
                {formatCurrency(selectedBestSellerRevenue)}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[#D98C5F]/25 p-5">
              <h3 className="text-xl font-bold text-gray-800">Ingredient Cost Receipt</h3>
              <div className="mt-4 space-y-3">
                {ingredientCostRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    No ingredient costs recorded for this month.
                  </p>
                ) : (
                  ingredientCostRows.map((item, index) => (
                    <div
                      key={item.ingredientName}
                      className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          #{index + 1} - {item.entryCount} stock-in record{item.entryCount !== 1 ? 's' : ''}
                        </p>
                        <p className="mt-1 break-words font-bold text-gray-800">
                          {item.ingredientName}
                        </p>
                      </div>
                      <p className="shrink-0 font-bold text-red-600">
                        {formatCurrency(item.totalCost)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#D98C5F]/25 p-5">
              <h3 className="text-xl font-bold text-gray-800">Best Selling Menu</h3>
              <div className="mt-4 space-y-3">
                {bestSellingRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                    No received orders recorded for this month.
                  </p>
                ) : (
                  bestSellingRows.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          #{index + 1} - {item.orderLineCount} order line{item.orderLineCount !== 1 ? 's' : ''}
                        </p>
                        <p className="mt-1 break-words font-bold text-gray-800">
                          {item.name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-gray-500">
                          Sold: {item.quantitySold}
                        </p>
                      </div>
                      <p className="shrink-0 font-bold text-green-700">
                        {formatCurrency(item.totalRevenue)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border-2 border-[#D98C5F]/40 rounded-[2.5rem] p-10 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h2 className="text-4xl font-bold">{selectedMonth}</h2>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-[#D98C5F]/30 rounded-xl px-4 py-2 outline-none"
            >
              {MONTHS.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full h-[2px] bg-[#D98C5F]/30 mb-8" />

          <div className="space-y-10">
            <div>
              <h3 className="text-2xl font-semibold mb-5">Weekly Revenue</h3>

              <div className="space-y-4">
                {currentMonthData.weeklyRevenue.map((revenue, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <span className="w-28 font-medium">Week {index + 1}</span>
                    <div className="h-10 flex-1 overflow-hidden rounded-2xl border border-[#D98C5F]/30 bg-[#FDFBF4]">
                      <div
                        className="h-full rounded-2xl bg-green-600 transition-all"
                        style={{ width: `${Math.max(3, (revenue / maxWeeklyRevenue) * 100)}%` }}
                      />
                    </div>
                    <span className="w-32 text-right font-bold text-green-700">
                      {formatCurrency(revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#D98C5F]/30 p-5">
                <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                  Orders
                </p>
                <p className="mt-2 text-4xl font-bold">{currentMonthData.orderCount}</p>
              </div>

              <div className="rounded-2xl border border-[#D98C5F]/30 p-5">
                <p className="text-sm font-bold uppercase tracking-widest text-gray-400">
                  Expense Rows
                </p>
                <p className="mt-2 text-4xl font-bold">
                  {currentMonthData.expenseCount}
                </p>
              </div>
            </div>

            <div className="mt-10 border-t border-[#D98C5F]/20 pt-8 space-y-5 text-2xl">
              <div className="flex justify-between gap-4">
                <span>Total Revenue</span>

                <span className="font-bold text-green-700">
                  {formatCurrency(currentMonthData.totalRevenue)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span>Total Cost</span>

                <span className="font-bold text-red-500">
                  {formatCurrency(currentMonthData.totalExpenses)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span>Net Income</span>

                <span
                  className={`font-bold ${
                    currentMonthData.netIncome >= 0 ? 'text-orange-500' : 'text-red-700'
                  }`}
                >
                  {formatCurrency(currentMonthData.netIncome)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
