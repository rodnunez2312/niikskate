/**
 * Send booking confirmation via WhatsApp using Twilio’s WhatsApp API (same Messages endpoint, whatsapp: addresses).
 *
 * Setup: https://www.twilio.com/docs/whatsapp
 * - Sandbox: join with code from Twilio Console → Messaging → Try WhatsApp
 * - Production: connect a Meta Business number to Twilio
 *
 * Env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_WHATSAPP_FROM  e.g. whatsapp:+14155238886  (sandbox) or your approved WhatsApp sender
 *
 * Client: Authorization: Bearer <Supabase access_token>
 */
import { createClient } from '@supabase/supabase-js'
import { getHeader } from 'h3'

const E164 = /^\+[1-9]\d{6,14}$/

/** Twilio expects From/To like whatsapp:+523310001774 */
function toWhatsappChannel(addr: string): string {
  const s = addr.replace(/\s/g, '')
  if (s.toLowerCase().startsWith('whatsapp:')) return s
  const n = s.startsWith('+') ? s : `+${s.replace(/^\+/, '')}`
  return `whatsapp:${n}`
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const sid = config.twilioAccountSid as string
  const token = config.twilioAuthToken as string
  const fromRaw = config.twilioWhatsappFrom as string
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnon = config.public.supabaseKey as string

  if (!sid || !token || !fromRaw) {
    throw createError({
      statusCode: 503,
      message:
        'WhatsApp is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)',
    })
  }

  const from = toWhatsappChannel(fromRaw)

  const authHeader = getHeader(event, 'authorization') || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!accessToken) {
    throw createError({ statusCode: 401, message: 'Missing session' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnon)
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    throw createError({ statusCode: 401, message: 'Invalid session' })
  }

  const body = await readBody(event).catch(() => null) as {
    to?: string
    language?: string
    summary?: string
  } | null

  const toRaw = typeof body?.to === 'string' ? body.to.replace(/\s/g, '') : ''
  if (!E164.test(toRaw)) {
    throw createError({
      statusCode: 400,
      message: 'Invalid phone number (E.164, e.g. +523310001774 for WhatsApp)',
    })
  }
  const to = toWhatsappChannel(toRaw)

  const es = body?.language === 'es'
  const summary = (body?.summary || '').slice(0, 80)
  const msg = es
    ? `¡Hola! NiikSkate: recibimos tu compra de clases${summary ? ` (${summary})` : ''}. Gracias — un administrador confirmará el pago si aplica y te verás reflejado en la app.`
    : `Hi! NiikSkate: we received your class purchase${summary ? ` (${summary})` : ''}. Thanks — an admin will confirm payment if needed and you’ll see it in the app.`

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`
  const basic = Buffer.from(`${sid}:${token}`).toString('base64')

  const form = new URLSearchParams()
  form.set('To', to)
  form.set('From', from)
  form.set('Body', msg.slice(0, 1600))

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })

  const twilioBody = await res.text()
  if (!res.ok) {
    console.error('Twilio WhatsApp error:', res.status, twilioBody)
    throw createError({
      statusCode: 502,
      message: 'WhatsApp provider rejected the request',
    })
  }

  return { ok: true }
})
