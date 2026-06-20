import { supabase } from '../../lib/supabaseClient.js'

export async function getCurrentUserEmail() {
  if (!supabase) return { email: null, error: null }

  const { data, error } = await supabase.auth.getUser()
  return {
    email: data?.user?.email ?? null,
    error,
  }
}

export async function listReceivedOrdersAndExpenses() {
  if (!supabase) {
    return {
      receivedOrdersResult: { data: [], error: null },
      expensesResult: { data: [], error: null },
    }
  }

  const [receivedOrdersResult, expensesResult] = await Promise.all([
    supabase.rpc('list_received_orders_with_items'),
    supabase.from('expenses').select('expense_date,expense_name,amount,category'),
  ])

  return { receivedOrdersResult, expensesResult }
}

export async function resetRevenueData({ confirmEmail, confirmAction, confirmScope }) {
  if (!supabase) return { data: null, error: null }

  return supabase.rpc('reset_revenue_data', {
    p_confirm_email: confirmEmail,
    p_confirm_action: confirmAction,
    p_confirm_scope: confirmScope,
  })
}
