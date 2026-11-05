// Telegram bot that answers questions about the orders (migration 067).
//
// Telegram posts every message to this function (webhook, with the secret
// from Vault in X-Telegram-Bot-Api-Secret-Token). Only users listed in
// telegram_bot_users get answers. Claude reads the question, calls the
// read-only report functions (tools.js) and writes the answer; summaries go
// out as a designed image (card.js). Nothing here can change an order.
//
// Deploy with JWT verification off (the webhook secret is the auth):
//   supabase secrets set ANTHROPIC_API_KEY=<key>
//   supabase functions deploy telegram-bot --no-verify-jwt
//   select telegram_bot_set_webhook();          -- in the SQL editor
// Optional: BOT_MODEL to use another Claude model.
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0'
import { svgToPng } from '../_shared/svg-png.ts'
import { buildCustomerCardSvg, cardCaption } from './card.js'
import { toTelegramHtml, stripTags, splitMessage, dateContext, cleanQuestion } from './format.js'
import { TOOLS, RPC, SYSTEM_PROMPT, HELP_TEXT } from './tools.js'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const MODEL = Deno.env.get('BOT_MODEL') ?? 'claude-opus-5-5'
// Overridable only so the function can be exercised against a local stub.
const TELEGRAM_API = Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'
const MAX_TURNS = 10

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`)
  return res.json()
}

// Config is read once per worker; the token doesn't change between messages.
let configPromise: Promise<Record<string, string>> | null = null
const getConfig = () => {
  configPromise ??= rpc('telegram_bot_config')
  configPromise.catch(() => { configPromise = null })
  return configPromise
}

type Chat = { token: string; chatId: number; replyTo?: number }

async function tg(token: string, method: string, body: Record<string, unknown> | FormData) {
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, body instanceof FormData
    ? { method: 'POST', body }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return res.json()
}

// Sends formatted text, falling back to plain text if Telegram rejects the HTML.
async function sendText(chat: Chat, text: string) {
  for (const part of splitMessage(toTelegramHtml(text))) {
    const base = { chat_id: chat.chatId, reply_to_message_id: chat.replyTo, allow_sending_without_reply: true, disable_web_page_preview: true }
    const res = await tg(chat.token, 'sendMessage', { ...base, text: part, parse_mode: 'HTML' })
    if (!res.ok) {
      const plain = await tg(chat.token, 'sendMessage', { ...base, text: stripTags(part) })
      if (!plain.ok) throw new Error(`telegram: ${plain.description}`)
    }
  }
}

async function sendCard(chat: Chat, report: Record<string, unknown>) {
  const png = await svgToPng(buildCustomerCardSvg(report))
  const form = new FormData()
  form.append('chat_id', String(chat.chatId))
  if (chat.replyTo) form.append('reply_to_message_id', String(chat.replyTo))
  form.append('allow_sending_without_reply', 'true')
  form.append('caption', cardCaption(report))
  form.append('photo', new Blob([png as BlobPart], { type: 'image/png' }), 'summary.png')
  const res = await tg(chat.token, 'sendPhoto', form)
  if (!res.ok) throw new Error(`telegram: ${res.description}`)
}

// Runs one tool call; errors go back to Claude as an error result.
async function runTool(chat: Chat, block: Anthropic.Beta.BetaToolUseBlock): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  try {
    const spec = RPC[block.name as keyof typeof RPC]
    if (!spec) throw new Error(`unknown tool ${block.name}`)
    const data = await rpc(spec.fn, spec.args(block.input as Record<string, string>))
    if (block.name === 'send_customer_summary_card') {
      await sendCard(chat, data)
      return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ image_sent: true, report: data }) }
    }
    return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(data) }
  } catch (err) {
    console.error('[telegram-bot] tool', block.name, err)
    return { type: 'tool_result', tool_use_id: block.id, is_error: true, content: String((err as Error)?.message ?? err) }
  }
}

async function answer(chat: Chat, question: string, history: { role: 'user' | 'assistant'; content: string }[]) {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: 'user', content: question }]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      // Stable part first (cached), today's dates after it.
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dateContext() },
      ],
      tools: TOOLS as Anthropic.Beta.BetaTool[],
      messages,
    })

    if (res.stop_reason === 'refusal') return 'לא הצלחתי לענות על זה. אפשר לנסח את השאלה אחרת?'
    messages.push({ role: 'assistant', content: res.content })
    if (res.stop_reason === 'pause_turn') continue

    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || uses.length === 0) {
      return res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map(b => b.text).join('\n').trim()
    }
    messages.push({ role: 'user', content: await Promise.all(uses.map(b => runTool(chat, b))) })
  }
  return 'השאלה דרשה יותר מדי שלבים. אפשר לפצל אותה לשאלות קטנות יותר?'
}

type Update = {
  update_id: number
  message?: {
    message_id: number
    text?: string
    chat: { id: number; type: string }
    from?: { id: number; is_bot?: boolean }
  }
}

async function handle(update: Update, token: string) {
  const msg = update.message
  if (!msg?.text || !msg.from || msg.from.is_bot) return
  const chat: Chat = { token, chatId: msg.chat.id, replyTo: msg.chat.type === 'private' ? undefined : msg.message_id }

  const ctx = await rpc('telegram_bot_begin', { p_update_id: update.update_id, p_user_id: msg.from.id, p_chat_id: msg.chat.id })
  if (!ctx.new) return  // Telegram retry of a message already being answered
  if (!ctx.allowed) {
    // In private chats say who they are, so they can be added; groups stay quiet.
    if (msg.chat.type === 'private') {
      await sendText(chat, `הבוט פתוח רק למשתמשים מורשים.\nמספר המשתמש שלך: <code>${msg.from.id}</code>`)
    }
    return
  }

  const question = cleanQuestion(msg.text)
  if (!question || /^\/(start|help)\b/i.test(msg.text)) {
    await sendText(chat, HELP_TEXT)
    return
  }
  if (!ANTHROPIC_API_KEY) {
    await sendText(chat, 'הבוט עוד לא מחובר ל-Claude: צריך להגדיר ANTHROPIC_API_KEY בסודות של ה-Edge Functions.')
    return
  }

  // "typing…" until the answer is ready (Telegram shows it for ~5 s).
  const typing = () => tg(token, 'sendChatAction', { chat_id: chat.chatId, action: 'typing' }).catch(() => {})
  typing()
  const timer = setInterval(typing, 4500)
  try {
    const reply = await answer(chat, question, ctx.history ?? [])
    if (reply) await sendText(chat, reply)
    await rpc('telegram_bot_remember', { p_chat_id: chat.chatId, p_question: question, p_answer: reply || '(נשלחה תמונת סיכום)' })
  } catch (err) {
    console.error('[telegram-bot]', err)
    await sendText(chat, '⚠️ משהו השתבש בזמן שליפת הנתונים. כדאי לנסות שוב בעוד רגע.').catch(() => {})
  } finally {
    clearInterval(timer)
  }
}

Deno.serve(async req => {
  try {
    const config = await getConfig()
    if (!config.telegram_webhook_secret || req.headers.get('x-telegram-bot-api-secret-token') !== config.telegram_webhook_secret) {
      return new Response('unauthorized', { status: 401 })
    }
    const update = await req.json() as Update
    // Answer Telegram right away; the reply is sent when it's ready.
    EdgeRuntime.waitUntil(handle(update, config.telegram_bot_token).catch(err => console.error('[telegram-bot]', err)))
    return new Response('ok')
  } catch (err) {
    console.error('[telegram-bot]', err)
    return new Response('error', { status: 500 })
  }
})
