import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useTenant } from '../context/TenantContext'

// Reads the current org's branding columns directly off `organizations`
// (migration 055) — replaces the old app_config('branding') key/value read,
// now that branding is a real per-org column, not a global singleton.
export function useBranding() {
  const { organizationId } = useTenant()
  const [branding, setBranding] = useState({ logo_url: null, business_name: null })

  useEffect(() => {
    if (!organizationId) { setBranding({ logo_url: null, business_name: null }); return }
    supabase.from('organizations').select('business_name, logo_url').eq('id', organizationId).maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[useBranding]', error); return }
        if (data) setBranding({ business_name: data.business_name, logo_url: data.logo_url })
      })
  }, [organizationId])

  return branding
}
