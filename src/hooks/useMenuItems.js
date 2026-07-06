import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

export function useMenuItems({ activeOnly = true } = {}) {
  const toast = useToast()
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('menu_items')
      .select('id, name_he, name_en, unit, category, supplier_id, active, price, suppliers(name)')
      .order('category').order('name_he')
    if (activeOnly) q = q.eq('active', true)
    const { data, error } = await q
    if (error) { console.error('[useMenuItems]', error); toast.error('טעינת התפריט נכשלה') }
    setMenuItems(data || [])
    setLoading(false)
  }, [activeOnly])

  useEffect(() => { refetch() }, [refetch])

  return { menuItems, setMenuItems, loading, refetch }
}
