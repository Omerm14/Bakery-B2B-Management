import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Same app_config('branding') row already consumed by CustomerLogin.jsx —
// { logo_url, business_name }, both nullable until staff upload something
// in Settings.
export function useBranding() {
  const [branding, setBranding] = useState({ logo_url: null, business_name: null })

  useEffect(() => {
    supabase.from('app_config').select('value').eq('key', 'branding').maybeSingle().then(({ data, error }) => {
      if (error) { console.error('[useBranding]', error); return }
      if (data?.value) setBranding(data.value)
    })
  }, [])

  return branding
}
