export function splitCategory(category) {
  return String(category || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

export function rootCategory(item) {
  return splitCategory(item.category)[0] || 'Other'
}

export function subCategory(item) {
  const parts = splitCategory(item.category)
  return parts.length > 1 ? parts.slice(1).join(' / ') : ''
}

export function firstMenuItem(rows) {
  return [...rows].sort((a, b) => {
    const aId = Number(a.id ?? a.item_id ?? 0)
    const bId = Number(b.id ?? b.item_id ?? 0)
    return aId - bId
  })[0] ?? null
}

export function sortSizeLabels(a, b) {
  return Number.parseFloat(a) - Number.parseFloat(b) || a.localeCompare(b)
}
