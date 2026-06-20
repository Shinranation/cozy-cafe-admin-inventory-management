import { defaultPosCashierId, supabase } from '../../lib/supabaseClient.js'

export async function listAvailableOrderMenuItems() {
  if (!supabase) return { data: [], error: null }

  const { data, error } = await supabase
    .from('menu')
    .select('item_id,name,size_label,price,category,availability_status')
    .order('category')
    .order('name')

  if (error) return { data: [], error }

  const menuIds = (data ?? [])
    .map((row) => Number(row.item_id))
    .filter((id) => Number.isFinite(id) && id > 0)
  const recipeMenuIds = new Set()

  if (menuIds.length > 0) {
    const { data: recipeRows, error: recipeError } = await supabase
      .from('menu_ingredients')
      .select('menu_item_id')
      .in('menu_item_id', menuIds)

    if (!recipeError) {
      for (const row of recipeRows ?? []) {
        const id = Number(row.menu_item_id)
        if (Number.isFinite(id)) recipeMenuIds.add(id)
      }
    }
  }

  return {
    data: (data ?? [])
      .map((row) => ({
        item_id: Number(row.item_id),
        name: String(row.name ?? ''),
        size_label: String(row.size_label ?? ''),
        price: Number(row.price) || 0,
        category: String(row.category ?? ''),
        availability_status: String(row.availability_status ?? ''),
        has_recipe: recipeMenuIds.has(Number(row.item_id)),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.item_id) &&
          row.item_id > 0 &&
          row.availability_status.toLowerCase() === 'available',
      ),
    error: null,
  }
}

export async function confirmPosOrder({ guestDisplayName, lines }) {
  if (!supabase) return { error: null }

  return supabase.rpc('confirm_pos_order', {
    p_cashier_id: defaultPosCashierId(),
    p_client_id: null,
    p_guest_display_name: guestDisplayName.trim() || null,
    p_lines: lines,
  })
}
