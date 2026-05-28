const INVENTORY_CARD_SLOTS = 4

const inventoryCardGridClass =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

function slugifyForId(value) {
  return String(value || 'unclassified')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unclassified'
}

function classificationName(row) {
  return row.classification?.trim() || 'Unclassified'
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

  const classificationGroups = [...rows.reduce((groups, row) => {
    const name = classificationName(row)
    const existing = groups.get(name) ?? []
    existing.push(row)
    groups.set(name, existing)
    return groups
  }, new Map())]
    .map(([name, items]) => ({
      id: `ingredient-classification-${slugifyForId(name)}`,
      name,
      items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.name === 'Unclassified') return 1
      if (b.name === 'Unclassified') return -1
      return a.name.localeCompare(b.name)
    })

  function scrollToClassification(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="mb-12" aria-label="Ingredient cards">
      <div className="sticky top-3 z-20 mb-6 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Classifications
        </p>
        <div className="flex flex-wrap gap-2">
          {classificationGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => scrollToClassification(group.id)}
              className="rounded-full border border-[#D98C5F]/50 bg-[#FAF8F5] px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:border-[#D98C5F] hover:bg-white"
            >
              {group.name} ({group.items.length})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-10">
        {classificationGroups.map((group) => (
          <section key={group.id} id={group.id} className="scroll-mt-28">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-bold text-gray-800">{group.name}</h4>
              <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold text-gray-500">
                {group.items.length} item{group.items.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className={inventoryCardGridClass}>
              {group.items.map((row) => {
          const low = row.current_quantity <= row.low_stock
          const negative = row.current_quantity < 0
          const unitDisplay = row.unit_of_measure
          const statusLabel = negative ? 'negative' : low ? 'low stock' : 'in stock'

          return (
            <article
              key={row.ingredient_id}
              className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold leading-tight text-gray-900">{row.name}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {[row.classification, unitDisplay].filter(Boolean).join(' / ')}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEditRecordDialog('ingredient', row)}
                      className="cozy-btn cozy-btn-accent min-h-0 px-3 py-2 text-xs"
                    >
                      Edit ingredient
                    </button>
                  </div>
                </div>

                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${
                    negative
                      ? 'border-purple-300 bg-purple-50 text-purple-800'
                      : low
                        ? 'border-red-300 bg-red-50 text-red-800'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {statusLabel}
                </span>
              </div>

              <p className="min-h-10 text-sm text-gray-600">
                {row.classification ? `${row.classification} ingredient` : 'Unclassified ingredient'}
              </p>

              <div className="mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                    Quantity
                  </p>
                  <p className={`mt-1 break-words text-lg font-bold tabular-nums ${negative ? 'text-red-700' : 'text-gray-900'}`}>
                    {row.current_quantity}
                  </p>
                  <p className="mt-0.5 break-words text-[10px] text-gray-500">{unitDisplay}</p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                    Low Stock
                  </p>
                  <p className="mt-1 break-words text-lg font-bold tabular-nums text-gray-900">{row.low_stock}</p>
                  <p className="mt-0.5 text-[10px] text-gray-500">threshold</p>
                </div>
              </div>

              {negative && (
                <p className="break-words rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                  Quantity is below zero. Use Stock In to correct.
                </p>
              )}

              <div className="space-y-3 border-t border-gray-100 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Stock Actions
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              </div>
            </article>
          )
        })}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
