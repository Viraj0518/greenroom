import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { Integration } from '../../types'
import { fmtDateTime } from '../../lib'
import { Badge, Button, Card, Field, Input, useToast } from '../../components/ui'

export function SettingsPage() {
  const { event } = useOrg()
  return (
    <>
      <div className="page-title"><h1>Settings & integrations</h1></div>
      <div className="stack" style={{ gap: 16 }}>
        <Card title="Event">
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0 }} className="small">
            <dt className="muted">Name</dt><dd style={{ margin: 0 }}>{event.name}</dd>
            <dt className="muted">Slug</dt><dd style={{ margin: 0 }} className="mono">{event.slug}</dd>
            <dt className="muted">Dates</dt><dd style={{ margin: 0 }}>{event.starts_on} → {event.ends_on} ({event.timezone})</dd>
            <dt className="muted">Embeds</dt>
            <dd style={{ margin: 0 }} className="mono">
              /embed/speakers/{event.slug}<br />/embed/schedule/{event.slug}
            </dd>
          </dl>
        </Card>
        {/* config keys are the backend's canonical camelCase (CONFIG_SCHEMA) */}
        <IntegrationCard eventId={event.id} kind="accelevents" title="Accelevents"
          hint="One-way push of speakers and sessions into your Accelevents event."
          fields={[{ key: 'apiKey', label: 'API key', secret: true }, { key: 'eventId', label: 'Accelevents event ID' }]} />
        <IntegrationCard eventId={event.id} kind="airtable" title="Airtable"
          hint="Mirror speakers, submissions, and schedule into an Airtable base."
          fields={[{ key: 'apiKey', label: 'Personal access token', secret: true }, { key: 'baseId', label: 'Base ID' }]} />
      </div>
    </>
  )
}

function IntegrationCard({ eventId, kind, title, hint, fields }: {
  eventId: string; kind: string; title: string; hint: string
  fields: Array<{ key: string; label: string; secret?: boolean }>
}) {
  const toast = useToast()
  const [integ, setInteg] = useState<Integration | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'save' | 'sync' | null>(null)

  useEffect(() => { api.getIntegration(eventId, kind).then(setInteg).catch(() => {}) }, [eventId, kind])

  const configured = !!integ?.configured

  return (
    <Card title={<span>{title} {configured ? <Badge tone="badge-ok">configured</Badge> : <Badge>not configured</Badge>}</span>}
      actions={configured && (
        <Button size="sm" busy={busy === 'sync'} onClick={async () => {
          setBusy('sync')
          try {
            const res = await api.syncIntegration(eventId, kind)
            const pushedMsg = typeof res.pushed === 'object' && res.pushed
              ? Object.entries(res.pushed).map(([k, v]) => `${v} ${k}`).join(', ')
              : String(res.pushed ?? 0)
            toast(!res.ok
              ? `${title} sync failed: ${res.error ?? 'unknown error'}`
              : res.skipped
                ? `${title}: ${res.reason ?? 'skipped'}`
                : `${title}: pushed ${pushedMsg}`,
            { error: !res.ok })
            setInteg(await api.getIntegration(eventId, kind))
          } finally { setBusy(null) }
        }}>Sync now</Button>
      )}>
      <p className="muted small" style={{ marginBottom: 12 }}>{hint}</p>
      <div style={{ display: 'grid', gap: '0 14px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.secret ? 'Write-only — never shown again.' : undefined}>
            <Input type={f.secret ? 'password' : 'text'} value={form[f.key] ?? ''}
              placeholder={configured && f.secret ? '••••••••' : undefined}
              onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))} />
          </Field>
        ))}
      </div>
      <div className="row-wrap">
        <Button variant="primary" busy={busy === 'save'} onClick={async () => {
          setBusy('save')
          try {
            setInteg(await api.putIntegration(eventId, kind, form))
            toast(`${title} saved ✓`)
          } finally { setBusy(null) }
        }}>Save configuration</Button>
        {integ?.last_synced_at && (
          <span className="faint small">Last synced {fmtDateTime(integ.last_synced_at)} · {integ.last_status}</span>
        )}
      </div>
    </Card>
  )
}
