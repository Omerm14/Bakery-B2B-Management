// Weekly summary image for the owner's Telegram group.
//
// Called every Sunday morning by pg_cron (trigger_owner_weekly_report(),
// migration 066) with the shared secret from Vault in `x-report-secret`.
// Reads owner_weekly_summary() and the Telegram credentials through the
// service role, draws the image (render.js) and posts it with sendPhoto.
// Nothing leaves Supabase except the finished image going to Telegram.
//
// Deploy with JWT verification off (the secret header is the auth):
//   supabase functions deploy owner-weekly-report --no-verify-jwt
// Manual test from the SQL editor: select trigger_owner_weekly_report();
import { svgToPng } from '../_shared/svg-png.ts'
import { buildWeeklySvg, caption } from './render.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Overridable only so the function can be exercised against a local stub.
const TELEGRAM_API = Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`)
  return res.json()
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  try {
    const config = await rpc('owner_report_config')
    if (!config.owner_report_secret || req.headers.get('x-report-secret') !== config.owner_report_secret) {
      return json({ error: 'unauthorized' }, 401)
    }
    if (!config.telegram_bot_token || !config.telegram_chat_id) {
      return json({ error: 'telegram not configured' }, 412)
    }

    const body = await req.json().catch(() => ({}))
    const summary = await rpc('owner_weekly_summary', body.week_start ? { p_week_start: body.week_start } : {})

    const png = await svgToPng(buildWeeklySvg(summary))

    const form = new FormData()
    form.append('chat_id', String(config.telegram_chat_id))
    form.append('caption', caption(summary))
    form.append('photo', new Blob([png as BlobPart], { type: 'image/png' }), 'weekly-summary.png')
    const tg = await fetch(`${TELEGRAM_API}/bot${config.telegram_bot_token}/sendPhoto`, { method: 'POST', body: form })
    const result = await tg.json()
    if (!result.ok) throw new Error(`telegram: ${result.description}`)
    return json({ ok: true, bytes: png.length })
  } catch (err) {
    console.error('[owner-weekly-report]', err)
    return json({ error: String((err as Error)?.message ?? err) }, 500)
  }
})
