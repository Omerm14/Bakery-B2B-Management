import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCustomers({ activeOnly = true } = {}) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('customers').select('id, name, phone, active, auth_user_id').order('name')
    if (activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    if (error) console.error('[useCustomers]', error)
    setCustomers(data || [])
    setLoading(false)
  }, [activeOnly])

  useEffect(() => { refetch() }, [refetch])

  return { customers, setCustomers, loading, refetch }
}
