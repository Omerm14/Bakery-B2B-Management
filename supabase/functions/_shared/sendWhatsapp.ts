// Thin wrapper around Meta's WhatsApp Cloud API (Graph API).
// Requires these Edge Function secrets to be set (see the deployment
// checklist in the plan doc):
//   META_WHATSAPP_TOKEN      - permanent (system-user) access token
//   META_PHONE_NUMBER_ID     - the sending number's phone_number_id
//
// Message templates must be pre-approved in Meta Business Manager before
// they can be used here — this call will fail with a Meta API error for
// any template name that isn't approved and exactly matching (name,
// language, and component structure) what's registered there.

export interface WhatsAppTemplateComponent {
  type: 'body' | 'button' | 'header'
  sub_type?: string
  index?: string
  parameters: Array<{ type: 'text'; text: string }>
}

export interface SendTemplateResult {
  ok: boolean
  providerMessageId?: string
  errorDetail?: string
}

export async function sendWhatsAppTemplate(
  toPhoneE164: string,
  templateName: string,
  languageCode: string,
  components: WhatsAppTemplateComponent[] = [],
): Promise<SendTemplateResult> {
  const token = Deno.env.get('META_WHATSAPP_TOKEN')
  const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID')
  if (!token || !phoneNumberId) {
    return { ok: false, errorDetail: 'META_WHATSAPP_TOKEN / META_PHONE_NUMBER_ID not configured' }
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhoneE164.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    return { ok: false, errorDetail: data?.error?.message || `HTTP ${res.status}` }
  }
  return { ok: true, providerMessageId: data?.messages?.[0]?.id }
}
