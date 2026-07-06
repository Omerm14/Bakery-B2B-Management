import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useCurrentUser() {
  const [email, setEmail] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email || null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user?.email || null))
    return () => subscription.unsubscribe()
  }, [])
  return email
}
