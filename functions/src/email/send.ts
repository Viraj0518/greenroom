// Shared "render + send + log" used by CFP confirmation and the comms batch route.

import type { Env, Speaker } from '../types'
import { getEmailProvider, type EmailAttachment } from './provider'
import { renderMarkdown, renderVars } from '../lib/markdown'
import { run, uuid, now } from '../lib/db'

export interface SpeakerEmailArgs {
  env: Env
  eventId: string
  speaker: Speaker
  templateKey: string
  subject: string
  bodyMd: string
  vars: Record<string, string | undefined>
  attachments?: EmailAttachment[]
}

export async function sendSpeakerEmail(args: SpeakerEmailArgs): Promise<{ ok: boolean; provider: string; error?: string }> {
  const provider = getEmailProvider(args.env)
  const subject = renderVars(args.subject, args.vars)
  const bodyMd = renderVars(args.bodyMd, args.vars)
  const html = renderMarkdown(bodyMd)

  const result = await provider.send({
    to: args.speaker.email,
    subject,
    html,
    text: bodyMd,
    attachments: args.attachments,
  })

  await run(
    args.env.DB,
    `INSERT INTO emails_log (id, event_id, speaker_id, template_key, subject, status, provider, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    uuid(),
    args.eventId,
    args.speaker.id,
    args.templateKey,
    subject,
    result.ok ? 'sent' : `failed: ${result.error ?? 'unknown'}`.slice(0, 300),
    result.provider,
    now()
  )
  return { ok: result.ok, provider: result.provider, error: result.error }
}

export function portalUrl(env: Env, requestUrl: string, speaker: Speaker): string {
  const base = env.APP_BASE_URL ?? new URL(requestUrl).origin
  return `${base}/portal?token=${speaker.magic_token}`
}

export function icsUrl(env: Env, requestUrl: string, speaker: Speaker): string {
  const base = env.APP_BASE_URL ?? new URL(requestUrl).origin
  return `${base}/api/public/ics/${speaker.id}.ics?token=${speaker.magic_token}`
}
