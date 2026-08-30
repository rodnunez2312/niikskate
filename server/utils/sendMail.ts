/**
 * Transactional email via Resend.
 *
 * Called over plain fetch like the Twilio integration, so there is no SDK
 * dependency. Never throws: callers treat mail as best-effort so a delivery
 * problem cannot lose a customer enquiry that is already stored in Postgres.
 */

export interface MailMessage {
  to: string
  subject: string
  html: string
  /** So hitting Reply in the inbox answers the customer, not the sender domain. */
  replyTo?: string
}

export type MailResult =
  | { sent: true }
  | { sent: false; skipped: true }
  | { sent: false; skipped?: false; error: string }

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const config = useRuntimeConfig()
  const apiKey = (config.resendApiKey as string)?.trim()
  const from = (config.mailFrom as string)?.trim()

  if (!apiKey || !from) return { sent: false, skipped: true }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    })

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      return { sent: false, error: `Resend ${res.status}: ${detail}` }
    }
    return { sent: true }
  } catch (e: unknown) {
    return { sent: false, error: e instanceof Error ? e.message : 'Mail transport failed' }
  }
}
