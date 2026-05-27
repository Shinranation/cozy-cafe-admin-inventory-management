const INVENTORY_CARD_SLOTS = 4

const inventoryCardGridClass =
  'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-3 lg:gap-4'

function stockBarPercent(row) {
  const q = row.current_quantity
  const low = row.low_stock
  if (q <= 0) return 0
  const maxBar = Math.max(q, low * 2.5, 1)
  return Math.min(100, (q / maxBar) * 100)
}

export default function IngredientInventorySection({
  loading,
  configured,
  rows,
  fetchError,
  busyIngredientId,
  openEditRecordDialog,
  openStockMovementDialog,
}) {
  if (loading && configured && rows.length === 0 && !fetchError) {
    return (
      <section className="mb-12" aria-busy="true" aria-label="Loading ingredient cards">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-600">Inventory</h3>
          <span className="text-xs text-gray-400">Loading...</span>
        </div>
        <div className={inventoryCardGridClass}>
          {Array.from({ length: INVENTORY_CARD_SLOTS }).map((_, idx) => (
            <div
              key={idx}
              className="h-72 rounded-2xl border border-gray-200 bg-white shadow-sm animate-pulse"
            />
          ))}
        </div>
      </section>
    )
  }

  if (!loading && configured && rows.length === 0 && !fetchError) {
    return (
      <div className="mb-8 rounded-2xl border-2 border-dashed border-gray-300 bg-white/80 px-6 py-10 text-center text-gray-600">
        <p className="mb-2 font-semibold text-gray-800">No ingredient rows returned</p>
        <p className="mx-auto max-w-md text-sm">
          Add rows in the inventory table or check Row Level Security allows SELECT for your anon key.
        </p>
      </div>
    )
  }

  if (rows.length === 0) return null

  return (
    <section className="mb-12" aria-label="Ingredient cards">
      <h3 className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-bold text-gray-600">
        Inventory
        <span className="font-normal normal-case text-gray-400">
          {rows.length} ingredient box{rows.length !== 1 ? 'es' : ''}
        </span>
      </h3>

      <div className={inventoryCardGridClass}>
        {rows.map((row) => {
          const pct = stockBarPercent(row)
          const low = row.current_quantity <= row.low_stock
          const negative = row.current_quantity < 0
          const unitDisplay = row.unit_of_measure

          return (
            <article
              key={row.ingredient_id}
              className="flex min-h-[280px] min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div
                className="relative aspect-[5/4] min-h-[11rem] overflow-hidden rounded-xl bg-gradient-to-b from-[#EDE8E0] to-[#DDD5CA] shadow-inner ring-2 ring-dashed ring-[#C4B8A8]"
                aria-label={`Image placeholder for ingredient ${row.name}`}
              >
                {(low || negative) && (
                  <span
                    className={`absolute right-2 top-2 h-4 w-4 rounded-full ring-2 ring-white ${negative ? 'bg-purple-600' : 'bg-red-500'}`}
                    title={negative ? 'Negative on-hand quantity' : 'Low stock'}
                    aria-label={negative ? 'Negative quantity' : 'Low stock'}
                  />
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 pt-8 text-center">
                  <svg
                    className="h-14 w-14 text-stone-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 64 64"
                    aria-hidden
                  >
                    <rect x="6" y="12" width="52" height="40" rx="4" strokeWidth="2" />
                    <path d="M6 42 L20 26 L34 38 L42 28 L58 42" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="22" cy="22" r="4" strokeWidth="2" />
                  </svg>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-stone-500">
                    Ingredient photo
                  </span>
                  <span className="max-w-full break-words text-[10px] leading-tight text-stone-500">
                    Slot for image URL / upload
                    <br />
                    ({row.name})
                  </span>
                </div>
              </div>

              <div>
                <p className="break-words text-base font-bold leading-tight text-gray-900">{row.name}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditRecordDialog('ingredient', row)}
                    className="cozy-btn cozy-btn-accent min-h-0 max-w-full px-3 py-2 text-xs"
                  >
                    Edit ingredient
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="min-w-0 rounded-lg border border-gray-200 bg-[#FAF8F5] px-2 py-2 text-center shadow-sm">
                  <p className="text-[9px] font-bold uppercase leading-tight tracking-wider text-gray-500">
                    Quantity
                  </p>
                  <p className={`mt-1 break-words text-xl font-bold tabular-nums ${negative ? 'text-red-700' : 'text-gray-900'}`}>
                    {row.current_quantity}
                  </p>
                  <p className="mt-0.5 break-words text-[9px] text-gray-500">{unitDisplay}</p>
                </div>
                <div className="min-w-0 rounded-lg border border-gray-200 bg-[#FAF8F5] px-2 py-2 text-center shadow-sm">
                  <p className="text-[9px] font-bold uppercase leading-tight tracking-wider text-gray-500">
                    Unit
                  </p>
                  <p className="mt-1 break-words text-base font-bold tracking-tight text-gray-900 sm:text-lg">
                    {unitDisplay}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-gray-200 bg-[#FAF8F5] px-2 py-2 text-center shadow-sm">
                  <p className="text-[9px] font-bold uppercase leading-tight tracking-wider text-gray-500">
                    Low Stock
                  </p>
                  <p className="mt-1 break-words text-xl font-bold tabular-nums text-gray-900">{row.low_stock}</p>
                  <p className="mt-0.5 text-[9px] text-gray-500">threshold</p>
                </div>
              </div>

              {negative && (
                <p className="break-words rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  Quantity is below zero. Use Stock In to correct.
                </p>
              )}

              <div>
                <div className="h-2 overflow-hidden rounded-full bg-amber-900/25">
                  <div
                    className={`h-full rounded-full ${low ? 'bg-amber-800' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-auto grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busyIngredientId === row.ingredient_id || !configured}
                  onClick={() => openStockMovementDialog(row, 'in')}
                  className="cozy-btn min-h-0 rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busyIngredientId === row.ingredient_id ? '...' : 'Stock In'}
                </button>
                <button
                  type="button"
                  disabled={busyIngredientId === row.ingredient_id || !configured}
                  onClick={() => openStockMovementDialog(row, 'out')}
                  className="cozy-btn min-h-0 rounded-full bg-amber-800 px-3 py-2 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-50"
                >
                  {busyIngredientId === row.ingredient_id ? '...' : 'Stock Out'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
