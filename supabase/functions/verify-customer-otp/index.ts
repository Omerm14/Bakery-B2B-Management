// Public endpoint (no session exists yet) — verifies a code from
// send-customer-otp and, on success, returns a magic-link token_hash the
// browser can redeem via supabase.auth.verifyOtp({email, token_hash,
// type:'magiclink'}) to mint a real session. That call is what
// App.jsx's existing onAuthStateChange listener picks up — this function
// never returns a session/token directly, only the redeemable hash.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyOtpCode } from '../_shared/otp.ts'

const INVALID = () => new Response(JSON.stringify({ ok: false, error: 'קוד שגוי או שפג תוקפו' }), { status: 400 })

function syntheticEmail(customerId: string) {
  return `cust_${customerId}@auth.floory.internal`
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { phone, code } = await req.json().catch(() => ({}))
  if (!phone || !code) {
    return new Response(JSON.stringify({ ok: false, error: 'phone and code are required' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: customer } = await supabase
    .from('customers')
    .select('id, phone, active, auth_user_id, auth_email')
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle()

  if (!customer) return INVALID()

  const { data: otpRow } = await supabase
    .from('customer_otp_codes')
    .select('id, code_hash, expires_at, attempts, max_attempts, consumed_at')
    .eq('customer_id', customer.id)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!otpRow) return INVALID()
  if (otpRow.attempts >= otpRow.max_attempts) {
    return new Response(JSON.stringify({ ok: false, error: 'יותר מדי ניסיונות — בקש קוד חדש' }), { status: 429 })
  }

  const matches = await verifyOtpCode(code, otpRow.code_hash)
  if (!matches) {
    await supabase.from('customer_otp_codes').update({ attempts: otpRow.attempts + 1 }).eq('id', otpRow.id)
    return INVALID()
  }

  await supabase.from('customer_otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', otpRow.id)

  // Safety net: a customer should already have auth_user_id/auth_email set
  // by provision-and-welcome-customer. Lazily create here only if somehow
  // missing, so verification never hard-fails on a data gap.
  let authEmail = customer.auth_email
  if (!customer.auth_user_id || !authEmail) {
    authEmail = authEmail || syntheticEmail(customer.id)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      phone: customer.phone,
      phone_confirm: true,
      email: authEmail,
      email_confirm: true,
      app_metadata: { role: 'customer', customer_id: customer.id },
    })
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ ok: false, error: 'שגיאה ביצירת גישה — פנה לתמיכה' }), { status: 500 })
    }
    await supabase.from('customers').update({ auth_user_id: created.user.id, auth_email: authEmail }).eq('id', customer.id)
  }

  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
  })
  if (linkErr || !link?.properties?.hashed_token) {
    return new Response(JSON.stringify({ ok: false, error: 'שגיאה בכניסה — נסה שוב' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({ ok: true, token_hash: link.properties.hashed_token, email: authEmail }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
