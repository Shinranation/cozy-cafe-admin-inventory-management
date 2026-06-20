import { supabase } from '../../lib/supabaseClient.js'

export async function listSoldItemsReport({ startAt, endAt }) {
  if (!supabase) return { data: [], error: null }

  return supabase.rpc('list_sold_items_report', {
    p_start_at: startAt,
    p_end_at: endAt,
  })
}
