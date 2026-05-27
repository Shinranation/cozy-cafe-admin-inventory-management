export default function ArchivedInventorySection({
  archivedRows,
  archivedMenuRows,
  configured,
  busyAvailabilityItemId,
  handleSetMenuAvailability,
  openPermanentDeleteConfirm,
}) {
  return (
    <section className="mb-12 space-y-8" aria-label="Archived records">
      <div>
        <h3 className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-bold text-gray-600">
          Archived Ingredients
          <span className="font-normal normal-case text-gray-400">
            {archivedRows.length} item{archivedRows.length !== 1 ? 's' : ''}
          </span>
        </h3>

        {archivedRows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white/80 px-6 py-8 text-center text-sm text-gray-600">
            No archived ingredients.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archivedRows.map((row) => (
              <article key={row.ingredient_id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{row.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {row.current_quantity} {row.unit_of_measure} on hand
                    </p>
                  </div>
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold uppercase text-red-700">
                    Archived
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4">
                  <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Low Stock</p>
                    <p className="mt-1 text-lg font-bold text-gray-900">{row.low_stock}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openPermanentDeleteConfirm('ingredient', row.ingredient_id, row.name)}
                  disabled={!configured}
                  className="mt-4 rounded-full border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Delete permanently
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-bold text-gray-600">
          Archived Menu Items
          <span className="font-normal normal-case text-gray-400">
            {archivedMenuRows.length} item{archivedMenuRows.length !== 1 ? 's' : ''}
          </span>
        </h3>

        {archivedMenuRows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white/80 px-6 py-8 text-center text-sm text-gray-600">
            No archived menu items.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archivedMenuRows.map((item) => (
              <article key={item.item_id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900">{item.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {[item.category, item.size_label].filter(Boolean).join(' / ')}
                    </p>
                  </div>
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold uppercase text-red-700">
                    Archived
                  </span>
                </div>

                <p className="mt-4 text-sm text-gray-600">{item.description}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSetMenuAvailability(item, 'available')}
                    disabled={!configured || busyAvailabilityItemId === item.item_id}
                    className="cozy-btn cozy-btn-accent min-h-0 px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {busyAvailabilityItemId === item.item_id ? 'Updating...' : 'Make available'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openPermanentDeleteConfirm('menu', item.item_id, item.name)}
                    disabled={!configured}
                    className="cozy-btn cozy-btn-danger min-h-0 px-3 py-2 text-xs disabled:opacity-50"
                  >
                    Delete permanently
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
