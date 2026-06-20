import { supabase } from '../../lib/supabaseClient.js'

export async function listActivityLogs({ areaFilter, actionFilter, emailFilter }) {
  if (!supabase) return { data: [], error: null }

  let query = supabase
    .from('activity_logs')
    .select('activity_id,created_at,actor_email,area,action,entity_type,entity_id,entity_name,description,metadata')
    .order('created_at', { ascending: false })
    .limit(200)

  if (areaFilter !== 'all') query = query.eq('area', areaFilter)
  if (actionFilter !== 'all') query = query.eq('action', actionFilter)
  if (emailFilter.trim()) query = query.ilike('actor_email', `%${emailFilter.trim()}%`)

  return query
}
