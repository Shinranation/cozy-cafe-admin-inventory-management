export default function MenuItemsSection({
  loading,
  configured,
  menuRows,
  fetchError,
  menuCatalogueGroups,
  scrollToMenuCatalogueTarget,
  openEditRecordDialog,
  recipeRowsByMenuId,
  ingredientById,
  busyRecipeRowId,
  openRecipeEditDialog,
  setMissingRecipeDialog,
  recipeInputs,
  handleRecipeInputChange,
  rows,
  busyRecipeItemId,
  handleAddRecipeIngredient,
}) {
  if (!loading && configured && menuRows.length === 0 && !fetchError) {
    return (
      <div className="mb-8 rounded-2xl border-2 border-dashed border-gray-300 bg-white/80 px-6 py-10 text-center text-gray-600">
        <p className="mb-2 font-semibold text-gray-800">No menu items returned</p>
        <p className="mx-auto max-w-md text-sm">
          Add sellable products in the Menu Item tab, or check Row Level Security allows SELECT on menu.
        </p>
      </div>
    )
  }

  if (menuRows.length === 0) return null

  return (
    <section className="mb-12" aria-label="Menu item cards">
      <h3 className="mb-4 inline-flex flex-wrap items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-bold text-gray-600">
        Menu Items
        <span className="font-normal normal-case text-gray-400">
          {menuRows.length} item{menuRows.length !== 1 ? 's' : ''}
        </span>
      </h3>

      <div className="sticky top-3 z-20 mb-6 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          Catalogue
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {menuCatalogueGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => scrollToMenuCatalogueTarget(group.id)}
              className="rounded-full bg-[#3B2F2A] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
            >
              {group.name} ({group.count})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {menuCatalogueGroups.flatMap((group) =>
            group.sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToMenuCatalogueTarget(section.id)}
                className="rounded-full border border-[#D98C5F]/50 bg-[#FAF8F5] px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:border-[#D98C5F] hover:bg-white"
              >
                {section.name.replace(/\s*\/\s*/g, ' / ')}
              </button>
            )),
          )}
        </div>
      </div>

      <div className="space-y-10">
        {menuCatalogueGroups.map((group) => (
          <section key={group.id} id={group.id} className="scroll-mt-28">
            <h4 className="mb-4 text-2xl font-bold text-gray-700">{group.name}</h4>

            <div className="space-y-8">
              {group.sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-28">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h5 className="text-sm font-bold text-gray-800">
                      {section.name.replace(/\s*\/\s*/g, ' / ')}
                    </h5>
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-bold text-gray-500">
                      {section.items.length} item{section.items.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {section.items.map((item) => {
                      const available = item.availability_status.toLowerCase() === 'available'
                      const recipeRows = recipeRowsByMenuId.get(item.item_id) ?? []

                      return (
                        <article
                          key={item.item_id}
                          className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-bold leading-tight text-gray-900">{item.name}</p>
                              <p className="mt-1 text-xs text-gray-500">
                                {[item.category, item.size_label].filter(Boolean).join(' / ')}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditRecordDialog('menu', item)}
                                  className="cozy-btn cozy-btn-accent min-h-0 px-3 py-2 text-xs"
                                >
                                  Edit menu item
                                </button>
                              </div>
                            </div>

                            <span
                              className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${
                                available
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : 'border-red-300 bg-red-50 text-red-800'
                              }`}
                            >
                              {item.availability_status || 'unknown'}
                            </span>
                          </div>

                          <p className="min-h-10 text-sm text-gray-600">{item.description}</p>

                          <div className="mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                            <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">item_id</p>
                              <p className="mt-1 text-lg font-bold text-gray-900">{item.item_id}</p>
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">price</p>
                              <p className="mt-1 text-lg font-bold text-[#D98C5F]">
                                {item.price.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-3 border-t border-gray-100 pt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                              Recipe Ingredients
                            </p>

                            {recipeRows.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => setMissingRecipeDialog({ item_id: item.item_id, name: item.name })}
                                className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                              >
                                Recipe needed
                              </button>
                            ) : (
                              <ul className="space-y-3">
                                {recipeRows.map((recipeRow) => {
                                  const ingredient = ingredientById.get(recipeRow.ingredient_id)
                                  const isBusy = busyRecipeRowId === recipeRow.menu_ingredient_id

                                  return (
                                    <li
                                      key={recipeRow.menu_ingredient_id}
                                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-gray-700">
                                          {ingredient?.name ?? `Ingredient #${recipeRow.ingredient_id}`}
                                        </span>
                                        <span className="ml-2 text-gray-500">
                                          {recipeRow.quantity_required} {recipeRow.unit_of_measure}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => openRecipeEditDialog(recipeRow, item)}
                                        disabled={isBusy || !configured}
                                        className="shrink-0 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                                      >
                                        {isBusy ? '...' : 'Edit'}
                                      </button>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <select
                                value={recipeInputs[item.item_id]?.ingredient_id ?? ''}
                                onChange={(e) => handleRecipeInputChange(item.item_id, 'ingredient_id', e.target.value)}
                                className="min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-xs"
                                disabled={busyRecipeItemId === item.item_id || !configured || rows.length === 0}
                              >
                                <option value="">Choose ingredient</option>
                                {rows.map((ingredient) => (
                                  <option key={ingredient.ingredient_id} value={ingredient.ingredient_id}>
                                    {ingredient.name} ({ingredient.unit_of_measure})
                                  </option>
                                ))}
                              </select>

                              <input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="Qty"
                                value={recipeInputs[item.item_id]?.quantity_required ?? ''}
                                onChange={(e) => handleRecipeInputChange(item.item_id, 'quantity_required', e.target.value)}
                                className="min-w-0 rounded-lg border border-gray-300 px-2 py-2 text-xs"
                                disabled={busyRecipeItemId === item.item_id || !configured}
                              />

                              <button
                                type="button"
                                onClick={() => handleAddRecipeIngredient(item)}
                                disabled={busyRecipeItemId === item.item_id || !configured || rows.length === 0}
                                className="w-full rounded-full bg-[#3B2F2A] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50 sm:col-span-2"
                              >
                                {busyRecipeItemId === item.item_id ? 'Adding...' : 'Link'}
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
        ))}
      </div>
    </section>
  )
}
