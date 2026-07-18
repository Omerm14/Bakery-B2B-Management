// Staff-only endpoint (verify_jwt = true, Supabase's default — see
// supabase/config.toml) — called from Settings.jsx's "set/reset PIN"
// button. Creates the customer's auth.users row if missing, or resets
// its password if it already exists — either way, the customer's PIN
// *is* that identity's password, so login is a plain
// supabase.auth.signInWithPassword() call with no OTP/messaging service
// of any kind involved.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MIN_PIN_LENGTH = 6

// Required for any Edge Function called directly from the browser (as
// opposed to server-to-server): without these, the browser's preflight
// OPTIONS request gets no CORS headers back, fails, and the actual
// POST is blocked client-side before it ever reaches this code.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function syntheticEmail(customerId: string) {
  return `cust_${customerId}@auth.floory.internal`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: callerData, error: callerErr } = await anonClient.auth.getUser()
  const callerRole = callerData?.user?.app_metadata?.role || 'staff'
  if (callerErr || !callerData?.user || callerRole !== 'staff') {
    return json({ ok: false, error: 'staff only' }, 403)
  }

  const { customer_id, pin } = await req.json().catch(() => ({}))
  if (!customer_id || !pin) {
    return json({ ok: false, error: 'customer_id and pin are required' }, 400)
  }
  if (String(pin).length < MIN_PIN_LENGTH) {
    return json({ ok: false, error: `הקוד חייב להכיל לפחות ${MIN_PIN_LENGTH} תווים` }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: customer } = await supabase
    .from('customers')
    .select('id, phone, auth_user_id, auth_email, organization_id')
    .eq('id', customer_id)
    .maybeSingle()

  if (!customer) return json({ ok: false, error: 'customer not found' }, 404)
  if (!customer.phone) return json({ ok: false, error: 'צריך מספר טלפון לפני הגדרת קוד גישה' }, 400)

  if (customer.auth_user_id) {
    // Re-set app_metadata on every PIN reset too (not just first
    // creation) — cheap, and self-heals an account whose organization_id
    // claim predates this customer being (re)assigned to an org.
    const { error: updateErr } = await supabase.auth.admin.updateUserById(customer.auth_user_id, {
      password: pin,
      app_metadata: { role: 'customer', customer_id: customer.id, organization_id: customer.organization_id },
    })
    if (updateErr) {
      return json({ ok: false, error: updateErr.message }, 500)
    }
    await supabase.from('customers').update({ portal_pin: pin }).eq('id', customer.id)
  } else {
    const authEmail = customer.auth_email || syntheticEmail(customer.id)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: pin,
      email_confirm: true,
      app_metadata: { role: 'customer', customer_id: customer.id, organization_id: customer.organization_id },
    })
    if (createErr || !created?.user) {
      return json({ ok: false, error: createErr?.message || 'failed to create auth user' }, 500)
    }
    await supabase.from('customers').update({ auth_user_id: created.user.id, auth_email: authEmail, portal_pin: pin }).eq('id', customer.id)
  }

  return json({ ok: true, pin })
})
