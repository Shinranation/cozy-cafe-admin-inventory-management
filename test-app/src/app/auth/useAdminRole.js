import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

export function useAdminRole(user) {
  const [adminSignedIn, setAdminSignedIn] = useState(false)

  useEffect(() => {
    if (!supabase || !user) {
      const timeoutId = window.setTimeout(() => setAdminSignedIn(false), 0)
      return () => window.clearTimeout(timeoutId)
    }

    let alive = true

    ;(async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!alive) return

      setAdminSignedIn(!error && data?.role === 'admin')
    })()

    return () => {
      alive = false
    }
  }, [user])

  return adminSignedIn
}
