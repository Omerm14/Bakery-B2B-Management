import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Customer-facing sibling of useMenuItems — customers have no direct
// grant on menu_items (RLS can hide rows but not columns, and price needs
// column-level masking), so this goes through the get_active_menu_items()
// RPC instead, which nulls out price unless price_visible_to_customers
// is set for that item.
export function useCustomerMenuItems() {
  const [menuItems, setMenuItems] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_active_menu_items')
    if (error) console.error('[useCustomerMenuItems]', error)
    setMenuItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { menuItems, loading, refetch }
}
