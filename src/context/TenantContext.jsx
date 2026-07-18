import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TenantContext = createContext(null)

// Mirrors LanguageContext.jsx's Context+Provider+localStorage shape.
//
// Normal staff: organizationId is hard-forced to their own session's
// organization_id claim (set at provisioning time — see migration 056) —
// there is nothing to switch, setOrganizationId is a no-op.
//
// Super-admins (app_metadata.is_super_admin, migration 056): can act as
// any organization. "Which org am I currently viewing" lives ONLY here,
// client-side — never in the JWT (a super-admin's own organization_id
// claim is always null) — persisted per-browser via localStorage so it
// survives a refresh.
//
// Every data-fetching call site reads `organizationId` from here and adds
// it to every query/mutation. For normal staff this is redundant with RLS
// (already restricted to one org) but required for super-admins — without
// it, their queries would return every org's rows mixed together, since
// RLS alone grants them full cross-org access.
export function TenantProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [organizations, setOrganizations] = useState([])
  const [actingOrgId, setActingOrgId] = useState(() => localStorage.getItem('floory_acting_org_id') || null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const isSuperAdmin = !!session?.user?.app_metadata?.is_super_admin
  const ownOrganizationId = session?.user?.app_metadata?.organization_id || null

  useEffect(() => {
    if (!isSuperAdmin) { setOrganizations([]); return }
    supabase.from('organizations').select('id, name, slug').eq('active', true).order('name')
      .then(({ data, error }) => {
        if (error) { console.error('[TenantContext]', error); return }
        setOrganizations(data || [])
      })
  }, [isSuperAdmin])

  // Once the super-admin's org list loads, fall back to the first org if
  // the persisted "acting as" choice is stale (e.g. that org was
  // deactivated, or this is a first-ever load with nothing persisted yet).
  useEffect(() => {
    if (!isSuperAdmin || organizations.length === 0) return
    setActingOrgId(prev => (prev && organizations.some(o => o.id === prev)) ? prev : organizations[0].id)
  }, [isSuperAdmin, organizations])

  const setOrganizationId = useCallback((id) => {
    setActingOrgId(id)
    localStorage.setItem('floory_acting_org_id', id)
  }, [])

  const organizationId = isSuperAdmin ? actingOrgId : ownOrganizationId

  return (
    <TenantContext.Provider value={{ organizationId, isSuperAdmin, organizations, setOrganizationId }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
