export default function AddRecordPanel({
  addMode,
  setAddMode,
  configured,
  newIngredient,
  handleNewIngredientChange,
  addingIngredient,
  handleAddIngredient,
  newMenuItem,
  handleNewMenuItemChange,
  handleNewMenuPhotoUpload,
  uploadingNewMenuPhoto,
  handleRemoveNewMenuPhoto,
  removingNewMenuPhoto,
  addingMenuItem,
  handleAddMenuItem,
  menuCategoryOptions,
  customMenuCategory,
  setCustomMenuCategory,
}) {
  return (
    <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Add Record</h3>
          <p className="text-xs text-gray-500">Ingredients go to inventory. Menu items go to menu.</p>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-full border border-gray-300 bg-gray-50 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setAddMode('ingredient')}
            className={`rounded-full px-4 py-2 transition ${
              addMode === 'ingredient' ? 'bg-[#D98C5F] text-white shadow-sm' : 'text-gray-600'
            }`}
          >
            Ingredient
          </button>
          <button
            type="button"
            onClick={() => setAddMode('menu')}
            className={`rounded-full px-4 py-2 transition ${
              addMode === 'menu' ? 'bg-[#D98C5F] text-white shadow-sm' : 'text-gray-600'
            }`}
          >
            Menu Item
          </button>
          <button
            type="button"
            onClick={() => setAddMode('archived')}
            className={`rounded-full px-4 py-2 transition ${
              addMode === 'archived' ? 'bg-[#D98C5F] text-white shadow-sm' : 'text-gray-600'
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      {addMode === 'archived' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Archived records are hidden from active inventory and menu lists. Permanent delete is available below for rows you no longer need.
        </div>
      ) : addMode === 'ingredient' ? (
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_auto]">
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Ingredient
            <input
              type="text"
              value={newIngredient.name}
              onChange={(e) => handleNewIngredientChange('name', e.target.value)}
              placeholder="Flour"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingIngredient || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Classification
            <input
              type="text"
              value={newIngredient.classification}
              onChange={(e) => handleNewIngredientChange('classification', e.target.value)}
              placeholder="Syrup, Dairy, Powder"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingIngredient || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Amount
            <input
              type="number"
              min="0"
              step="any"
              value={newIngredient.current_quantity}
              onChange={(e) => handleNewIngredientChange('current_quantity', e.target.value)}
              placeholder="10"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingIngredient || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Unit
            <input
              type="text"
              value={newIngredient.unit_of_measure}
              onChange={(e) => handleNewIngredientChange('unit_of_measure', e.target.value)}
              placeholder="kg"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingIngredient || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Low Stock
            <input
              type="number"
              min="0"
              step="any"
              value={newIngredient.low_stock}
              onChange={(e) => handleNewIngredientChange('low_stock', e.target.value)}
              placeholder="2"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingIngredient || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Cost
            <input
              type="number"
              min="0"
              step="0.01"
              value={newIngredient.total_cost}
              onChange={(e) => handleNewIngredientChange('total_cost', e.target.value)}
              placeholder="150.00"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingIngredient || !configured}
            />
          </label>

          <button
            type="button"
            onClick={handleAddIngredient}
            disabled={addingIngredient || !configured}
            className="self-end rounded-full bg-[#D98C5F] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addingIngredient ? 'Adding...' : 'Add Ingredient'}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[1.1fr_1.3fr_0.7fr_0.7fr_1fr_1fr_0.8fr_auto]">
          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Menu Item
            <input
              type="text"
              value={newMenuItem.name}
              onChange={(e) => handleNewMenuItemChange('name', e.target.value)}
              placeholder="Chicken Teriyaki"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingMenuItem || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Description
            <input
              type="text"
              value={newMenuItem.description}
              onChange={(e) => handleNewMenuItemChange('description', e.target.value)}
              placeholder="Rice bowl with teriyaki chicken"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingMenuItem || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              value={newMenuItem.price}
              onChange={(e) => handleNewMenuItemChange('price', e.target.value)}
              placeholder="99.00"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingMenuItem || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Size
            <input
              type="text"
              value={newMenuItem.size_label}
              onChange={(e) => handleNewMenuItemChange('size_label', e.target.value)}
              placeholder="12oz"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingMenuItem || !configured}
            />
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Category
            <select
              value={newMenuItem.category}
              onChange={(e) => handleNewMenuItemChange('category', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingMenuItem || !configured}
            >
              {menuCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
              <option value="__custom__">Add new category...</option>
            </select>
            {newMenuItem.category === '__custom__' && (
              <input
                type="text"
                value={customMenuCategory}
                onChange={(e) => setCustomMenuCategory(e.target.value)}
                placeholder="Parent / Child"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                disabled={addingMenuItem || !configured}
              />
            )}
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Photo URL
            <input
              type="url"
              value={newMenuItem.image_url}
              onChange={(e) => handleNewMenuItemChange('image_url', e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingMenuItem || !configured}
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void handleNewMenuPhotoUpload(file)
              }}
              className="mt-2 w-full text-xs text-gray-500 file:mr-3 file:rounded-full file:border-0 file:bg-[#3B2F2A] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
              disabled={addingMenuItem || uploadingNewMenuPhoto || !configured}
            />
            {uploadingNewMenuPhoto ? (
              <span className="mt-1 block text-[11px] font-normal normal-case tracking-normal text-gray-500">
                Uploading photo...
              </span>
            ) : null}
            {newMenuItem.image_url ? (
              <span className="mt-2 block">
                <span className="block overflow-hidden rounded-lg border border-gray-200 bg-[#FAF8F5]">
                  <img
                    src={newMenuItem.image_url}
                    alt="Menu item preview"
                    className="h-24 w-full object-cover"
                  />
                </span>
                <button
                  type="button"
                  onClick={() => void handleRemoveNewMenuPhoto()}
                  disabled={addingMenuItem || uploadingNewMenuPhoto || removingNewMenuPhoto || !configured}
                  className="mt-2 w-full rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  {removingNewMenuPhoto ? 'Removing...' : 'Remove photo'}
                </button>
              </span>
            ) : null}
          </label>

          <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Status
            <select
              value={newMenuItem.availability_status}
              onChange={(e) => handleNewMenuItemChange('availability_status', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
              disabled={addingMenuItem || !configured}
            >
              <option value="available">available</option>
              <option value="unavailable">unavailable</option>
            </select>
          </label>

          <button
            type="button"
            onClick={handleAddMenuItem}
            disabled={addingMenuItem || uploadingNewMenuPhoto || removingNewMenuPhoto || !configured}
            className="self-end rounded-full bg-[#D98C5F] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addingMenuItem ? 'Adding...' : 'Add Menu'}
          </button>
        </div>
      )}
    </section>
  )
}
