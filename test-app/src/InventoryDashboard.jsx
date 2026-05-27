import { useCallback, useEffect, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'
import AddRecordPanel from './inventory/AddRecordPanel.jsx'
import ArchivedInventorySection from './inventory/ArchivedInventorySection.jsx'
import IngredientInventorySection from './inventory/IngredientInventorySection.jsx'
import InventoryModals from './inventory/InventoryModals.jsx'
import MenuItemsSection from './inventory/MenuItemsSection.jsx'
import { insertExpenseRow, insertInventoryTransactionRow } from './inventory/supabaseInventoryApi.js'
import {
  mergeRealtimeRows,
  normalizeInventoryRow,
  normalizeMenuIngredientRow,
  normalizeMenuRow,
  parseNonNegativeAmount,
  parseOptionalCost,
  parsePositiveAmount,
  safeIntegerEnv,
  sortById,
  sortMenuById,
} from './inventory/inventoryUtils.js'
import { useInventoryDashboardData } from './inventory/useInventoryDashboardData.js'

/** @typedef {{ ingredient_id: number, name: string, current_quantity: number, unit_of_measure: string, low_stock: number, is_active: boolean }} InventoryRow */
/** @typedef {{ item_id: number, name: string, description: string, price: number, category: string, size_label: string, availability_status: string }} MenuRow */
/** @typedef {{ menu_ingredient_id: number, menu_item_id: number, ingredient_id: number, quantity_required: number, unit_of_measure: string }} MenuIngredientRow */
/** @typedef {{ category_id: number, name: string, parent_category_id: number | null, is_active: boolean }} MenuCategoryRow */

const emptyNewIngredient = {
  name: '',
  current_quantity: '',
  unit_of_measure: '',
  low_stock: '',
  total_cost: '',
}

const TX_REFERENCE_ID = safeIntegerEnv(import.meta.env.VITE_TX_REFERENCE_ID, 1)
const TX_CASHIER_ID = safeIntegerEnv(import.meta.env.VITE_TX_CASHIER_ID, 1)

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
  const [missingRecipeDialog, setMissingRecipeDialog] = useState(
    /** @type {{ item_id: number, name: string } | null} */ (null),
  )
  const [busyIngredientId, setBusyIngredientId] = useState(/** @type {number | null} */ (null))
  const [stockMovementDialog, setStockMovementDialog] = useState(
    /** @type {{ ingredient_id: number, mode: 'in' | 'out' } | null} */ (null),
  )
  const [addingIngredient, setAddingIngredient] = useState(false)
  const [addingMenuItem, setAddingMenuItem] = useState(false)
  const [busyRecipeItemId, setBusyRecipeItemId] = useState(/** @type {number | null} */ (null))
  const [busyRecipeRowId, setBusyRecipeRowId] = useState(/** @type {number | null} */ (null))
  const [busyAvailabilityItemId, setBusyAvailabilityItemId] = useState(/** @type {number | null} */ (null))
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

  const {
    ingredientById,
    recipeRowsByMenuId,
    activeRecipeEditRow,
    activeRecipeEditMenuItem,
    activeStockIngredient,
    menuCategoryOptions,
    activeEditIngredient,
    activeEditMenuItem,
    menuCatalogueGroups,
  } = useInventoryDashboardData({
    rows,
    menuRows,
    menuIngredientRows,
    recipeEditDialog,
    stockMovementDialog,
    editRecordDialog,
    customMenuCategory,
  })
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


  const handleNewIngredientChange = useCallback((field, value) => {
    setNewIngredient((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleNewMenuItemChange = useCallback((field, value) => {
    setNewMenuItem((prev) => ({ ...prev, [field]: value }))
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

  const openStockMovementDialog = useCallback((row, mode) => {
    setActionError(null)
    setActionMessage(null)
    setQtyInputs((prev) => ({
      ...prev,
      [row.ingredient_id]: prev[row.ingredient_id] ?? '',
    }))
    if (mode === 'in') {
      setCostInputs((prev) => ({
        ...prev,
        [row.ingredient_id]: prev[row.ingredient_id] ?? '',
      }))
    }
    setStockMovementDialog({ ingredient_id: row.ingredient_id, mode })
  }, [])

  const scrollToMenuCatalogueTarget = useCallback((id) => {
    const target = document.getElementById(id)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  const handleSetMenuAvailability = useCallback(async (item, nextStatus) => {
    if (!supabase || !item?.item_id) return

    setActionError(null)
    setActionMessage(null)
    setBusyAvailabilityItemId(item.item_id)

    const { data: updated, error } = await supabase
      .from('menu')
      .update({ availability_status: nextStatus })
      .eq('item_id', item.item_id)
      .select('*')
      .single()

    setBusyAvailabilityItemId(null)

    if (error || !updated) {
      setActionError(error?.message ?? 'Could not update menu availability.')
      return
    }

    const row = normalizeMenuRow(updated)
    if (row.availability_status.toLowerCase() === 'available') {
      setArchivedMenuRows((prev) => prev.filter((menuItem) => menuItem.item_id !== row.item_id))
      setMenuRows((prev) =>
        sortMenuById([...prev.filter((menuItem) => menuItem.item_id !== row.item_id), row]),
      )
      setActionMessage(`${row.name} is now available.`)
      return
    }

    setMenuRows((prev) => prev.filter((menuItem) => menuItem.item_id !== row.item_id))
    setArchivedMenuRows((prev) =>
      sortMenuById([...prev.filter((menuItem) => menuItem.item_id !== row.item_id), row]),
    )
    setActionMessage(`${row.name} is now unavailable.`)
  }, [])

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



  const handleAddRecipeIngredient = useCallback(
    async (menuItem) => {
      if (!supabase) return false

      const input = recipeInputs[menuItem.item_id] ?? {}
      const ingredientId = Number(input.ingredient_id)
      const quantityRequired = Number(input.quantity_required)
      const ingredient = rows.find((row) => row.ingredient_id === ingredientId)

      setActionError(null)
      setActionMessage(null)

      if (!ingredient) {
        setActionError('Choose an ingredient for this menu item.')
        return false
      }

      if (!Number.isFinite(quantityRequired) || quantityRequired <= 0) {
        setActionError('Enter a recipe quantity greater than zero.')
        return false
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
        return false
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
      return true
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
        reference_id: TX_REFERENCE_ID,
        cashier_id: TX_CASHIER_ID,
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
      if (!supabase) return false
      const amount = parsePositiveAmount(qtyInputs[row.ingredient_id])
      if (Number.isNaN(amount)) {
        setActionMessage(null)
        setActionError('Enter a positive number for quantity.')
        return false
      }

      const stockInCost = mode === 'in' ? parseOptionalCost(costInputs[row.ingredient_id]) : 0
      if (Number.isNaN(stockInCost)) {
        setActionMessage(null)
        setActionError('Enter a valid cost amount, or leave it blank.')
        return false
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
        return false
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
        return false
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
        reference_id: TX_REFERENCE_ID,
        cashier_id: TX_CASHIER_ID,
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
      setStockMovementDialog(null)
      return true
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
        const [inventoryResult, menuResult, menuIngredientsResult] = await Promise.all([
          supabase.from('inventory').select('*').order('ingredient_id'),
          supabase.from('menu').select('*').order('item_id'),
          supabase.from('menu_ingredients').select('*').order('menu_ingredient_id'),
        ])
        if (cancelled) return

        if (inventoryResult.error || menuResult.error || menuIngredientsResult.error) {
          setFetchError(
            inventoryResult.error?.message ??
              menuResult.error?.message ??
              menuIngredientsResult.error?.message ??
              'Could not load dashboard data.',
          )
          setRows([])
          setMenuRows([])
          setArchivedRows([])
          setArchivedMenuRows([])
          setMenuIngredientRows([])
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
    <main className="min-h-screen bg-[#FDFBF4] px-4 py-10 font-sans text-gray-700">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-16">
          <h1 className="text-6xl md:text-7xl font-bold text-gray-500/80 leading-tight">
            Admin Dashboard <br /> Inventory
          </h1>
        </header>
      <p className="hidden">
        Live data — updates <code className="text-[9px] bg-gray-100 px-1 rounded">inventory</code>, logs{' '}
        <code className="text-[9px] bg-gray-100 px-1 rounded">inventory_transactions</code> (Realtime on inventory)
      </p>
      <div className="hidden">
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

      <InventoryModals
        stockMovementDialog={stockMovementDialog}
        activeStockIngredient={activeStockIngredient}
        qtyInputs={qtyInputs}
        setQtyInputs={setQtyInputs}
        busyIngredientId={busyIngredientId}
        costInputs={costInputs}
        setCostInputs={setCostInputs}
        setStockMovementDialog={setStockMovementDialog}
        applyStockMovement={applyStockMovement}
        configured={configured}
        missingRecipeDialog={missingRecipeDialog}
        setMissingRecipeDialog={setMissingRecipeDialog}
        editRecordDialog={editRecordDialog}
        activeEditIngredient={activeEditIngredient}
        activeEditMenuItem={activeEditMenuItem}
        editRecordInputs={editRecordInputs}
        handleEditRecordInputChange={handleEditRecordInputChange}
        editRecordBusy={editRecordBusy}
        menuCategoryOptions={menuCategoryOptions}
        openDeleteConfirm={openDeleteConfirm}
        handleSaveEditedRecord={handleSaveEditedRecord}
        deleteConfirm={deleteConfirm}
        handleDeleteConfirmInput={handleDeleteConfirmInput}
        deleteBusy={deleteBusy}
        setDeleteConfirm={setDeleteConfirm}
        handleConfirmedDelete={handleConfirmedDelete}
        permanentDeleteConfirm={permanentDeleteConfirm}
        handlePermanentDeleteConfirmInput={handlePermanentDeleteConfirmInput}
        permanentDeleteBusy={permanentDeleteBusy}
        setPermanentDeleteConfirm={setPermanentDeleteConfirm}
        handleConfirmedPermanentDelete={handleConfirmedPermanentDelete}
        recipeEditDialog={recipeEditDialog}
        activeRecipeEditRow={activeRecipeEditRow}
        activeRecipeEditMenuItem={activeRecipeEditMenuItem}
        recipeEditInputs={recipeEditInputs}
        handleRecipeEditInputChange={handleRecipeEditInputChange}
        rows={rows}
        busyRecipeRowId={busyRecipeRowId}
        handleRemoveRecipeIngredient={handleRemoveRecipeIngredient}
        recipeRowsByMenuId={recipeRowsByMenuId}
        setRecipeEditDialog={setRecipeEditDialog}
        handleUpdateRecipeIngredient={handleUpdateRecipeIngredient}
      />
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

      <AddRecordPanel
        addMode={addMode}
        setAddMode={setAddMode}
        configured={configured}
        newIngredient={newIngredient}
        handleNewIngredientChange={handleNewIngredientChange}
        addingIngredient={addingIngredient}
        handleAddIngredient={handleAddIngredient}
        newMenuItem={newMenuItem}
        handleNewMenuItemChange={handleNewMenuItemChange}
        addingMenuItem={addingMenuItem}
        handleAddMenuItem={handleAddMenuItem}
        menuCategoryOptions={menuCategoryOptions}
        customMenuCategory={customMenuCategory}
        setCustomMenuCategory={setCustomMenuCategory}
      />
      {addMode === 'archived' && (
        <ArchivedInventorySection
          archivedRows={archivedRows}
          archivedMenuRows={archivedMenuRows}
          configured={configured}
          busyAvailabilityItemId={busyAvailabilityItemId}
          handleSetMenuAvailability={handleSetMenuAvailability}
          openPermanentDeleteConfirm={openPermanentDeleteConfirm}
        />
      )}

      {addMode === 'ingredient' && (
        <IngredientInventorySection
          loading={loading}
          configured={configured}
          rows={rows}
          fetchError={fetchError}
          busyIngredientId={busyIngredientId}
          openEditRecordDialog={openEditRecordDialog}
          openStockMovementDialog={openStockMovementDialog}
        />
      )}

      {addMode === 'menu' && (
        <MenuItemsSection
          loading={loading}
          configured={configured}
          menuRows={menuRows}
          fetchError={fetchError}
          menuCatalogueGroups={menuCatalogueGroups}
          scrollToMenuCatalogueTarget={scrollToMenuCatalogueTarget}
          openEditRecordDialog={openEditRecordDialog}
          recipeRowsByMenuId={recipeRowsByMenuId}
          ingredientById={ingredientById}
          busyRecipeRowId={busyRecipeRowId}
          openRecipeEditDialog={openRecipeEditDialog}
          setMissingRecipeDialog={setMissingRecipeDialog}
          recipeInputs={recipeInputs}
          handleRecipeInputChange={handleRecipeInputChange}
          rows={rows}
          busyRecipeItemId={busyRecipeItemId}
          handleAddRecipeIngredient={handleAddRecipeIngredient}
        />
      )}
      </div>
    </main>
  )
}






