/**
 * Public custom-ramp enquiry from /skateramps.
 *
 * Runs with the service role so the table needs no anon INSERT policy and the
 * photos land in the images bucket without opening storage to the world.
 * The row is written first and email is best-effort: a Resend outage must not
 * cost NiikSkate a lead, the admin inbox is the source of truth.
 */

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml, sendMail } from '~/server/utils/sendMail'
import {
  RAMP_BUILD_TYPES,
  RAMP_BUILD_TYPE_OPTIONS,
  RAMP_REQUEST_MAX_PHOTOS,
  RAMP_SKILL_LEVELS,
  RAMP_SKILL_LEVEL_OPTIONS,
  RAMP_SURFACES,
  RAMP_SURFACE_OPTIONS,
  RAMP_TIMELINES,
  RAMP_TIMELINE_OPTIONS,
  rampOptionLabel,
  rampSpaceLabel,
} from '~/utils/skaterampRequests'

/** Compressed client-side to ~400 KB; this only guards against abuse. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

interface IncomingPhoto {
  name?: unknown
  type?: unknown
  data?: unknown
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function optionalText(value: unknown, maxLength: number): string | null {
  return text(value, maxLength) || null
}

function pick<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function positiveNumber(value: unknown, max: number): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(n) || n <= 0 || n > max) return null
  return n
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  // Honeypot: bots fill every field, humans never see this one.
  if (text(body?.company, 200)) return { ok: true as const, id: null }

  const fullName = text(body?.full_name, 120)
  const email = text(body?.email, 160).toLowerCase()
  const message = text(body?.message, 4000)

  if (!fullName) throw createError({ statusCode: 400, message: 'Name is required' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, message: 'A valid email is required' })
  }
  if (message.length < 10) {
    throw createError({ statusCode: 400, message: 'Tell us a bit more about the ramp' })
  }

  const photos: IncomingPhoto[] = Array.isArray(body?.photos)
    ? body.photos.slice(0, RAMP_REQUEST_MAX_PHOTOS)
    : []

  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string
  if (!supabaseUrl || !serviceKey) {
    throw createError({ statusCode: 500, message: 'Server missing Supabase configuration' })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const folder = randomUUID()
  const imageUrls: string[] = []

  for (const [index, photo] of photos.entries()) {
    const raw = typeof photo?.data === 'string' ? photo.data : ''
    if (!raw) continue
    // Accept both a bare base64 payload and a full data: URL.
    const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) continue
    if (buffer.length > MAX_PHOTO_BYTES) {
      throw createError({ statusCode: 413, message: 'One of the photos is too large' })
    }

    const contentType = typeof photo?.type === 'string' && photo.type.startsWith('image/')
      ? photo.type
      : 'image/jpeg'
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
    const path = `ramp-requests/${folder}/${index + 1}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(path, buffer, { contentType, upsert: false, cacheControl: '3600' })
    if (uploadError) {
      throw createError({ statusCode: 502, message: `Could not store photo: ${uploadError.message}` })
    }

    const { data: pub } = supabase.storage.from('images').getPublicUrl(path)
    if (pub?.publicUrl) imageUrls.push(pub.publicUrl)
  }

  const record = {
    full_name: fullName,
    email,
    phone: optionalText(body?.phone, 40),
    city: optionalText(body?.city, 120),
    ramp_type: pick(RAMP_BUILD_TYPES, body?.ramp_type),
    space_width_m: positiveNumber(body?.space_width_m, 9999),
    space_length_m: positiveNumber(body?.space_length_m, 9999),
    surface: pick(RAMP_SURFACES, body?.surface),
    skill_level: pick(RAMP_SKILL_LEVELS, body?.skill_level),
    budget_mxn: positiveNumber(body?.budget_mxn, 99999999),
    timeline: pick(RAMP_TIMELINES, body?.timeline),
    message,
    image_urls: imageUrls,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('skateramp_requests')
    .insert({ ...record, budget_mxn: record.budget_mxn ? Math.round(record.budget_mxn) : null })
    .select('id')
    .single()

  if (insertError) {
    throw createError({ statusCode: 500, message: `Could not save request: ${insertError.message}` })
  }

  const inbox = (config.contactInboxEmail as string)?.trim()
  let emailed = false
  let emailError: string | null = inbox ? null : 'CONTACT_INBOX_EMAIL is not set'

  if (inbox) {
    const rows: [string, string][] = [
      ['Nombre', fullName],
      ['Email', email],
      ['Teléfono', record.phone || '—'],
      ['Ciudad', record.city || '—'],
      ['Tipo de rampa', rampOptionLabel(RAMP_BUILD_TYPE_OPTIONS, record.ramp_type, true)],
      ['Espacio', rampSpaceLabel(record.space_width_m, record.space_length_m) || '—'],
      ['Superficie', rampOptionLabel(RAMP_SURFACE_OPTIONS, record.surface, true)],
      ['Nivel', rampOptionLabel(RAMP_SKILL_LEVEL_OPTIONS, record.skill_level, true)],
      [
        'Presupuesto',
        record.budget_mxn ? `$${Math.round(record.budget_mxn).toLocaleString('es-MX')} MXN` : '—',
      ],
      ['Cuándo', rampOptionLabel(RAMP_TIMELINE_OPTIONS, record.timeline, true)],
    ]

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:640px">
        <h2 style="margin:0 0 4px">Nueva solicitud de rampa</h2>
        <p style="margin:0 0 16px;color:#666;font-size:13px">
          Enviada desde niikskate.com/skateramps
        </p>
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
          ${rows
            .map(
              ([label, value]) => `<tr>
                <td style="border:1px solid #e5e5e5;background:#fafafa;font-weight:bold;width:170px">${escapeHtml(label)}</td>
                <td style="border:1px solid #e5e5e5">${escapeHtml(value)}</td>
              </tr>`,
            )
            .join('')}
        </table>
        <h3 style="margin:20px 0 6px;font-size:15px">Mensaje</h3>
        <p style="white-space:pre-wrap;font-size:14px;line-height:1.5;margin:0">${escapeHtml(message)}</p>
        ${
          imageUrls.length
            ? `<h3 style="margin:20px 0 6px;font-size:15px">Fotos (${imageUrls.length})</h3>
               ${imageUrls
                 .map(
                   url =>
                     `<a href="${escapeHtml(url)}"><img src="${escapeHtml(url)}" alt="" style="max-width:280px;border-radius:8px;margin:0 8px 8px 0" /></a>`,
                 )
                 .join('')}`
            : ''
        }
        <p style="margin:24px 0 0;font-size:13px;color:#666">
          También está en el panel admin: /member/admin/skateramp-requests
        </p>
      </div>
    `

    const result = await sendMail({
      to: inbox,
      subject: `Rampa a la medida — ${fullName}${record.city ? ` (${record.city})` : ''}`,
      html,
      replyTo: email,
    })
    emailed = result.sent

    if (!result.sent) {
      emailError = result.skipped
        ? 'Email is not configured on this deployment (RESEND_API_KEY / MAIL_FROM)'
        : result.error
      console.error('[skateramp-request] not emailed:', emailError)
    }
  }

  await supabase
    .from('skateramp_requests')
    .update({
      emailed_at: emailed ? new Date().toISOString() : null,
      email_error: emailError,
    })
    .eq('id', inserted.id)

  return { ok: true as const, id: inserted.id as string, emailed }
})
