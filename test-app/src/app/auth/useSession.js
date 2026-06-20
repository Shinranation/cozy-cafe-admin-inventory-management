import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient.js'

export function useSession() {
  const [session, setSession] = useState(null)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession ?? null)
      },
    )

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  return session
}
