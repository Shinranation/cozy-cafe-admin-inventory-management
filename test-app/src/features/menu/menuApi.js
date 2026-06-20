import { supabase } from '../../lib/supabaseClient.js'

export async function getPublicMenu() {
  if (!supabase) return { data: null, error: null }
  return supabase.rpc('get_menu_public')
}
