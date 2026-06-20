import { useMemo } from 'react'
import { slugifyForId, sortText } from './inventoryUtils.js'

export function useInventoryDashboardData({
  rows,
  menuRows,
  menuIngredientRows,
  recipeEditDialog,
  stockMovementDialog,
  editRecordDialog,
  customMenuCategory,
}) {
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

  const activeStockIngredient = useMemo(() => {
    if (!stockMovementDialog) return null
    return rows.find((row) => row.ingredient_id === stockMovementDialog.ingredient_id) ?? null
  }, [rows, stockMovementDialog])

  const menuCategoryOptions = useMemo(() => {
    const categories = new Set()
    for (const row of menuRows) {
      if (row.category) categories.add(row.category)
    }
    if (customMenuCategory.trim()) categories.add(customMenuCategory.trim())
    return sortText([...categories])
  }, [customMenuCategory, menuRows])

  const activeEditIngredient = useMemo(() => {
    if (editRecordDialog?.type !== 'ingredient') return null
    return rows.find((row) => row.ingredient_id === editRecordDialog.id) ?? null
  }, [editRecordDialog, rows])

  const activeEditMenuItem = useMemo(() => {
    if (editRecordDialog?.type !== 'menu') return null
    return menuRows.find((row) => row.item_id === editRecordDialog.id) ?? null
  }, [editRecordDialog, menuRows])

  const menuCatalogueGroups = useMemo(() => {
    const groups = new Map()

    for (const item of menuRows) {
      const categoryPath = item.category?.trim() || 'Uncategorized'
      const parts = categoryPath.split('/').map((part) => part.trim()).filter(Boolean)
      const root = parts[0] || 'Uncategorized'
      const groupName = root.toLowerCase() === 'drinks' ? 'Drinks' : 'Menu'
      const sectionName = categoryPath

      if (!groups.has(groupName)) {
        groups.set(groupName, {
          id: `menu-group-${slugifyForId(groupName)}`,
          name: groupName,
          count: 0,
          sections: new Map(),
        })
      }

      const group = groups.get(groupName)
      group.count += 1

      if (!group.sections.has(sectionName)) {
        group.sections.set(sectionName, {
          id: `menu-section-${slugifyForId(sectionName)}`,
          name: sectionName,
          items: [],
        })
      }

      group.sections.get(sectionName).items.push(item)
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        sections: [...group.sections.values()].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        if (a.name === 'Drinks') return -1
        if (b.name === 'Drinks') return 1
        return a.name.localeCompare(b.name)
      })
  }, [menuRows])

  return {
    ingredientById,
    recipeRowsByMenuId,
    activeRecipeEditRow,
    activeRecipeEditMenuItem,
    activeStockIngredient,
    menuCategoryOptions,
    activeEditIngredient,
    activeEditMenuItem,
    menuCatalogueGroups,
  }
}
