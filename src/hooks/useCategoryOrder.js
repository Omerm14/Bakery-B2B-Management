import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_CATEGORY_ORDER } from '../constants/categories'

// Category names in the order staff set in Settings. Falls back to the
// legacy hardcoded order on error (e.g. migration 062 not applied yet), so
// screens never end up worse than before.
export function useCategoryOrder() {
  const [order, setOrder] = useState(DEFAULT_CATEGORY_ORDER)

  useEffect(() => {
    supabase.from('categories').select('name, sort_order').order('sort_order').order('name')
      .then(({ data, error }) => {
        if (error) { console.error('[useCategoryOrder]', error); return }
        if (data?.length) setOrder(data.map(c => c.name))
      })
  }, [])

  return order
}
