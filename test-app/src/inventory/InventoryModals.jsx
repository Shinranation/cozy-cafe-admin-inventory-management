export default function InventoryModals({
  stockMovementDialog,
  activeStockIngredient,
  qtyInputs,
  setQtyInputs,
  busyIngredientId,
  costInputs,
  setCostInputs,
  setStockMovementDialog,
  applyStockMovement,
  configured,
  missingRecipeDialog,
  setMissingRecipeDialog,
  editRecordDialog,
  setEditRecordDialog,
  activeEditIngredient,
  activeEditMenuItem,
  editRecordInputs,
  handleEditRecordInputChange,
  handleEditMenuPhotoUpload,
  uploadingEditMenuPhoto,
  handleRemoveEditMenuPhoto,
  removingEditMenuPhoto,
  editRecordBusy,
  menuCategoryOptions,
  openDeleteConfirm,
  handleSaveEditedRecord,
  deleteConfirm,
  handleDeleteConfirmInput,
  deleteBusy,
  setDeleteConfirm,
  handleConfirmedDelete,
  permanentDeleteConfirm,
  handlePermanentDeleteConfirmInput,
  permanentDeleteBusy,
  setPermanentDeleteConfirm,
  handleConfirmedPermanentDelete,
  recipeEditDialog,
  activeRecipeEditRow,
  activeRecipeEditMenuItem,
  recipeEditInputs,
  handleRecipeEditInputChange,
  rows,
  busyRecipeRowId,
  handleRemoveRecipeIngredient,
  recipeRowsByMenuId,
  setRecipeEditDialog,
  handleUpdateRecipeIngredient,
}) {
  return (
    <>      {stockMovementDialog && activeStockIngredient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {stockMovementDialog.mode === 'in' ? 'Stock In' : 'Stock Out'}
            </p>
            <h3 className="mt-1 break-words text-lg font-bold text-gray-900">
              {activeStockIngredient.name}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Current stock: {activeStockIngredient.current_quantity} {activeStockIngredient.unit_of_measure}
            </p>

            <div className="mt-5 grid gap-4">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Quantity
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  value={qtyInputs[activeStockIngredient.ingredient_id] ?? ''}
                  onChange={(e) =>
                    setQtyInputs((prev) => ({
                      ...prev,
                      [activeStockIngredient.ingredient_id]: e.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                  disabled={busyIngredientId === activeStockIngredient.ingredient_id}
                />
              </label>

              {stockMovementDialog.mode === 'in' && (
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Add Cost
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Optional total cost"
                    value={costInputs[activeStockIngredient.ingredient_id] ?? ''}
                    onChange={(e) =>
                      setCostInputs((prev) => ({
                        ...prev,
                        [activeStockIngredient.ingredient_id]: e.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={busyIngredientId === activeStockIngredient.ingredient_id}
                  />
                  <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-gray-500">
                    Leave blank if there is no peso cost to record.
                  </span>
                </label>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStockMovementDialog(null)}
                disabled={busyIngredientId === activeStockIngredient.ingredient_id}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyStockMovement(activeStockIngredient, stockMovementDialog.mode)}
                disabled={busyIngredientId === activeStockIngredient.ingredient_id || !configured}
                className={`rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                  stockMovementDialog.mode === 'in'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-amber-800 hover:bg-amber-900'
                }`}
              >
                {busyIngredientId === activeStockIngredient.ingredient_id
                  ? 'Saving...'
                  : stockMovementDialog.mode === 'in'
                    ? 'Save Stock In'
                    : 'Save Stock Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {missingRecipeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Recipe required
            </p>
            <h3 className="mt-1 break-words text-lg font-bold text-gray-900">
              {missingRecipeDialog.name}
            </h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              This menu item has no linked ingredients yet. Add at least one recipe ingredient so orders can deduct stock correctly.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setMissingRecipeDialog(null)}
                className="rounded-full bg-[#3B2F2A] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {editRecordDialog && (activeEditIngredient || activeEditMenuItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              Edit {editRecordDialog.type === 'ingredient' ? 'Ingredient' : 'Menu Item'}
            </h3>

            {editRecordDialog.type === 'ingredient' ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:col-span-2">
                  Ingredient name
                  <input
                    type="text"
                    value={editRecordInputs.name ?? ''}
                    onChange={(e) => handleEditRecordInputChange('name', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:col-span-2">
                  Classification
                  <input
                    type="text"
                    value={editRecordInputs.classification ?? ''}
                    onChange={(e) => handleEditRecordInputChange('classification', e.target.value)}
                    placeholder="Syrup, Dairy, Powder"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Current quantity
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editRecordInputs.current_quantity ?? ''}
                    onChange={(e) => handleEditRecordInputChange('current_quantity', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Unit
                  <input
                    type="text"
                    value={editRecordInputs.unit_of_measure ?? ''}
                    onChange={(e) => handleEditRecordInputChange('unit_of_measure', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Low stock
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editRecordInputs.low_stock ?? ''}
                    onChange={(e) => handleEditRecordInputChange('low_stock', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Menu item
                  <input
                    type="text"
                    value={editRecordInputs.name ?? ''}
                    onChange={(e) => handleEditRecordInputChange('name', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editRecordInputs.price ?? ''}
                    onChange={(e) => handleEditRecordInputChange('price', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Size
                  <input
                    type="text"
                    value={editRecordInputs.size_label ?? ''}
                    onChange={(e) => handleEditRecordInputChange('size_label', e.target.value)}
                    placeholder="12oz, 16oz, 190ml"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Photo URL
                  <input
                    type="url"
                    value={editRecordInputs.image_url ?? ''}
                    onChange={(e) => handleEditRecordInputChange('image_url', e.target.value)}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void handleEditMenuPhotoUpload(file)
                    }}
                    className="mt-2 w-full text-xs text-gray-500 file:mr-3 file:rounded-full file:border-0 file:bg-[#3B2F2A] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
                    disabled={editRecordBusy || uploadingEditMenuPhoto}
                  />
                  {uploadingEditMenuPhoto ? (
                    <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-gray-500">
                      Uploading photo...
                    </span>
                  ) : null}
                  {editRecordInputs.image_url ? (
                    <span className="mt-2 block">
                      <span className="block overflow-hidden rounded-lg border border-gray-200 bg-[#FAF8F5]">
                        <img
                          src={editRecordInputs.image_url}
                          alt="Menu item preview"
                          className="h-28 w-full object-cover"
                        />
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveEditMenuPhoto()}
                        disabled={editRecordBusy || uploadingEditMenuPhoto || removingEditMenuPhoto}
                        className="mt-2 w-full rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                      >
                        {removingEditMenuPhoto ? 'Removing...' : 'Remove photo from matching sizes'}
                      </button>
                    </span>
                  ) : null}
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:col-span-2">
                  Description
                  <input
                    type="text"
                    value={editRecordInputs.description ?? ''}
                    onChange={(e) => handleEditRecordInputChange('description', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  />
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Category
                  <select
                    value={editRecordInputs.category ?? ''}
                    onChange={(e) => handleEditRecordInputChange('category', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  >
                    {menuCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value="__custom__">Add new category...</option>
                  </select>
                  {editRecordInputs.category === '__custom__' && (
                    <input
                      type="text"
                      value={editRecordInputs.customCategory ?? ''}
                      onChange={(e) => handleEditRecordInputChange('customCategory', e.target.value)}
                      placeholder="Parent / Child"
                      className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                      disabled={editRecordBusy}
                    />
                  )}
                </label>

                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                  Status
                  <select
                    value={editRecordInputs.availability_status ?? 'available'}
                    onChange={(e) => handleEditRecordInputChange('availability_status', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
                    disabled={editRecordBusy}
                  >
                    <option value="available">available</option>
                    <option value="unavailable">unavailable</option>
                  </select>
                </label>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  const activeRecord = editRecordDialog.type === 'ingredient' ? activeEditIngredient : activeEditMenuItem
                  if (!activeRecord) return
                  setEditRecordDialog(null)
                  openDeleteConfirm(
                    editRecordDialog.type,
                    editRecordDialog.type === 'ingredient'
                      ? activeRecord.ingredient_id
                      : activeRecord.item_id,
                    activeRecord.name,
                  )
                }}
                disabled={editRecordBusy || !configured}
                className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                Archive {editRecordDialog.type === 'ingredient' ? 'Ingredient' : 'Menu Item'}
              </button>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditRecordDialog(null)}
                  disabled={editRecordBusy}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveEditedRecord()}
                  disabled={editRecordBusy || uploadingEditMenuPhoto || removingEditMenuPhoto || !configured}
                  className="rounded-full bg-[#3B2F2A] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {editRecordBusy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Are you sure?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will archive <span className="font-bold text-gray-900">{deleteConfirm.name}</span> from{' '}
              <span className="font-bold">{deleteConfirm.type === 'ingredient' ? 'inventory' : 'menu'}</span>.
              Type <span className="font-bold">yes</span> to continue.
            </p>

            <input
              type="text"
              value={deleteConfirm.input}
              onChange={(e) => handleDeleteConfirmInput(e.target.value)}
              placeholder="yes"
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              disabled={deleteBusy}
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteBusy}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedDelete}
                disabled={deleteBusy || deleteConfirm.input.trim().toLowerCase() !== 'yes'}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {permanentDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Permanently delete?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete <span className="font-bold text-gray-900">{permanentDeleteConfirm.name}</span> from archived{' '}
              <span className="font-bold">{permanentDeleteConfirm.type === 'ingredient' ? 'ingredients' : 'menu items'}</span>.
              This cannot be undone. Type <span className="font-bold">DELETE PERMANENTLY</span> to continue.
            </p>

            <input
              type="text"
              value={permanentDeleteConfirm.input}
              onChange={(e) => handlePermanentDeleteConfirmInput(e.target.value)}
              placeholder="DELETE PERMANENTLY"
              className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              disabled={permanentDeleteBusy}
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPermanentDeleteConfirm(null)}
                disabled={permanentDeleteBusy}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedPermanentDelete}
                disabled={permanentDeleteBusy || permanentDeleteConfirm.input.trim() !== 'DELETE PERMANENTLY'}
                className="rounded-full bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {permanentDeleteBusy ? 'Deleting...' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}

      {recipeEditDialog && activeRecipeEditRow && activeRecipeEditMenuItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Edit Recipe Ingredient</h3>
            <p className="mt-1 text-sm text-gray-600">{activeRecipeEditMenuItem.name}</p>

            <div className="mt-5 space-y-4">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Ingredient
                <select
                  value={
                    recipeEditInputs[activeRecipeEditRow.menu_ingredient_id]?.ingredient_id ??
                    String(activeRecipeEditRow.ingredient_id)
                  }
                  onChange={(e) =>
                    handleRecipeEditInputChange(
                      activeRecipeEditRow.menu_ingredient_id,
                      activeRecipeEditRow,
                      'ingredient_id',
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
                  disabled={busyRecipeRowId === activeRecipeEditRow.menu_ingredient_id || !configured || rows.length === 0}
                >
                  {rows.map((row) => (
                    <option key={row.ingredient_id} value={row.ingredient_id}>
                      {row.name} ({row.unit_of_measure})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                Quantity Required
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={
                    recipeEditInputs[activeRecipeEditRow.menu_ingredient_id]?.quantity_required ??
                    String(activeRecipeEditRow.quantity_required)
                  }
                  onChange={(e) =>
                    handleRecipeEditInputChange(
                      activeRecipeEditRow.menu_ingredient_id,
                      activeRecipeEditRow,
                      'quantity_required',
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                  disabled={busyRecipeRowId === activeRecipeEditRow.menu_ingredient_id || !configured}
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => handleRemoveRecipeIngredient(activeRecipeEditRow, activeRecipeEditMenuItem)}
                disabled={
                  busyRecipeRowId === activeRecipeEditRow.menu_ingredient_id ||
                  !configured ||
                  (recipeRowsByMenuId.get(activeRecipeEditMenuItem.item_id) ?? []).length <= 1
                }
                title={
                  (recipeRowsByMenuId.get(activeRecipeEditMenuItem.item_id) ?? []).length <= 1
                    ? 'A menu item needs at least one recipe ingredient.'
                    : 'Remove this recipe ingredient'
                }
                className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Remove
              </button>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRecipeEditDialog(null)}
                  disabled={busyRecipeRowId === activeRecipeEditRow.menu_ingredient_id}
                  className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateRecipeIngredient(activeRecipeEditRow, activeRecipeEditMenuItem)}
                  disabled={busyRecipeRowId === activeRecipeEditRow.menu_ingredient_id || !configured || rows.length === 0}
                  className="rounded-full bg-[#3B2F2A] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busyRecipeRowId === activeRecipeEditRow.menu_ingredient_id ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
