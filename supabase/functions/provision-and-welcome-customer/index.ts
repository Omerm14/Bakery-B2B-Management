// Staff-only endpoint (verify_jwt = true, see supabase/config.toml) —
// called from Settings.jsx's "provision / resend welcome" button. Creates
// the customer's auth.users row if missing (idempotent — safe to click
// again to just resend the welcome message), then sends a WhatsApp
// welcome message with the portal link.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppTemplate } from '../_shared/sendWhatsapp.ts'

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

  const { customer_id } = await req.json().catch(() => ({}))
  if (!customer_id) {
    return new Response(JSON.stringify({ ok: false, error: 'customer_id is required' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, phone, auth_user_id, auth_email')
    .eq('id', customer_id)
    .maybeSingle()

  if (!customer) return new Response(JSON.stringify({ ok: false, error: 'customer not found' }), { status: 404 })
  if (!customer.phone) return new Response(JSON.stringify({ ok: false, error: 'צריך מספר טלפון לפני הפעלת גישה' }), { status: 400 })

  let authEmail = customer.auth_email
  if (!customer.auth_user_id) {
    authEmail = authEmail || syntheticEmail(customer.id)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      phone: customer.phone,
      phone_confirm: true,
      email: authEmail,
      email_confirm: true,
      app_metadata: { role: 'customer', customer_id: customer.id },
    })
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ ok: false, error: createErr?.message || 'failed to create auth user' }), { status: 500 })
    }
    await supabase.from('customers').update({ auth_user_id: created.user.id, auth_email: authEmail }).eq('id', customer.id)
  }

  const portalUrl = Deno.env.get('PORTAL_URL') || ''
  const result = await sendWhatsAppTemplate(customer.phone, 'customer_welcome', 'he', [
    { type: 'body', parameters: [{ type: 'text', text: customer.name }, { type: 'text', text: portalUrl }] },
  ])

  await supabase.from('notification_log').insert({
    customer_id: customer.id,
    notification_type: 'welcome',
    template_name: 'customer_welcome',
    recipient_phone: customer.phone,
    status: result.ok ? 'sent' : 'failed',
    provider_message_id: result.providerMessageId ?? null,
    error_detail: result.errorDetail ?? null,
  })

  return new Response(JSON.stringify({ ok: result.ok, error: result.errorDetail }), {
    status: result.ok ? 200 : 502,
    headers: { 'Content-Type': 'application/json' },
  })
})
