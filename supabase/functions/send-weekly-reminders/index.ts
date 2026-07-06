// Triggered by run_weekly_rollover() (migration 013) via pg_net, not by
// an end-user session — hence verify_jwt = false (see config.toml) and a
// shared-secret header check instead. Sends the Wednesday "review/change
// next week's order" reminder to every active customer, deduping against
// notification_log so a retry can't double-send.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWhatsAppTemplate } from '../_shared/sendWhatsapp.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const expectedSecret = Deno.env.get('CRON_EDGE_SECRET')
  if (expectedSecret && req.headers.get('x-cron-secret') !== expectedSecret) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 })
  }

  const { week_id } = await req.json().catch(() => ({}))
  if (!week_id) return new Response(JSON.stringify({ ok: false, error: 'week_id is required' }), { status: 400 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone')
    .eq('active', true)
    .not('phone', 'is', null)

  const { data: alreadySent } = await supabase
    .from('notification_log')
    .select('customer_id')
    .eq('notification_type', 'weekly_reminder')
    .eq('week_id', week_id)
    .eq('status', 'sent')

  const alreadySentIds = new Set((alreadySent || []).map(r => r.customer_id))
  const toNotify = (customers || []).filter(c => !alreadySentIds.has(c.id))

  const results = []
  for (const customer of toNotify) {
    const result = await sendWhatsAppTemplate(customer.phone, 'weekly_order_reminder', 'he', [
      { type: 'body', parameters: [{ type: 'text', text: customer.name }] },
    ])
    await supabase.from('notification_log').insert({
      customer_id: customer.id,
      notification_type: 'weekly_reminder',
      template_name: 'weekly_order_reminder',
      recipient_phone: customer.phone,
      week_id,
      status: result.ok ? 'sent' : 'failed',
      provider_message_id: result.providerMessageId ?? null,
      error_detail: result.errorDetail ?? null,
    })
    results.push({ customer_id: customer.id, ok: result.ok })
  }

  return new Response(
    JSON.stringify({ ok: true, notified: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, skipped: alreadySentIds.size }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
