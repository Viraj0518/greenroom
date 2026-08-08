import type { Env } from '../types'

export interface EmailAttachment {
  filename: string
  content_b64: string
  content_type: string
}

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
  attachments?: EmailAttachment[]
}

export interface EmailResult {
  ok: boolean
  provider: string
  id?: string
  error?: string
}

export interface EmailProvider {
  name: string
  send(msg: EmailMessage): Promise<EmailResult>
}

const DEFAULT_FROM = 'GreenRoom <onboarding@resend.dev>'

/** Dev/default adapter: logs the email instead of sending it. */
export const consoleProvider: EmailProvider = {
  name: 'console',
  async send(msg) {
    console.log(
      `[email:console] to=${msg.to} subject=${JSON.stringify(msg.subject)}` +
        (msg.attachments?.length ? ` attachments=${msg.attachments.map((a) => a.filename).join(',')}` : '')
    )
    console.log(msg.text ?? msg.html)
    return { ok: true, provider: 'console' }
  },
}

export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: 'resend',
    async send(msg) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [msg.to],
            subject: msg.subject,
            html: msg.html,
            text: msg.text,
            attachments: msg.attachments?.map((a) => ({
              filename: a.filename,
              content: a.content_b64,
              content_type: a.content_type,
            })),
          }),
        })
        if (!res.ok) {
          const body = await res.text()
          return { ok: false, provider: 'resend', error: `HTTP ${res.status}: ${body.slice(0, 300)}` }
        }
        const data = (await res.json()) as { id?: string }
        return { ok: true, provider: 'resend', id: data.id }
      } catch (err) {
        return { ok: false, provider: 'resend', error: String(err) }
      }
    },
  }
}

export function getEmailProvider(env: Env): EmailProvider {
  if (env.RESEND_API_KEY) {
    return resendProvider(env.RESEND_API_KEY, env.EMAIL_FROM ?? DEFAULT_FROM)
  }
  return consoleProvider
}
