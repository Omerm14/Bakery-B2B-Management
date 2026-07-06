// Staff-only endpoint (verify_jwt = true, Supabase's default — see
// supabase/config.toml) — called from Settings.jsx's "set/reset PIN"
// button. Creates the customer's auth.users row if missing, or resets
// its password if it already exists — either way, the customer's PIN
// *is* that identity's password, so login is a plain
// supabase.auth.signInWithPassword() call with no OTP/messaging service
// of any kind involved.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MIN_PIN_LENGTH = 6

function syntheticEmail(customerId: string) {
  return `cust_${customerId}@auth.floory.internal`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: callerData, error: callerErr } = await anonClient.auth.getUser()
  const callerRole = callerData?.user?.app_metadata?.role || 'staff'
  if (callerErr || !callerData?.user || callerRole !== 'staff') {
    return new Response(JSON.stringify({ ok: false, error: 'staff only' }), { status: 403 })
  }

  const { customer_id, pin } = await req.json().catch(() => ({}))
  if (!customer_id || !pin) {
    return new Response(JSON.stringify({ ok: false, error: 'customer_id and pin are required' }), { status: 400 })
  }
  if (String(pin).length < MIN_PIN_LENGTH) {
    return new Response(JSON.stringify({ ok: false, error: `הקוד חייב להכיל לפחות ${MIN_PIN_LENGTH} תווים` }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: customer } = await supabase
    .from('customers')
    .select('id, phone, auth_user_id, auth_email')
    .eq('id', customer_id)
    .maybeSingle()

  if (!customer) return new Response(JSON.stringify({ ok: false, error: 'customer not found' }), { status: 404 })
  if (!customer.phone) return new Response(JSON.stringify({ ok: false, error: 'צריך מספר טלפון לפני הגדרת קוד גישה' }), { status: 400 })

  if (customer.auth_user_id) {
    const { error: updateErr } = await supabase.auth.admin.updateUserById(customer.auth_user_id, { password: pin })
    if (updateErr) {
      return new Response(JSON.stringify({ ok: false, error: updateErr.message }), { status: 500 })
    }
  } else {
    const authEmail = customer.auth_email || syntheticEmail(customer.id)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: pin,
      email_confirm: true,
      app_metadata: { role: 'customer', customer_id: customer.id },
    })
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ ok: false, error: createErr?.message || 'failed to create auth user' }), { status: 500 })
    }
    await supabase.from('customers').update({ auth_user_id: created.user.id, auth_email: authEmail }).eq('id', customer.id)
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})
