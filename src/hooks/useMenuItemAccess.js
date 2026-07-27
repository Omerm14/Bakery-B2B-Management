import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'

// Rows here only matter for items with menu_items.restrict_customers = true —
// see migration 056. Exposed as { [menu_item_id]: Set<customer_id> }.
export function useMenuItemAccess() {
  const toast = useToast()
  const [accessByItem, setAccessByItem] = useState({})
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('menu_item_customer_access').select('menu_item_id, customer_id')
    if (error) { console.error('[useMenuItemAccess]', error); toast.error('טעינת הרשאות הלקוחות לפריטים נכשלה') }
    const map = {}
    for (const row of data || []) {
      if (!map[row.menu_item_id]) map[row.menu_item_id] = new Set()
      map[row.menu_item_id].add(row.customer_id)
    }
    setAccessByItem(map)
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { accessByItem, setAccessByItem, loading, refetch }
}
