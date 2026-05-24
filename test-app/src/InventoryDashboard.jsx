import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

/** @typedef {{ ingredient_id: number, name: string, current_quantity: number, unit_of_measure: string, low_stock: number, is_active: boolean }} InventoryRow */
/** @typedef {{ item_id: number, name: string, description: string, price: number, category: string, size_label: string, availability_status: string }} MenuRow */
/** @typedef {{ menu_ingredient_id: number, menu_item_id: number, ingredient_id: number, quantity_required: number, unit_of_measure: string }} MenuIngredientRow */
/** @typedef {{ category_id: number, name: string, parent_category_id: number | null, is_active: boolean }} MenuCategoryRow */

/** Avoid NaN when Postgres / Realtime sends null, blanks, or non-numeric strings. */
function safeNumeric(raw, fallback = 0) {
  if (raw === null || raw === undefined || raw === '') return fallback
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function normalizeUnit(raw) {
  if (raw === null || raw === undefined) return '—'
  const s = String(raw).trim()
  return s === '' ? '—' : s
}

function normalizeInventoryRow(raw) {
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

function normalizeMenuRow(raw) {
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

function normalizeMenuIngredientRow(raw) {
  const id = Number(raw.menu_ingredient_id)
  return {
    menu_ingredient_id: Number.isFinite(id) ? id : safeNumeric(raw.menu_ingredient_id, 0),
    menu_item_id: safeNumeric(raw.menu_item_id, 0),
    ingredient_id: safeNumeric(raw.ingredient_id, 0),
    quantity_required: safeNumeric(raw.quantity_required, 0),
    unit_of_measure: normalizeUnit(raw.unit_of_measure),
  }
}

function normalizeMenuCategoryRow(raw) {
  const id = Number(raw.category_id)
  const parentId = raw.parent_category_id == null ? null : Number(raw.parent_category_id)
  return {
    category_id: Number.isFinite(id) ? id : safeNumeric(raw.category_id, 0),
    name: String(raw.name ?? ''),
    parent_category_id: Number.isFinite(parentId) ? parentId : null,
    is_active: raw.is_active !== false,
  }
}

/**
 * Realtime UPDATE payloads are often partial (e.g. only current_quantity). Merge with the prior row
 * so unit_of_measure / low_stock / name do not disappear on partial payloads.
 */
function mergeUpdateIntoRow(prevRow, incoming) {
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

function sortById(rows) {
  return [...rows].sort((a, b) => a.ingredient_id - b.ingredient_id)
}

function sortMenuById(rows) {
  return [...rows].sort((a, b) => a.item_id - b.item_id)
}

function sortText(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function buildCategoryPath(category, byId, seen = new Set()) {
  if (!category || seen.has(category.category_id)) return ''
  seen.add(category.category_id)
  const parent = category.parent_category_id ? byId.get(category.parent_category_id) : null
  const parentPath = parent ? buildCategoryPath(parent, byId, seen) : ''
  return parentPath ? `${parentPath} / ${category.name}` : category.name
}

/** Skeleton slots on first load — matches your current 4-row inventory; increase if needed. */
const INVENTORY_CARD_SLOTS = 4

const inventoryCardGridClass =
  'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-3 lg:gap-4'

/** Bar fill only when quantity &gt; 0; negatives match your DB (e.g. oversold / adjustment). */
function stockBarPercent(row) {
  const q = row.current_quantity
  const low = row.low_stock
  if (q <= 0) return 0
  const maxBar = Math.max(q, low * 2.5, 1)
  return Math.min(100, (q / maxBar) * 100)
}

function safeIntegerEnv(raw, fallback) {
  const n = Number(raw)
  return Number.isInteger(n) ? n : fallback
}

const TX_REFERENCE_ID = safeIntegerEnv(import.meta.env.VITE_TX_REFERENCE_ID, 1)
const TX_CASHIER_ID = safeIntegerEnv(import.meta.env.VITE_TX_CASHIER_ID, 1)

/**
 * Aligns with `inventory_transactions` ERD:
 * transaction_id (PK), ingredient_id (FK→inventory), quantity_change, transaction_type,
 * reference_id, reason, timestamp, cashier_id.
 */
async function insertInventoryTransactionRow(supabase, { ingredient_id, actualDelta, transaction_type, reason }) {
  const txRow = {
    ingredient_id,
    quantity_change: actualDelta,
    transaction_type,
    reason,
    reference_id: TX_REFERENCE_ID,
    cashier_id: TX_CASHIER_ID,
  }

  const { error } = await supabase.from('inventory_transactions').insert(txRow)
  return error
}

async function insertExpenseRow(supabase, { ingredientName, amount, cashier_id }) {
  const expenseRow = {
    expense_name: `Inventory stock in: ${ingredientName}`,
    amount,
    category: 'Inventory',
    cashier_id,
    notes: 'Created from Inventory Stock In',
  }

  const { error } = await supabase.from('expenses').insert(expenseRow)
  return error
}

function mergeRealtimeRows(prev, payload) {
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

function parsePositiveAmount(raw) {
  if (raw === undefined || raw === '') return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return NaN
  return n
}

function parseOptionalCost(raw) {
  if (raw === undefined || raw === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return NaN
  return n
}

function parseNonNegativeAmount(raw, fallback = 0) {
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return NaN
  return n
}

const emptyNewIngredient = {
  name: '',
  current_quantity: '',
  unit_of_measure: '',
  low_stock: '',
  total_cost: '',
}

const MENU_CATEGORIES = [
  'Rice Bowl Chicken Wings',
  'French Fries',
  'Waffles',
  'Soft Drinks',
  'Korean Rice Bowls',
  'Sandwiches',
  'Silog Bowls',
  'Others',
]

const emptyNewMenuItem = {
  name: '',
  description: '',
  price: '',
  category: MENU_CATEGORIES[0],
  size_label: '',
  availability_status: 'available',
}

export default function InventoryDashboard() {
  /** @type {[InventoryRow[], React.Dispatch<React.SetStateAction<InventoryRow[]>>]} */
  const [rows, setRows] = useState([])
  /** @type {[MenuRow[], React.Dispatch<React.SetStateAction<MenuRow[]>>]} */
  const [menuRows, setMenuRows] = useState([])
  /** @type {[InventoryRow[], React.Dispatch<React.SetStateAction<InventoryRow[]>>]} */
  const [archivedRows, setArchivedRows] = useState([])
  /** @type {[MenuRow[], React.Dispatch<React.SetStateAction<MenuRow[]>>]} */
  const [archivedMenuRows, setArchivedMenuRows] = useState([])
  /** @type {[MenuIngredientRow[], React.Dispatch<React.SetStateAction<MenuIngredientRow[]>>]} */
  const [menuIngredientRows, setMenuIngredientRows] = useState([])
  /** @type {[MenuCategoryRow[], React.Dispatch<React.SetStateAction<MenuCategoryRow[]>>]} */
  const [categoryRows, setCategoryRows] = useState([])
  const configured = supabaseConfigured()
  const [loading, setLoading] = useState(configured)
  const [fetchError, setFetchError] = useState(/** @type {string | null} */ (null))
  const [realtimeStatus, setRealtimeStatus] = useState(/** @type {'idle' | 'subscribed' | 'error'} */ ('idle'))
  /** Quantity to add/remove per row (string for controlled inputs) */
  const [qtyInputs, setQtyInputs] = useState(/** @type {Record<number, string>} */ ({}))
  /** Total peso cost for a Stock In purchase. Saved to expenses.amount. */
  const [costInputs, setCostInputs] = useState(/** @type {Record<number, string>} */ ({}))
  const [addMode, setAddMode] = useState('ingredient')
  const [newIngredient, setNewIngredient] = useState(emptyNewIngredient)
  const [newMenuItem, setNewMenuItem] = useState(emptyNewMenuItem)
  const [customMenuCategory, setCustomMenuCategory] = useState('')
  const [newCategory, setNewCategory] = useState({ name: '', parent_category_id: '' })
  const [addingCategory, setAddingCategory] = useState(false)
  const [editRecordDialog, setEditRecordDialog] = useState(
    /** @type {{ type: 'ingredient' | 'menu', id: number } | null} */ (null),
  )
  const [editRecordInputs, setEditRecordInputs] = useState(/** @type {Record<string, string>} */ ({}))
  const [editRecordBusy, setEditRecordBusy] = useState(false)
  const [recipeInputs, setRecipeInputs] = useState(/** @type {Record<number, { ingredient_id: string, quantity_required: string }>} */ ({}))
  const [recipeEditInputs, setRecipeEditInputs] = useState(/** @type {Record<number, { ingredient_id: string, quantity_required: string }>} */ ({}))
  const [recipeEditDialog, setRecipeEditDialog] = useState(
    /** @type {{ recipeRowId: number, menuItemId: number } | null} */ (null),
  )
  const [busyIngredientId, setBusyIngredientId] = useState(/** @type {number | null} */ (null))
  const [addingIngredient, setAddingIngredient] = useState(false)
  const [addingMenuItem, setAddingMenuItem] = useState(false)
  const [busyRecipeItemId, setBusyRecipeItemId] = useState(/** @type {number | null} */ (null))
  const [busyRecipeRowId, setBusyRecipeRowId] = useState(/** @type {number | null} */ (null))
  const [deleteConfirm, setDeleteConfirm] = useState(
    /** @type {{ type: 'ingredient' | 'menu', id: number, name: string, input: string } | null} */ (null),
  )
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState(
    /** @type {{ type: 'ingredient' | 'menu', id: number, name: string, input: string } | null} */ (null),
  )
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [permanentDeleteBusy, setPermanentDeleteBusy] = useState(false)
  const [actionError, setActionError] = useState(/** @type {string | null} */ (null))
  const [actionMessage, setActionMessage] = useState(/** @type {string | null} */ (null))

  const missingEnvMessage =
    'Missing Supabase URL/key. Set SUPABASE_URL and SUPABASE_KEY (anon) or VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the repo-root .env — see test-app/.env.example.'

  const ingredientById = useMemo(() => {
    return new Map(rows.map((row) => [row.ingredient_id, row]))
  }, [rows])

  const recipeRowsByMenuId = useMemo(() => {
    const grouped = new Map()
    for (const row of menuIngredientRows) {
      const existing = grouped.get(row.menu_item_id) ?? []
      existing.push(row)
      grouped.set(row.menu_item_id, existing)
    }
    return grouped
  }, [menuIngredientRows])

  const activeRecipeEditRow = useMemo(() => {
    if (!recipeEditDialog) return null
    return menuIngredientRows.find((row) => row.menu_ingredient_id === recipeEditDialog.recipeRowId) ?? null
  }, [menuIngredientRows, recipeEditDialog])

  const activeRecipeEditMenuItem = useMemo(() => {
    if (!recipeEditDialog) return null
    return menuRows.find((row) => row.item_id === recipeEditDialog.menuItemId) ?? null
  }, [menuRows, recipeEditDialog])

  const menuCategoryOptions = useMemo(() => {
    const categories = new Set()
    const byId = new Map(categoryRows.map((row) => [row.category_id, row]))
    for (const row of categoryRows.filter((category) => category.is_active)) {
      const path = buildCategoryPath(row, byId)
      if (path) categories.add(path)
    }
    for (const category of MENU_CATEGORIES) categories.add(category)
    for (const row of [...menuRows, ...archivedMenuRows]) {
      if (row.category) categories.add(row.category)
    }
    if (customMenuCategory.trim()) categories.add(customMenuCategory.trim())
    return sortText([...categories])
  }, [archivedMenuRows, categoryRows, customMenuCategory, menuRows])

  const categoryRowsWithPath = useMemo(() => {
    const byId = new Map(categoryRows.map((row) => [row.category_id, row]))
    return categoryRows
      .filter((row) => row.is_active)
      .map((row) => ({ ...row, path: buildCategoryPath(row, byId) }))
      .filter((row) => row.path)
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [categoryRows])

  const activeEditIngredient = useMemo(() => {
    if (editRecordDialog?.type !== 'ingredient') return null
    return rows.find((row) => row.ingredient_id === editRecordDialog.id) ?? null
  }, [editRecordDialog, rows])

  const activeEditMenuItem = useMemo(() => {
    if (editRecordDialog?.type !== 'menu') return null
    return menuRows.find((row) => row.item_id === editRecordDialog.id) ?? null
  }, [editRecordDialog, menuRows])

  const refreshFromServer = useCallback(async () => {
    if (!supabase) return
    setFetchError(null)
    const { data, error } = await supabase.from('inventory').select('*').order('ingredient_id')
    if (error) {
      setFetchError(error.message)
      setRows([])
      setArchivedRows([])
      return
    }
    const nextRows = (data ?? []).map(normalizeInventoryRow)
    setRows(sortById(nextRows.filter((row) => row.is_active)))
    setArchivedRows(sortById(nextRows.filter((row) => !row.is_active)))
  }, [])

  const refreshMenuFromServer = useCallback(async () => {
    if (!supabase) return
    setFetchError(null)
    const { data, error } = await supabase.from('menu').select('*').order('item_id')
    if (error) {
      setFetchError(error.message)
      setMenuRows([])
      setArchivedMenuRows([])
      return
    }
    const nextMenuRows = (data ?? []).map(normalizeMenuRow)
    setMenuRows(
      sortMenuById(
        nextMenuRows.filter((row) => row.availability_status.toLowerCase() !== 'unavailable'),
      ),
    )
    setArchivedMenuRows(
      sortMenuById(nextMenuRows.filter((row) => row.availability_status.toLowerCase() === 'unavailable')),
    )
  }, [])

  const refreshMenuIngredientsFromServer = useCallback(async () => {
    if (!supabase) return
    setFetchError(null)
    const { data, error } = await supabase.from('menu_ingredients').select('*').order('menu_ingredient_id')
    if (error) {
      setFetchError(error.message)
      setMenuIngredientRows([])
      return
    }
    setMenuIngredientRows((data ?? []).map(normalizeMenuIngredientRow))
  }, [])

  const refreshCategoriesFromServer = useCallback(async () => {
    if (!supabase) return
    setFetchError(null)
    const { data, error } = await supabase.from('menu_categories').select('*').order('name')
    if (error) {
      setFetchError(error.message)
      setCategoryRows([])
      return
    }
    setCategoryRows((data ?? []).map(normalizeMenuCategoryRow))
  }, [])

  const handleNewIngredientChange = useCallback((field, value) => {
    setNewIngredient((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleNewMenuItemChange = useCallback((field, value) => {
    setNewMenuItem((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleNewCategoryChange = useCallback((field, value) => {
    setNewCategory((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleEditRecordInputChange = useCallback((field, value) => {
    setEditRecordInputs((prev) => ({ ...prev, [field]: value }))
  }, [])

  const openEditRecordDialog = useCallback((type, record) => {
    setActionError(null)
    setActionMessage(null)

    if (type === 'ingredient') {
      setEditRecordInputs({
        name: record.name,
        current_quantity: String(record.current_quantity),
        unit_of_measure: record.unit_of_measure === 'â€”' ? '' : record.unit_of_measure,
        low_stock: String(record.low_stock),
      })
      setEditRecordDialog({ type, id: record.ingredient_id })
      return
    }

    setEditRecordInputs({
      name: record.name,
      description: record.description,
      price: String(record.price),
      category: record.category,
      customCategory: '',
      size_label: record.size_label,
      availability_status: record.availability_status || 'available',
    })
    setEditRecordDialog({ type, id: record.item_id })
  }, [])

  const handleRecipeInputChange = useCallback((itemId, field, value) => {
    setRecipeInputs((prev) => ({
      ...prev,
      [itemId]: {
        ingredient_id: prev[itemId]?.ingredient_id ?? '',
        quantity_required: prev[itemId]?.quantity_required ?? '',
        [field]: value,
      },
    }))
  }, [])

  const handleRecipeEditInputChange = useCallback((recipeRowId, recipeRow, field, value) => {
    setRecipeEditInputs((prev) => ({
      ...prev,
      [recipeRowId]: {
        ingredient_id: prev[recipeRowId]?.ingredient_id ?? String(recipeRow.ingredient_id),
        quantity_required: prev[recipeRowId]?.quantity_required ?? String(recipeRow.quantity_required),
        [field]: value,
      },
    }))
  }, [])

  const openRecipeEditDialog = useCallback((recipeRow, menuItem) => {
    setActionError(null)
    setActionMessage(null)
    setRecipeEditInputs((prev) => ({
      ...prev,
      [recipeRow.menu_ingredient_id]: {
        ingredient_id: String(recipeRow.ingredient_id),
        quantity_required: String(recipeRow.quantity_required),
      },
    }))
    setRecipeEditDialog({
      recipeRowId: recipeRow.menu_ingredient_id,
      menuItemId: menuItem.item_id,
    })
  }, [])

  const openDeleteConfirm = useCallback((type, id, name) => {
    setActionError(null)
    setActionMessage(null)
    setDeleteConfirm({ type, id, name, input: '' })
  }, [])

  const openPermanentDeleteConfirm = useCallback((type, id, name) => {
    setActionError(null)
    setActionMessage(null)
    setPermanentDeleteConfirm({ type, id, name, input: '' })
  }, [])

  const handleDeleteConfirmInput = useCallback((value) => {
    setDeleteConfirm((prev) => (prev ? { ...prev, input: value } : prev))
  }, [])

  const handlePermanentDeleteConfirmInput = useCallback((value) => {
    setPermanentDeleteConfirm((prev) => (prev ? { ...prev, input: value } : prev))
  }, [])

  const handleSaveEditedRecord = useCallback(async () => {
    if (!supabase || !editRecordDialog) return

    setActionError(null)
    setActionMessage(null)
    setEditRecordBusy(true)

    if (editRecordDialog.type === 'ingredient') {
      const name = editRecordInputs.name?.trim() ?? ''
      const unit = editRecordInputs.unit_of_measure?.trim() ?? ''
      const quantity = parseNonNegativeAmount(editRecordInputs.current_quantity, 0)
      const lowStock = parseNonNegativeAmount(editRecordInputs.low_stock, 0)

      if (!name) {
        setActionError('Enter an ingredient name.')
        setEditRecordBusy(false)
        return
      }

      if (!unit) {
        setActionError('Enter a unit of measure.')
        setEditRecordBusy(false)
        return
      }

      if (Number.isNaN(quantity) || Number.isNaN(lowStock)) {
        setActionError('Quantity and low stock must be zero or higher.')
        setEditRecordBusy(false)
        return
      }

      const { data: updated, error } = await supabase
        .from('inventory')
        .update({
          name,
          current_quantity: quantity,
          unit_of_measure: unit,
          low_stock: lowStock,
        })
        .eq('ingredient_id', editRecordDialog.id)
        .select('*')
        .single()

      if (!error) {
        await supabase
          .from('menu_ingredients')
          .update({ unit_of_measure: unit })
          .eq('ingredient_id', editRecordDialog.id)
      }

      setEditRecordBusy(false)

      if (error || !updated) {
        setActionError(error?.message ?? 'Could not update ingredient.')
        return
      }

      const row = normalizeInventoryRow(updated)
      setRows((prev) => sortById(prev.map((item) => (item.ingredient_id === row.ingredient_id ? row : item))))
      setMenuIngredientRows((prev) =>
        prev.map((item) =>
          item.ingredient_id === row.ingredient_id
            ? { ...item, unit_of_measure: row.unit_of_measure }
            : item,
        ),
      )
      setEditRecordDialog(null)
      setActionMessage(`${row.name} updated.`)
      return
    }

    const name = editRecordInputs.name?.trim() ?? ''
    const description = editRecordInputs.description?.trim() ?? ''
    const price = Number(editRecordInputs.price)
    const category =
      editRecordInputs.category === '__custom__'
        ? editRecordInputs.customCategory?.trim() ?? ''
        : editRecordInputs.category?.trim() ?? ''
    const sizeLabel = editRecordInputs.size_label?.trim() ?? ''
    const availability = editRecordInputs.availability_status?.trim() || 'available'

    if (!name) {
      setActionError('Enter a menu item name.')
      setEditRecordBusy(false)
      return
    }

    if (!description) {
      setActionError('Enter a menu item description.')
      setEditRecordBusy(false)
      return
    }

    if (!Number.isFinite(price) || price <= 0) {
      setActionError('Enter a menu item price greater than zero.')
      setEditRecordBusy(false)
      return
    }

    if (!category) {
      setActionError('Choose or enter a menu category.')
      setEditRecordBusy(false)
      return
    }

    const { data: updated, error } = await supabase
      .from('menu')
      .update({
        name,
        description,
        price,
        category,
        size_label: sizeLabel || null,
        availability_status: availability,
      })
      .eq('item_id', editRecordDialog.id)
      .select('*')
      .single()

    setEditRecordBusy(false)

    if (error || !updated) {
      setActionError(error?.message ?? 'Could not update menu item.')
      return
    }

    const row = normalizeMenuRow(updated)
    if (row.availability_status.toLowerCase() === 'unavailable') {
      setMenuRows((prev) => prev.filter((item) => item.item_id !== row.item_id))
      setArchivedMenuRows((prev) =>
        sortMenuById([...prev.filter((item) => item.item_id !== row.item_id), row]),
      )
    } else {
      setMenuRows((prev) => sortMenuById(prev.map((item) => (item.item_id === row.item_id ? row : item))))
    }
    setEditRecordDialog(null)
    setActionMessage(`${row.name} updated.`)
  }, [editRecordDialog, editRecordInputs])

  const handleConfirmedDelete = useCallback(async () => {
    if (!supabase || !deleteConfirm || deleteConfirm.input.trim().toLowerCase() !== 'yes') return

    setDeleteBusy(true)
    setActionError(null)
    setActionMessage(null)

    const request =
      deleteConfirm.type === 'ingredient'
        ? supabase.from('inventory').update({ is_active: false }).eq('ingredient_id', deleteConfirm.id)
        : supabase.from('menu').update({ availability_status: 'unavailable' }).eq('item_id', deleteConfirm.id)

    const { error } = await request

    setDeleteBusy(false)

    if (error) {
      setActionError(error.message)
      return
    }

    if (deleteConfirm.type === 'ingredient') {
      setRows((prev) => {
        const archived = prev.find((row) => row.ingredient_id === deleteConfirm.id)
        if (archived) {
          setArchivedRows((existing) => sortById([...existing, { ...archived, is_active: false }]))
        }
        return prev.filter((row) => row.ingredient_id !== deleteConfirm.id)
      })
      setMenuIngredientRows((prev) => prev.filter((row) => row.ingredient_id !== deleteConfirm.id))
    } else {
      setMenuRows((prev) => {
        const archived = prev.find((row) => row.item_id === deleteConfirm.id)
        if (archived) {
          setArchivedMenuRows((existing) =>
            sortMenuById([...existing, { ...archived, availability_status: 'unavailable' }]),
          )
        }
        return prev.filter((row) => row.item_id !== deleteConfirm.id)
      })
      setMenuIngredientRows((prev) => prev.filter((row) => row.menu_item_id !== deleteConfirm.id))
    }

    setActionMessage(`${deleteConfirm.name} archived.`)
    setDeleteConfirm(null)
  }, [deleteConfirm])

  const handleConfirmedPermanentDelete = useCallback(async () => {
    if (
      !supabase ||
      !permanentDeleteConfirm ||
      permanentDeleteConfirm.input.trim() !== 'DELETE PERMANENTLY'
    ) {
      return
    }

    setPermanentDeleteBusy(true)
    setActionError(null)
    setActionMessage(null)

    const { error } = await supabase.rpc('permanent_delete_archived_item', {
      p_item_type: permanentDeleteConfirm.type,
      p_item_id: permanentDeleteConfirm.id,
      p_confirm: permanentDeleteConfirm.input.trim(),
    })

    setPermanentDeleteBusy(false)

    if (error) {
      setActionError(error.message)
      return
    }

    if (permanentDeleteConfirm.type === 'ingredient') {
      setArchivedRows((prev) => prev.filter((row) => row.ingredient_id !== permanentDeleteConfirm.id))
      setMenuIngredientRows((prev) => prev.filter((row) => row.ingredient_id !== permanentDeleteConfirm.id))
    } else {
      setArchivedMenuRows((prev) => prev.filter((row) => row.item_id !== permanentDeleteConfirm.id))
      setMenuIngredientRows((prev) => prev.filter((row) => row.menu_item_id !== permanentDeleteConfirm.id))
    }

    setActionMessage(`${permanentDeleteConfirm.name} permanently deleted.`)
    setPermanentDeleteConfirm(null)
  }, [permanentDeleteConfirm])

  const handleAddCategory = useCallback(async () => {
    if (!supabase) return

    const name = newCategory.name.trim()
    const parentId = newCategory.parent_category_id ? Number(newCategory.parent_category_id) : null

    setActionError(null)
    setActionMessage(null)

    if (!name) {
      setActionError('Enter a category name.')
      return
    }

    setAddingCategory(true)
    const { data: inserted, error } = await supabase
      .from('menu_categories')
      .insert({
        name,
        parent_category_id: parentId,
        is_active: true,
      })
      .select('*')
      .single()

    setAddingCategory(false)

    if (error || !inserted) {
      setActionError(error?.message ?? 'Could not add category.')
      return
    }

    const row = normalizeMenuCategoryRow(inserted)
    setCategoryRows((prev) => [...prev.filter((item) => item.category_id !== row.category_id), row])
    setNewCategory({ name: '', parent_category_id: '' })
    setActionMessage(`${name} category added.`)
  }, [newCategory])

  const handleDeleteCategory = useCallback(
    async (category) => {
      if (!supabase) return

      const childCount = categoryRows.filter(
        (row) => row.is_active && row.parent_category_id === category.category_id,
      ).length
      const inUse = [...menuRows, ...archivedMenuRows].some((row) => row.category === category.path)

      setActionError(null)
      setActionMessage(null)

      if (childCount > 0) {
        setActionError('Delete or move child categories before deleting this category.')
        return
      }

      if (inUse) {
        setActionError('This category is still used by a menu item. Edit those menu items first.')
        return
      }

      const { data: updated, error } = await supabase
        .from('menu_categories')
        .update({ is_active: false })
        .eq('category_id', category.category_id)
        .select('*')
        .single()

      if (error || !updated) {
        setActionError(error?.message ?? 'Could not delete category.')
        return
      }

      const row = normalizeMenuCategoryRow(updated)
      setCategoryRows((prev) => prev.map((item) => (item.category_id === row.category_id ? row : item)))
      setActionMessage(`${category.path} category deleted.`)
    },
    [archivedMenuRows, categoryRows, menuRows],
  )

  const handleAddRecipeIngredient = useCallback(
    async (menuItem) => {
      if (!supabase) return

      const input = recipeInputs[menuItem.item_id] ?? {}
      const ingredientId = Number(input.ingredient_id)
      const quantityRequired = Number(input.quantity_required)
      const ingredient = rows.find((row) => row.ingredient_id === ingredientId)

      setActionError(null)
      setActionMessage(null)

      if (!ingredient) {
        setActionError('Choose an ingredient for this menu item.')
        return
      }

      if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
        setActionError('Enter a recipe quantity greater than zero.')
        return
      }

      setBusyRecipeItemId(menuItem.item_id)

      const { data: inserted, error } = await supabase
        .from('menu_ingredients')
        .insert({
          menu_item_id: menuItem.item_id,
          ingredient_id: ingredient.ingredient_id,
          quantity_required: quantityRequired,
          unit_of_measure: ingredient.unit_of_measure,
        })
        .select('*')
        .single()

      setBusyRecipeItemId(null)

      if (error || !inserted) {
        setActionError(error?.message ?? 'Could not add recipe ingredient.')
        return
      }

      const row = normalizeMenuIngredientRow(inserted)
      setMenuIngredientRows((prev) => [
        ...prev.filter((item) => item.menu_ingredient_id !== row.menu_ingredient_id),
        row,
      ])
      setRecipeInputs((prev) => ({
        ...prev,
        [menuItem.item_id]: { ingredient_id: '', quantity_required: '' },
      }))
      setActionMessage(`${ingredient.name} linked to ${menuItem.name}.`)
    },
    [recipeInputs, rows],
  )

  const handleUpdateRecipeIngredient = useCallback(
    async (recipeRow, menuItem) => {
      if (!supabase) return

      const input = recipeEditInputs[recipeRow.menu_ingredient_id] ?? {
        ingredient_id: String(recipeRow.ingredient_id),
        quantity_required: String(recipeRow.quantity_required),
      }
      const ingredientId = Number(input.ingredient_id)
      const quantityRequired = Number(input.quantity_required)
      const ingredient = rows.find((row) => row.ingredient_id === ingredientId)

      setActionError(null)
      setActionMessage(null)

      if (!ingredient) {
        setActionError('Choose an ingredient for this recipe row.')
        return
      }

      if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
        setActionError('Enter a recipe quantity greater than zero.')
        return
      }

      setBusyRecipeRowId(recipeRow.menu_ingredient_id)

      const { data: updated, error } = await supabase
        .from('menu_ingredients')
        .update({
          ingredient_id: ingredient.ingredient_id,
          quantity_required: quantityRequired,
          unit_of_measure: ingredient.unit_of_measure,
        })
        .eq('menu_ingredient_id', recipeRow.menu_ingredient_id)
        .select('*')
        .single()

      setBusyRecipeRowId(null)

      if (error || !updated) {
        setActionError(error?.message ?? 'Could not update recipe ingredient.')
        return
      }

      const row = normalizeMenuIngredientRow(updated)
      setMenuIngredientRows((prev) =>
        prev.map((item) => (item.menu_ingredient_id === row.menu_ingredient_id ? row : item)),
      )
      setRecipeEditInputs((prev) => {
        const next = { ...prev }
        delete next[row.menu_ingredient_id]
        return next
      })
      setRecipeEditDialog(null)
      setActionMessage(`${menuItem.name} recipe updated.`)
    },
    [recipeEditInputs, rows],
  )

  const handleRemoveRecipeIngredient = useCallback(async (recipeRow, menuItem) => {
    if (!supabase) return

    const recipeCount = menuIngredientRows.filter((row) => row.menu_item_id === recipeRow.menu_item_id).length
    if (recipeCount <= 1) {
      setActionMessage(null)
      setActionError('A menu item needs at least one recipe ingredient before it can be ordered.')
      return
    }

    setActionError(null)
    setActionMessage(null)
    setBusyRecipeRowId(recipeRow.menu_ingredient_id)

    const { error } = await supabase
      .from('menu_ingredients')
      .delete()
      .eq('menu_ingredient_id', recipeRow.menu_ingredient_id)

    setBusyRecipeRowId(null)

    if (error) {
      setActionError(error.message)
      return
    }

    setMenuIngredientRows((prev) =>
      prev.filter((item) => item.menu_ingredient_id !== recipeRow.menu_ingredient_id),
    )
    setRecipeEditInputs((prev) => {
      const next = { ...prev }
      delete next[recipeRow.menu_ingredient_id]
      return next
    })
    setRecipeEditDialog(null)
    setActionMessage(`Ingredient removed from ${menuItem.name}.`)
  }, [menuIngredientRows])

  const handleAddIngredient = useCallback(async () => {
    if (!supabase) return

    const name = newIngredient.name.trim()
    const unit = newIngredient.unit_of_measure.trim()
    const quantity = parseNonNegativeAmount(newIngredient.current_quantity, 0)
    const lowStock = parseNonNegativeAmount(newIngredient.low_stock, 0)
    const totalCost = parseOptionalCost(newIngredient.total_cost)

    setActionError(null)
    setActionMessage(null)

    if (!name) {
      setActionError('Enter an ingredient name.')
      return
    }

    if (!unit) {
      setActionError('Enter a unit of measure.')
      return
    }

    if (Number.isNaN(quantity) || Number.isNaN(lowStock)) {
      setActionError('Quantity and low stock must be zero or higher.')
      return
    }

    if (Number.isNaN(totalCost)) {
      setActionError('Cost must be zero or higher, or left blank.')
      return
    }

    setAddingIngredient(true)

    const { data: inserted, error: insertErr } = await supabase
      .from('inventory')
      .insert({
        name,
        current_quantity: quantity,
        unit_of_measure: unit,
        low_stock: lowStock,
      })
      .select('*')
      .single()

    if (insertErr || !inserted) {
      setActionError(insertErr?.message ?? 'Could not add ingredient.')
      setAddingIngredient(false)
      return
    }

    const row = normalizeInventoryRow(inserted)
    setRows((prev) => sortById([...prev.filter((item) => item.ingredient_id !== row.ingredient_id), row]))

    let followUpError = null

    if (quantity > 0) {
      followUpError = await insertInventoryTransactionRow(supabase, {
        ingredient_id: row.ingredient_id,
        actualDelta: quantity,
        transaction_type: 'stock_in',
        reason: 'Initial ingredient entry',
      })
    }

    if (!followUpError && totalCost > 0) {
      followUpError = await insertExpenseRow(supabase, {
        ingredientName: name,
        amount: totalCost,
        cashier_id: TX_CASHIER_ID,
      })
    }

    if (followUpError) {
      setActionError(
        `Ingredient added, but extra logging failed: ${followUpError.message}. Check INSERT permissions for inventory_transactions/expenses and VITE_TX_CASHIER_ID.`,
      )
    } else {
      setActionMessage(`${name} added to inventory.`)
      setNewIngredient(emptyNewIngredient)
    }

    await refreshFromServer()
    setAddingIngredient(false)
  }, [newIngredient, refreshFromServer])

  const handleAddMenuItem = useCallback(async () => {
    if (!supabase) return

    const name = newMenuItem.name.trim()
    const description = newMenuItem.description.trim()
    const price = Number(newMenuItem.price)
    const category =
      newMenuItem.category === '__custom__'
        ? customMenuCategory.trim()
        : newMenuItem.category.trim()
    const sizeLabel = newMenuItem.size_label.trim()
    const availability = newMenuItem.availability_status.trim()

    setActionError(null)
    setActionMessage(null)

    if (!name) {
      setActionError('Enter a menu item name.')
      return
    }

    if (!description) {
      setActionError('Enter a menu item description.')
      return
    }

    if (!Number.isFinite(price) || price <= 0) {
      setActionError('Enter a menu item price greater than zero.')
      return
    }

    if (!category || !availability) {
      setActionError('Choose a category and availability status.')
      return
    }

    setAddingMenuItem(true)

    const { data: inserted, error } = await supabase
      .from('menu')
      .insert({
        name,
        description,
        price,
        category,
        size_label: sizeLabel || null,
        availability_status: availability,
        inventory_ingredient_id: null,
      })
      .select('*')
      .single()

    if (error) {
      setActionError(error.message)
    } else {
      if (inserted) {
        const row = normalizeMenuRow(inserted)
        setMenuRows((prev) => sortMenuById([...prev.filter((item) => item.item_id !== row.item_id), row]))
      }
      setActionMessage(`${name} added to menu.`)
      setNewMenuItem(emptyNewMenuItem)
      setCustomMenuCategory('')
    }

    setAddingMenuItem(false)
  }, [customMenuCategory, newMenuItem])

  /** Stock In / Out: update `inventory`, then insert `inventory_transactions` (see ERD: quantity_change). */
  const applyStockMovement = useCallback(
    async (row, mode) => {
      if (!supabase) return
      const amount = parsePositiveAmount(qtyInputs[row.ingredient_id])
      if (Number.isNaN(amount)) {
        setActionMessage(null)
        setActionError('Enter a positive number for quantity.')
        return
      }

      const stockInCost = mode === 'in' ? parseOptionalCost(costInputs[row.ingredient_id]) : 0
      if (Number.isNaN(stockInCost)) {
        setActionMessage(null)
        setActionError('Enter a valid cost amount, or leave it blank.')
        return
      }

      const signedDelta = mode === 'in' ? amount : -amount
      setActionError(null)
      setActionMessage(null)
      setBusyIngredientId(row.ingredient_id)

      const { data: fresh, error: readErr } = await supabase
        .from('inventory')
        .select('current_quantity')
        .eq('ingredient_id', row.ingredient_id)
        .single()

      if (readErr || fresh == null) {
        setActionError(readErr?.message ?? 'Could not read current quantity.')
        setBusyIngredientId(null)
        return
      }

      const current = Number(fresh.current_quantity)
      const newQty = current + signedDelta
      const actualDelta = newQty - current

      const { error: upErr } = await supabase
        .from('inventory')
        .update({ current_quantity: newQty })
        .eq('ingredient_id', row.ingredient_id)

      if (upErr) {
        setActionError(upErr.message)
        setBusyIngredientId(null)
        return
      }

      // Reflect quantity change immediately in UI (realtime events can lag/miss).
      setRows((prev) =>
        sortById(
          prev.map((r) =>
            r.ingredient_id === row.ingredient_id
              ? { ...r, current_quantity: newQty }
              : r,
          ),
        ),
      )

      const txErr = await insertInventoryTransactionRow(supabase, {
        ingredient_id: row.ingredient_id,
        actualDelta,
        transaction_type: mode === 'in' ? 'stock_in' : 'stock_out',
        reason: 'Admin inventory adjustment',
      })

      if (txErr) {
        setActionError(
          `Quantity saved, but audit log insert failed: ${txErr.message}. Check RLS INSERT and ensure VITE_TX_REFERENCE_ID / VITE_TX_CASHIER_ID point to valid IDs for your schema.`,
        )
        await refreshFromServer()
      } else {
        let expenseErr = null
        if (mode === 'in' && stockInCost > 0) {
          expenseErr = await insertExpenseRow(supabase, {
            ingredientName: row.name,
            amount: stockInCost,
            cashier_id: TX_CASHIER_ID,
          })
        }

        if (expenseErr) {
          setActionError(
            `Quantity saved, but expense insert failed: ${expenseErr.message}. Check RLS INSERT on expenses and ensure VITE_TX_CASHIER_ID points to a valid cashier_id.`,
          )
        } else {
          setActionError(null)
          setActionMessage(`${row.name} inventory updated.`)
          if (mode === 'in') {
            setCostInputs((prev) => ({ ...prev, [row.ingredient_id]: '' }))
          }
        }

        // Keep local state in sync even when realtime isn't delivering updates.
        void refreshFromServer()
      }

      setBusyIngredientId(null)
    },
    [costInputs, qtyInputs, refreshFromServer],
  )

  useEffect(() => {
    if (!configured || !supabase) return

    let cancelled = false

    void (async () => {
      setLoading(true)
      setFetchError(null)
      try {
        const [inventoryResult, menuResult, menuIngredientsResult, categoriesResult] = await Promise.all([
          supabase.from('inventory').select('*').order('ingredient_id'),
          supabase.from('menu').select('*').order('item_id'),
          supabase.from('menu_ingredients').select('*').order('menu_ingredient_id'),
          supabase.from('menu_categories').select('*').order('name'),
        ])
        if (cancelled) return

        if (inventoryResult.error || menuResult.error || menuIngredientsResult.error || categoriesResult.error) {
          setFetchError(
            inventoryResult.error?.message ??
              menuResult.error?.message ??
              menuIngredientsResult.error?.message ??
              categoriesResult.error?.message ??
              'Could not load dashboard data.',
          )
          setRows([])
          setMenuRows([])
          setArchivedRows([])
          setArchivedMenuRows([])
          setMenuIngredientRows([])
          setCategoryRows([])
        } else {
          const nextInventoryRows = (inventoryResult.data ?? []).map(normalizeInventoryRow)
          const nextMenuRows = (menuResult.data ?? []).map(normalizeMenuRow)
          setRows(sortById(nextInventoryRows.filter((row) => row.is_active)))
          setArchivedRows(sortById(nextInventoryRows.filter((row) => !row.is_active)))
          setMenuRows(
            sortMenuById(
              nextMenuRows.filter((row) => row.availability_status.toLowerCase() !== 'unavailable'),
            ),
          )
          setArchivedMenuRows(
            sortMenuById(nextMenuRows.filter((row) => row.availability_status.toLowerCase() === 'unavailable')),
          )
          setMenuIngredientRows((menuIngredientsResult.data ?? []).map(normalizeMenuIngredientRow))
          setCategoryRows((categoriesResult.data ?? []).map(normalizeMenuCategoryRow))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const channel = supabase
      .channel('inventory-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        (payload) => {
          setRows((prev) => mergeRealtimeRows(prev, payload))
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('subscribed')
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeStatus('error')
          if (err) console.error('Realtime:', err)
        }
      })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
      setRealtimeStatus('idle')
    }
  }, [configured])

  return (
    <main className="max-w-7xl mx-auto px-4 py-8 sm:py-10">
      <p className="text-center text-[10px] uppercase tracking-widest text-gray-500 mb-2">
        Live data — updates <code className="text-[9px] bg-gray-100 px-1 rounded">inventory</code>, logs{' '}
        <code className="text-[9px] bg-gray-100 px-1 rounded">inventory_transactions</code> (Realtime on inventory)
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-700">
          Admin Dashboard Inventory
        </h2>
        {configured && (
          <span
            className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
              realtimeStatus === 'subscribed'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                : realtimeStatus === 'error'
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-gray-300 bg-gray-50 text-gray-600'
            }`}
            title="postgres_changes on public.inventory"
          >
            {realtimeStatus === 'subscribed'
              ? 'Realtime on'
              : realtimeStatus === 'error'
                ? 'Realtime error'
                : 'Connecting…'}
          </span>
        )}
      </div>

      {!configured && (
        <p className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
          {missingEnvMessage} Use the <strong>anon</strong> public key only (never <code className="text-xs bg-white px-1 rounded">service_role</code> in the
          browser). Restart <code className="text-xs bg-white px-1 rounded">npm run dev</code> after changing{' '}
          <code className="text-xs bg-white px-1 rounded">.env</code> at the repo root.
        </p>
      )}

      {actionError && configured && (
        <div
          className="text-center text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {actionMessage && configured && (
        <div
          className="text-center text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-6"
          role="status"
        >
          {actionMessage}
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
                      placeholder="New category"
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

            <div className="mt-6 flex justify-end gap-3">
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
                disabled={editRecordBusy || !configured}
                className="rounded-full bg-[#3B2F2A] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {editRecordBusy ? 'Saving...' : 'Save'}
              </button>
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

      {fetchError && configured && (
        <div className="text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6 space-y-2">
          <p>{fetchError}</p>
          <p className="text-xs text-gray-600">
            Ensure RLS allows <code className="bg-white px-1 rounded">SELECT</code> on <code className="bg-white px-1 rounded">inventory</code>, plus{' '}
            <code className="bg-white px-1 rounded">UPDATE</code> on inventory and <code className="bg-white px-1 rounded">INSERT</code> on{' '}
            <code className="bg-white px-1 rounded">inventory_transactions</code> for Stock In/Out.
          </p>
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              Promise.all([
                refreshFromServer(),
                refreshMenuFromServer(),
                refreshMenuIngredientsFromServer(),
                refreshCategoriesFromServer(),
              ]).finally(() => setLoading(false))
            }}
            className="text-xs font-bold underline text-[#D98C5F]"
          >
            Retry fetch
          </button>
        </div>
      )}

      {realtimeStatus === 'error' && configured && !fetchError && (
        <p className="text-center text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
          Realtime failed to subscribe. In Supabase: Database → Publications → enable{' '}
          <code className="bg-white px-1 rounded">supabase_realtime</code> for table{' '}
          <code className="bg-white px-1 rounded">inventory</code>, or enable Replication on that table.
        </p>
      )}

      {loading && !(configured && rows.length === 0 && !fetchError) && (
        <p className="text-center text-gray-500 text-sm mb-6" aria-live="polite">
          Loading inventory…
        </p>
      )}

      <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Add Record</h3>
            <p className="text-xs text-gray-500">
              Ingredients go to inventory. Menu items go to menu.
            </p>
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
          <div className="grid gap-3 md:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_auto]">
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
          <div className="grid gap-3 md:grid-cols-[1.2fr_1.5fr_0.7fr_0.7fr_1fr_0.8fr_auto]">
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
                  placeholder="New category"
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                  disabled={addingMenuItem || !configured}
                />
              )}
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
              disabled={addingMenuItem || !configured}
              className="self-end rounded-full bg-[#D98C5F] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingMenuItem ? 'Adding...' : 'Add Menu'}
            </button>
          </div>
        )}
      </section>

      {addMode === 'menu' && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Menu Categories</h3>
              <p className="text-xs text-gray-500">
                Add a parent category, or choose a parent to create a category inside it.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Category name
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => handleNewCategoryChange('name', e.target.value)}
                placeholder="Coffee"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal"
                disabled={addingCategory || !configured}
              />
            </label>

            <label className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Parent category
              <select
                value={newCategory.parent_category_id}
                onChange={(e) => handleNewCategoryChange('parent_category_id', e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-normal"
                disabled={addingCategory || !configured}
              >
                <option value="">No parent</option>
                {categoryRowsWithPath.map((category) => (
                  <option key={category.category_id} value={category.category_id}>
                    {category.path}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleAddCategory}
              disabled={addingCategory || !configured}
              className="self-end rounded-full bg-[#3B2F2A] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {addingCategory ? 'Adding...' : 'Add Category'}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {categoryRowsWithPath.length === 0 ? (
              <p className="text-sm text-gray-500">No saved categories yet.</p>
            ) : (
              categoryRowsWithPath.map((category) => {
                const childCount = categoryRows.filter(
                  (row) => row.is_active && row.parent_category_id === category.category_id,
                ).length
                const inUse = [...menuRows, ...archivedMenuRows].some((row) => row.category === category.path)
                return (
                  <span
                    key={category.category_id}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-gray-700"
                  >
                    {category.path}
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      disabled={childCount > 0 || inUse || !configured}
                      title={
                        childCount > 0
                          ? 'Delete child categories first.'
                          : inUse
                            ? 'Edit menu items using this category first.'
                            : 'Delete category'
                      }
                      className="font-bold text-red-600 disabled:cursor-not-allowed disabled:text-gray-300"
                    >
                      Delete
                    </button>
                  </span>
                )
              })
            )}
          </div>
        </section>
      )}

      {addMode === 'archived' && (
        <section className="mb-12 space-y-8" aria-label="Archived records">
          <div>
            <h3 className="text-sm font-bold text-gray-600 mb-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1">
              Archived Ingredients
              <span className="font-normal text-gray-400 normal-case">
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
                  <article
                    key={row.ingredient_id}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
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

                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                      <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">ingredient_id</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{row.ingredient_id}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">low_stock</p>
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
            <h3 className="text-sm font-bold text-gray-600 mb-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1">
              Archived Menu Items
              <span className="font-normal text-gray-400 normal-case">
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
                  <article
                    key={item.item_id}
                    className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">{item.name}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {[item.category, item.size_label].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold uppercase text-red-700">
                        Archived
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-gray-600">{item.description}</p>

                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                      <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">item_id</p>
                        <p className="mt-1 text-lg font-bold text-gray-900">{item.item_id}</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">price</p>
                        <p className="mt-1 text-lg font-bold text-[#D98C5F]">
                          â‚±{item.price.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openPermanentDeleteConfirm('menu', item.item_id, item.name)}
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
        </section>
      )}

      {loading && configured && addMode === 'ingredient' && rows.length === 0 && !fetchError && (
        <section className="mb-12" aria-busy="true" aria-label="Loading ingredient cards">
          <h3 className="text-sm font-bold text-gray-600 mb-2 inline-flex flex-wrap items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1">
            Inventory
            <span className="font-normal text-gray-400 normal-case">{INVENTORY_CARD_SLOTS} slots</span>
          </h3>
          <p className="text-xs text-gray-500 mb-4">Fetching rows — placeholder boxes match your current four ingredient_ids.</p>
          <div className={inventoryCardGridClass}>
            {Array.from({ length: INVENTORY_CARD_SLOTS }, (_, i) => (
              <div
                key={`skeleton-${i}`}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse flex flex-col gap-4"
              >
                <div className="aspect-[5/4] rounded-xl bg-stone-200" />
                <div className="h-5 bg-stone-200 rounded w-4/5 mx-auto" />
                <div className="grid grid-cols-3 gap-2">
                  <div className="h-[4.25rem] rounded-lg bg-stone-100 border border-stone-200" />
                  <div className="h-[4.25rem] rounded-lg bg-stone-100 border border-stone-200" />
                  <div className="h-[4.25rem] rounded-lg bg-stone-100 border border-stone-200" />
                </div>
                <div className="h-2 rounded-full bg-stone-200" />
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div className="h-9 rounded-lg bg-stone-200" />
                  <div className="flex gap-2">
                    <div className="h-9 flex-1 rounded-full bg-stone-200" />
                    <div className="h-9 flex-1 rounded-full bg-stone-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && configured && addMode === 'ingredient' && rows.length === 0 && !fetchError && (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white/80 px-6 py-10 text-center text-gray-600 mb-8">
          <p className="font-semibold text-gray-800 mb-2">No ingredient rows returned</p>
          <p className="text-sm max-w-md mx-auto">
            Supabase returned an empty list. Add rows in the <code className="text-xs bg-gray-100 px-1 rounded">inventory</code> table or check Row Level Security allows{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">SELECT</code> for your anon key.
          </p>
        </div>
      )}

      {addMode === 'ingredient' && rows.length > 0 && (
        <section className="mb-12" aria-label="Ingredient cards">
          <h3 className="text-sm font-bold text-gray-600 mb-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1">
            Inventory
            <span className="font-normal text-gray-400 normal-case">
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
                  className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col gap-4 min-h-[280px]"
                >
                  <div
                    className="relative aspect-[5/4] min-h-[11rem] rounded-xl bg-gradient-to-b from-[#EDE8E0] to-[#DDD5CA] ring-2 ring-dashed ring-[#C4B8A8] shadow-inner overflow-hidden"
                    aria-label={`Image placeholder for ingredient ${row.ingredient_id}`}
                  >
                    <span className="absolute top-2 left-2 font-mono text-[10px] font-semibold text-stone-600 bg-white/90 px-1.5 py-0.5 rounded border border-stone-200">
                      ingredient_id: {row.ingredient_id}
                    </span>
                    {(low || negative) && (
                      <span
                        className={`absolute top-2 right-2 w-4 h-4 rounded-full ring-2 ring-white ${negative ? 'bg-purple-600' : 'bg-red-500'}`}
                        title={negative ? 'Negative on-hand quantity' : 'current_quantity ≤ low_stock'}
                        aria-label={negative ? 'Negative quantity' : 'Low stock'}
                      />
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pt-8 px-4 text-center">
                      <svg
                        className="w-14 h-14 text-stone-400"
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
                      <span className="text-[10px] text-stone-500 leading-tight">
                        Slot for image URL / upload
                        <br />
                        ({row.name})
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="font-bold text-gray-900 leading-tight text-base">{row.name}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => openEditRecordDialog('ingredient', row)}
                        className="text-xs font-bold text-[#D98C5F] underline hover:opacity-80"
                      >
                        Edit ingredient
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteConfirm('ingredient', row.ingredient_id, row.name)}
                        className="text-xs font-bold text-red-600 underline hover:text-red-700"
                      >
                        Archive ingredient
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-2 py-2 text-center shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 leading-tight">
                        current_quantity
                      </p>
                      <p
                        className={`mt-1 text-xl font-bold tabular-nums ${negative ? 'text-red-700' : 'text-gray-900'}`}
                      >
                        {row.current_quantity}
                      </p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{unitDisplay}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-2 py-2 text-center shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 leading-tight">
                        unit_of_measure
                      </p>
                      <p className="mt-1 text-xl font-bold text-gray-900 tracking-tight">{unitDisplay}</p>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-2 py-2 text-center shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 leading-tight">
                        low_stock
                      </p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{row.low_stock}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">threshold</p>
                    </div>
                  </div>

                  {negative && (
                    <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                      Quantity is below zero — use Stock In to correct.
                    </p>
                  )}

                  <div>
                    <div className="h-2 rounded-full bg-amber-900/25 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${low ? 'bg-amber-800' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Level bar when current_quantity &gt; 0
                    </p>
                  </div>

                  <div className="mt-auto flex flex-col gap-2 border-t border-gray-100 pt-3">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                      Quantity
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="1"
                        value={qtyInputs[row.ingredient_id] ?? ''}
                        onChange={(e) =>
                          setQtyInputs((prev) => ({ ...prev, [row.ingredient_id]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-normal"
                        disabled={busyIngredientId === row.ingredient_id}
                      />
                    </label>
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                      Stock In Cost
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Optional total cost"
                        value={costInputs[row.ingredient_id] ?? ''}
                        onChange={(e) =>
                          setCostInputs((prev) => ({ ...prev, [row.ingredient_id]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-normal"
                        disabled={busyIngredientId === row.ingredient_id}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyIngredientId === row.ingredient_id || !configured}
                        onClick={() => applyStockMovement(row, 'in')}
                        className="flex-1 rounded-full bg-emerald-600 text-white py-2 text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busyIngredientId === row.ingredient_id ? '…' : 'Stock In'}
                      </button>
                      <button
                        type="button"
                        disabled={busyIngredientId === row.ingredient_id || !configured}
                        onClick={() => applyStockMovement(row, 'out')}
                        className="flex-1 rounded-full bg-amber-800 text-white py-2 text-xs font-bold hover:bg-amber-900 disabled:opacity-50"
                      >
                        {busyIngredientId === row.ingredient_id ? '…' : 'Stock Out'}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {!loading && configured && addMode === 'menu' && menuRows.length === 0 && !fetchError && (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white/80 px-6 py-10 text-center text-gray-600 mb-8">
          <p className="font-semibold text-gray-800 mb-2">No menu items returned</p>
          <p className="text-sm max-w-md mx-auto">
            Add sellable products in the Menu Item tab, or check Row Level Security allows{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">SELECT</code> on{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">menu</code>.
          </p>
        </div>
      )}

      {addMode === 'menu' && menuRows.length > 0 && (
        <section className="mb-12" aria-label="Menu item cards">
          <h3 className="text-sm font-bold text-gray-600 mb-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1">
            Menu Items
            <span className="font-normal text-gray-400 normal-case">
              {menuRows.length} item{menuRows.length !== 1 ? 's' : ''}
            </span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {menuRows.map((item) => {
              const available = item.availability_status.toLowerCase() === 'available'

              return (
                <article
                  key={item.item_id}
                  className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 leading-tight">{item.name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {[item.category, item.size_label].filter(Boolean).join(' • ')}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => openEditRecordDialog('menu', item)}
                          className="text-xs font-bold text-[#D98C5F] underline hover:opacity-80"
                        >
                          Edit menu item
                        </button>
                        <button
                          type="button"
                          onClick={() => openDeleteConfirm('menu', item.item_id, item.name)}
                          className="text-xs font-bold text-red-600 underline hover:text-red-700"
                        >
                          Archive menu item
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

                  <p className="text-sm text-gray-600 min-h-10">{item.description}</p>

                  <div className="mt-auto grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
                    <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                        item_id
                      </p>
                      <p className="mt-1 text-lg font-bold text-gray-900">{item.item_id}</p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-[#FAF8F5] px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                        price
                      </p>
                      <p className="mt-1 text-lg font-bold text-[#D98C5F]">
                        ₱{item.price.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Recipe Ingredients
                    </p>

                    {(recipeRowsByMenuId.get(item.item_id) ?? []).length === 0 ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        No ingredients linked yet. Orders need at least one recipe ingredient to deduct stock.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {(recipeRowsByMenuId.get(item.item_id) ?? []).map((recipeRow) => {
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

                    <div className="grid gap-2 sm:grid-cols-[1fr_0.7fr_auto]">
                      <select
                        value={recipeInputs[item.item_id]?.ingredient_id ?? ''}
                        onChange={(e) => handleRecipeInputChange(item.item_id, 'ingredient_id', e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-2 text-xs"
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
                        className="rounded-lg border border-gray-300 px-2 py-2 text-xs"
                        disabled={busyRecipeItemId === item.item_id || !configured}
                      />

                      <button
                        type="button"
                        onClick={() => handleAddRecipeIngredient(item)}
                        disabled={busyRecipeItemId === item.item_id || !configured || rows.length === 0}
                        className="rounded-full bg-[#3B2F2A] px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
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
      )}
    </main>
  )
}
