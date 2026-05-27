export function safeNumeric(raw, fallback = 0) {
  if (raw === null || raw === undefined || raw === '') return fallback
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function normalizeUnit(raw) {
  if (raw === null || raw === undefined) return '-'
  const s = String(raw).trim()
  return s === '' ? '-' : s
}

export function normalizeInventoryRow(raw) {
  const id = Number(raw.ingredient_id)
  return {
    ingredient_id: Number.isFinite(id) ? id : safeNumeric(raw.ingredient_id, 0),
    name: String(raw.name ?? ''),
    current_quantity: safeNumeric(raw.current_quantity, 0),
    unit_of_measure: normalizeUnit(raw.unit_of_measure),
    low_stock: safeNumeric(raw.low_stock, 0),
    is_active: raw.is_active !== false,
  }
}

export function normalizeMenuRow(raw) {
  const id = Number(raw.item_id)
  return {
    item_id: Number.isFinite(id) ? id : safeNumeric(raw.item_id, 0),
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    price: safeNumeric(raw.price, 0),
    category: String(raw.category ?? ''),
    size_label: String(raw.size_label ?? ''),
    availability_status: String(raw.availability_status ?? ''),
  }
}

export function normalizeMenuIngredientRow(raw) {
  const id = Number(raw.menu_ingredient_id)
  return {
    menu_ingredient_id: Number.isFinite(id) ? id : safeNumeric(raw.menu_ingredient_id, 0),
    menu_item_id: safeNumeric(raw.menu_item_id, 0),
    ingredient_id: safeNumeric(raw.ingredient_id, 0),
    quantity_required: safeNumeric(raw.quantity_required, 0),
    unit_of_measure: normalizeUnit(raw.unit_of_measure),
  }
}

export function normalizeMenuCategoryRow(raw) {
  const id = Number(raw.category_id)
  const parentId = raw.parent_category_id == null ? null : Number(raw.parent_category_id)
  return {
    category_id: Number.isFinite(id) ? id : safeNumeric(raw.category_id, 0),
    name: String(raw.name ?? ''),
    parent_category_id: Number.isFinite(parentId) ? parentId : null,
    is_active: raw.is_active !== false,
  }
}

export function mergeUpdateIntoRow(prevRow, incoming) {
  if (!incoming) return prevRow
  const base = prevRow ?? normalizeInventoryRow(incoming)
  return normalizeInventoryRow({
    ingredient_id: incoming.ingredient_id ?? base.ingredient_id,
    name: incoming.name ?? base.name,
    current_quantity: incoming.current_quantity ?? base.current_quantity,
    unit_of_measure: incoming.unit_of_measure ?? base.unit_of_measure,
    low_stock: incoming.low_stock ?? base.low_stock,
    is_active: incoming.is_active ?? base.is_active,
  })
}

export function sortById(rows) {
  return [...rows].sort((a, b) => a.ingredient_id - b.ingredient_id)
}

export function sortMenuById(rows) {
  return [...rows].sort((a, b) => a.item_id - b.item_id)
}

export function sortText(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

export function slugifyForId(value) {
  return String(value || 'uncategorized')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'uncategorized'
}

export function buildCategoryPath(category, byId, seen = new Set()) {
  if (!category || seen.has(category.category_id)) return ''
  seen.add(category.category_id)
  const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null
  const parentPath = parent ? buildCategoryPath(parent, byId, seen) : ''
  return parentPath ? `${parentPath} / ${category.name}` : category.name
}

export function mergeRealtimeRows(prev, payload) {
  const eventType = payload.eventType
  if (eventType === 'INSERT' && payload.new) {
    const row = normalizeInventoryRow(payload.new)
    if (!row.is_active) return prev
    const without = prev.filter((r) => r.ingredient_id !== row.ingredient_id)
    return sortById([...without, row])
  }
  if (eventType === 'UPDATE' && payload.new) {
    const id = Number(payload.new.ingredient_id)
    const prevRow = prev.find((r) => r.ingredient_id === id)
    const row = mergeUpdateIntoRow(prevRow, payload.new)
    if (!row.is_active) return prev.filter((r) => r.ingredient_id !== row.ingredient_id)
    return sortById(prev.map((r) => (r.ingredient_id === row.ingredient_id ? row : r)))
  }
  if (eventType === 'DELETE' && payload.old) {
    const id = Number(payload.old.ingredient_id)
    return prev.filter((r) => r.ingredient_id !== id)
  }
  return prev
}

export function parsePositiveAmount(raw) {
  if (raw === undefined || raw === '') return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return NaN
  return n
}

export function parseOptionalCost(raw) {
  if (raw === undefined || raw === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return NaN
  return n
}

export function parseNonNegativeAmount(raw, fallback = 0) {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return NaN
  return n
}

export function safeIntegerEnv(raw, fallback) {
  const n = Number(raw)
  return Number.isInteger(n) ? n : fallback
}
