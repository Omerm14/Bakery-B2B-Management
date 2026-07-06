// Public endpoint (no session exists yet) — a customer requests a login
// code by phone number. Always returns a generic success-shaped response
// regardless of whether the phone matches a customer, to avoid leaking
// which numbers are registered.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppTemplate } from '../_shared/sendWhatsapp.ts'
import { generateOtpCode, hashOtpCode } from '../_shared/otp.ts'

const GENERIC_RESPONSE = new Response(
  JSON.stringify({ ok: true, message: 'אם המספר רשום, קוד נשלח בוואטסאפ.' }),
  { headers: { 'Content-Type': 'application/json' } },
)

const OTP_TTL_MINUTES = 5
const RESEND_COOLDOWN_SECONDS = 60
const MAX_CODES_PER_10_MIN = 3

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { phone } = await req.json().catch(() => ({}))
  if (!phone || typeof phone !== 'string') {
    return new Response(JSON.stringify({ ok: false, error: 'phone is required' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: customer } = await supabase
    .from('customers')
    .select('id, phone, active')
    .eq('phone', phone)
    .eq('active', true)
    .maybeSingle()

  if (!customer) return GENERIC_RESPONSE

  const { data: recentCodes } = await supabase
    .from('customer_otp_codes')
    .select('created_at')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(MAX_CODES_PER_10_MIN)

  const now = Date.now()
  if (recentCodes?.length) {
    const lastAt = new Date(recentCodes[0].created_at).getTime()
    if (now - lastAt < RESEND_COOLDOWN_SECONDS * 1000) return GENERIC_RESPONSE
    const tenMinAgo = now - 10 * 60 * 1000
    if (recentCodes.length >= MAX_CODES_PER_10_MIN && recentCodes.every(c => new Date(c.created_at).getTime() > tenMinAgo)) {
      return GENERIC_RESPONSE
    }
  }

  const code = generateOtpCode()
  const codeHash = await hashOtpCode(code)
  const expiresAt = new Date(now + OTP_TTL_MINUTES * 60 * 1000).toISOString()

  await supabase.from('customer_otp_codes').insert({
    customer_id: customer.id,
    code_hash: codeHash,
    expires_at: expiresAt,
  })

  const result = await sendWhatsAppTemplate(customer.phone, 'login_otp', 'he', [
    { type: 'body', parameters: [{ type: 'text', text: code }] },
  ])

  await supabase.from('notification_log').insert({
    customer_id: customer.id,
    notification_type: 'otp',
    template_name: 'login_otp',
    recipient_phone: customer.phone,
    status: result.ok ? 'sent' : 'failed',
    provider_message_id: result.providerMessageId ?? null,
    error_detail: result.errorDetail ?? null,
  })

  return GENERIC_RESPONSE
})
