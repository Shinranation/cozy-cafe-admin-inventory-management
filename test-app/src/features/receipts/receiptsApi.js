import { supabase } from '../../lib/supabaseClient.js'

export async function listReceivedOrdersWithItems() {
  if (!supabase) return { data: [], error: null }
  return supabase.rpc('list_received_orders_with_items')
}

export async function getCurrentUserEmail() {
  if (!supabase) return { email: null, error: null }

  const { data, error } = await supabase.auth.getUser()
  return {
    email: data?.user?.email ?? null,
    error,
  }
}

export async function runReceiptOrderAction({
  rpc,
  orderIds,
  confirmEmail,
  confirmAction,
  confirmScope,
}) {
  if (!supabase) return { data: null, error: null }

  return supabase.rpc(rpc, {
    p_order_ids: orderIds,
    p_confirm_email: confirmEmail,
    p_confirm_action: confirmAction,
    p_confirm_scope: confirmScope,
  })
}
