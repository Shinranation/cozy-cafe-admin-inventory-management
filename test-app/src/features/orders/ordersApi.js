import { supabase } from '../../lib/supabaseClient.js'

export async function listPendingOrdersWithItems() {
  if (!supabase) return { data: [], error: null }
  return supabase.rpc('list_pending_orders_with_items')
}

export async function markOrderReceived(orderId) {
  if (!supabase) return { error: null }
  return supabase.rpc('mark_order_received', { p_order_id: orderId })
}
