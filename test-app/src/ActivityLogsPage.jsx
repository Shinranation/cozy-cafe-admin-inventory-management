import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

const AREA_FILTERS = ['all', 'Inventory', 'Menu', 'Revenue', 'General']

const ACTION_FILTERS = [
  'all',
  'create',
  'update',
  'stock_update',
  'stock_in',
  'stock_out',
  'sale',
  'void',
  'archive',
  'restore',
  'price_update',
  'availability_update',
  'recipe_add',
  'recipe_update',
  'recipe_remove',
  'order_create',
  'order_received',
  'order_voided',
  'payment_recorded',
  'expense_create',
  'expense_update',
  'expense_delete',
  'delete',
]

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function titleize(value) {
  return String(value ?? '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function areaLabel(area) {
  if (area === 'Revenue') return 'Sales'
  return area
}

function actionClassName(action) {
  if (['create', 'stock_in', 'recipe_add', 'order_received', 'payment_recorded', 'expense_create', 'restore'].includes(action)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  }
  if (['update', 'stock_update', 'price_update', 'availability_update', 'recipe_update', 'expense_update'].includes(action)) {
    return 'border-amber-200 bg-amber-50 text-amber-800'
  }
  if (['delete', 'stock_out', 'recipe_remove', 'order_voided', 'expense_delete', 'void', 'archive'].includes(action)) {
    return 'border-red-200 bg-red-50 text-red-800'
  }
  if (action === 'sale') return 'border-blue-200 bg-blue-50 text-blue-800'
  return 'border-gray-200 bg-gray-50 text-gray-700'
}

function areaClassName(area) {
  if (area === 'Inventory') return 'border-teal-200 bg-teal-50 text-teal-800'
  if (area === 'Menu') return 'border-violet-200 bg-violet-50 text-violet-800'
  if (area === 'Revenue') return 'border-orange-200 bg-orange-50 text-orange-800'
  return 'border-gray-200 bg-gray-50 text-gray-700'
}

function formatJson(value) {
  if (!value) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function ActivityLogsPage() {
  const configured = supabaseConfigured()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(configured)
  const [error, setError] = useState(null)
  const [areaFilter, setAreaFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [emailFilter, setEmailFilter] = useState('')

  const loadLogs = useCallback(async () => {
    if (!supabase) return

    setLoading(true)
    setError(null)

    let query = supabase
      .from('activity_logs')
      .select('activity_id,created_at,actor_email,area,action,entity_type,entity_id,entity_name,description,metadata')
      .order('created_at', { ascending: false })
      .limit(200)

    if (areaFilter !== 'all') query = query.eq('area', areaFilter)
    if (actionFilter !== 'all') query = query.eq('action', actionFilter)
    if (emailFilter.trim()) query = query.ilike('actor_email', `%${emailFilter.trim()}%`)

    const { data, error: fetchError } = await query

    if (fetchError) {
      setError(fetchError.message)
      setLogs([])
    } else {
      setLogs(data ?? [])
    }

    setLoading(false)
  }, [actionFilter, areaFilter, emailFilter])

  useEffect(() => {
    if (!configured || !supabase) return
    const timeoutId = window.setTimeout(() => {
      void loadLogs()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [configured, loadLogs])

  const areaCounts = useMemo(() => {
    const counts = new Map()
    for (const log of logs) {
      counts.set(log.area, (counts.get(log.area) ?? 0) + 1)
    }
    return counts
  }, [logs])

  return (
    <main className="min-h-screen bg-[#FDFBF4] px-3 py-6 font-sans text-gray-700 sm:px-4 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between sm:mb-10 sm:gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#D98C5F]">
              Admin activity trail
            </p>
            <h1 className="mt-2 text-4xl font-bold text-gray-600 md:text-6xl">Activity Logs</h1>
          </div>

          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={!configured || loading}
            className="w-fit rounded-full bg-[#3B2F2A] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-2.5 sm:text-sm"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </header>

        {!configured && (
          <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Configure Supabase URL and anon key to load activity logs.
          </p>
        )}

        {error && (
          <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:mb-6 sm:gap-4 sm:p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:text-xs">
            Area
            <select
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-gray-800"
            >
              {AREA_FILTERS.map((area) => (
                <option key={area} value={area}>
                  {area === 'all' ? 'All areas' : areaLabel(area)}
                </option>
              ))}
            </select>
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:text-xs">
            Action
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-gray-800"
            >
              {ACTION_FILTERS.map((action) => (
                <option key={action} value={action}>
                  {action === 'all' ? 'All actions' : titleize(action)}
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:text-xs md:col-span-1">
            Email
            <input
              type="search"
              value={emailFilter}
              onChange={(event) => setEmailFilter(event.target.value)}
              placeholder="admin@example.com"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-gray-800"
            />
          </label>

          <div className="flex items-end">
            <p className="rounded-lg border border-[#D98C5F]/20 bg-[#FFF7F1] px-3 py-2 text-xs font-bold text-gray-700 sm:px-4 sm:text-sm">
              {logs.length} shown
            </p>
          </div>
        </section>

        {logs.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {[...areaCounts.entries()].map(([area, count]) => (
              <span
                key={area}
                className={`rounded-full border px-3 py-1 text-xs font-bold ${areaClassName(area)}`}
              >
                {areaLabel(area)}: {count}
              </span>
            ))}
          </div>
        )}

        {loading && (
          <p className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500">
            Loading activity logs...
          </p>
        )}

        {!loading && logs.length === 0 && !error && (
          <p className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-500">
            No activity logs found yet.
          </p>
        )}

        <div className="space-y-3">
          {logs.map((log) => (
            <article key={log.activity_id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase ${areaClassName(log.area)}`}
                    >
                      {areaLabel(log.area)}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase ${actionClassName(log.action)}`}
                    >
                      {titleize(log.action)}
                    </span>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-bold text-gray-600">
                      {log.entity_type}
                    </span>
                  </div>
                  <h2 className="break-words text-base font-bold text-gray-800">
                    {log.description}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {log.actor_email || 'system'} - {formatDateTime(log.created_at)}
                  </p>
                </div>

                <div className="rounded-lg border border-gray-100 bg-[#FAF8F5] px-3 py-2 text-xs text-gray-600 lg:max-w-xs">
                  <p className="font-bold text-gray-700">{log.entity_name || log.entity_type}</p>
                  {log.entity_id && <p>ID: {log.entity_id}</p>}
                </div>
              </div>

              <details className="mt-4 rounded-xl border border-gray-100 bg-[#FAF8F5]">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-500">
                  Technical details
                </summary>
                <pre className="max-h-96 overflow-auto border-t border-gray-100 bg-white p-3 text-xs text-gray-700">
                  {formatJson(log.metadata) || '-'}
                </pre>
              </details>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
