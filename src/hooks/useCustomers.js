import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

export function useCustomers({ activeOnly = true } = {}) {
  const toast = useToast()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('customers').select('id, name, name_en, phone, active, auth_user_id, portal_pin').order('name')
    if (activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    if (error) { console.error('[useCustomers]', error); toast.error('טעינת הלקוחות נכשלה') }
    setCustomers(data || [])
    setLoading(false)
  }, [activeOnly])

  useEffect(() => { refetch() }, [refetch])

  // Shared by Orders.jsx's and Settings.jsx's "add customer" flows.
  // customers.name has a unique constraint (migration 002) — a name
  // collision most often means a previously deactivated customer with the
  // same name already exists (hidden from activeOnly lists), not a real
  // conflict, so reactivate that row instead of failing.
  const createCustomer = useCallback(async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return { error: new Error('empty name') }

    const { data, error } = await supabase
      .from('customers')
      .insert({ name: trimmed, active: true })
      .select('id, name, name_en, phone, active, auth_user_id, portal_pin')
      .single()

    if (!error) {
      setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'he')))
      return { data, reactivated: false }
    }

    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('customers')
        .select('id, name, name_en, phone, active, auth_user_id, portal_pin')
        .eq('name', trimmed)
        .maybeSingle()

      if (existing && !existing.active) {
        const { data: reactivated, error: reactivateErr } = await supabase
          .from('customers')
          .update({ active: true })
          .eq('id', existing.id)
          .select('id, name, name_en, phone, active, auth_user_id, portal_pin')
          .single()
        if (reactivateErr) return { error: reactivateErr }
        setCustomers(prev => [...prev.filter(c => c.id !== reactivated.id), reactivated].sort((a, b) => a.name.localeCompare(b.name, 'he')))
        return { data: reactivated, reactivated: true }
      }

      if (existing && existing.active) return { error, alreadyActive: true }
    }

    return { error }
  }, [])

  return { customers, setCustomers, loading, refetch, createCustomer }
}
