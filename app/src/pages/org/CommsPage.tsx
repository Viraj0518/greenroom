import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { EmailLogRow, EmailTemplate, Speaker, Submission } from '../../types'
import { fmtDateTime, md, renderVars } from '../../lib'
import { STATUS_LABELS } from '../../types'
import {
  Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Tabs, Textarea, useToast,
} from '../../components/ui'

type Tab = 'templates' | 'log'

export function CommsPage() {
  const { event } = useOrg()
  const [tab, setTab] = useState<Tab>('templates')
  return (
    <>
      <div className="page-title"><h1>Communications</h1></div>
      <Tabs value={tab} onChange={setTab}
        tabs={[{ key: 'templates', label: 'Templates & sending' }, { key: 'log', label: 'Email log' }]} />
      <div style={{ marginTop: 16 }}>
        {tab === 'templates' ? <TemplatesTab eventId={event.id} /> : <LogTab eventId={event.id} />}
      </div>
    </>
  )
}

const SAMPLE_VARS = {
  name: 'Ada Okafor',
  talk_title: 'Taming Tail Latency: p999 in Practice',
  portal_url: 'https://your-event.example/portal?token=…',
  due_date: 'Oct 1',
}

function TemplatesTab({ eventId }: { eventId: string }) {
  const toast = useToast()
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null)
  const [sel, setSel] = useState<string>('')
  const [draft, setDraft] = useState<{ subject: string; body_md: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)

  useEffect(() => {
    api.listTemplates(eventId).then((ts) => {
      setTemplates(ts)
      if (ts.length > 0) setSel((cur) => cur || ts[0].id)
    })
  }, [eventId])

  const tpl = templates?.find((t) => t.id === sel)
  useEffect(() => {
    if (tpl) setDraft({ subject: tpl.subject, body_md: tpl.body_md })
  }, [tpl?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!templates) return <Spinner />
  if (templates.length === 0) return <EmptyState glyph="✉️" title="No templates yet" />

  const dirty = tpl && draft && (draft.subject !== tpl.subject || draft.body_md !== tpl.body_md)

  async function save() {
    if (!tpl || !draft) return
    setBusy(true)
    try {
      const updated = await api.updateTemplate(tpl.id, draft)
      setTemplates((ts) => ts?.map((t) => (t.id === tpl.id ? updated : t)) ?? null)
      toast('Template saved ✓')
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row-wrap">
        <Select value={sel} onChange={(e) => setSel(e.target.value)} style={{ maxWidth: 280 }} aria-label="Template">
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.key})</option>)}
        </Select>
        <span className="grow" />
        <Button variant="primary" onClick={() => setSendOpen(true)}>Send batch…</Button>
      </div>

      {tpl && draft && (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start' }}>
          <Card title="Edit template" actions={dirty ? <Button size="sm" variant="primary" busy={busy} onClick={save}>Save</Button> : <span className="faint small">saved</span>}>
            <Field label="Subject">
              <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </Field>
            <Field label="Body (Markdown)" hint="Variables: {{name}}, {{talk_title}}, {{portal_url}}, {{due_date}}">
              <Textarea value={draft.body_md} style={{ minHeight: 260, fontFamily: 'var(--mono)', fontSize: '0.85rem' }}
                onChange={(e) => setDraft({ ...draft, body_md: e.target.value })} />
            </Field>
          </Card>
          <Card title="Preview" actions={<span className="faint small">sample data</span>}>
            <p className="small" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 10 }}>
              <span className="muted">Subject: </span><strong>{renderVars(draft.subject, SAMPLE_VARS)}</strong>
            </p>
            <div className="markdown small" dangerouslySetInnerHTML={{ __html: md(renderVars(draft.body_md, SAMPLE_VARS)) }} />
          </Card>
        </div>
      )}

      {tpl && <SendModal open={sendOpen} onClose={() => setSendOpen(false)} eventId={eventId} tpl={tpl} />}
    </div>
  )
}

function SendModal({ open, onClose, eventId, tpl }: {
  open: boolean; onClose: () => void; eventId: string; tpl: EmailTemplate
}) {
  const toast = useToast()
  const [mode, setMode] = useState<'status' | 'pick'>('status')
  const [status, setStatus] = useState('accepted')
  const [subs, setSubs] = useState<Submission[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [includeIcs, setIncludeIcs] = useState(tpl.key === 'schedule_invite')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) api.listSubmissions(eventId).then(setSubs)
  }, [open, eventId])

  const bySpeaker = useMemo(() => {
    const m = new Map<string, { name: string; ids: string[] }>()
    for (const s of subs) {
      const cur = m.get(s.speaker_id) ?? { name: s.speaker_name ?? '?', ids: [] }
      cur.ids.push(s.id)
      m.set(s.speaker_id, cur)
    }
    return [...m.entries()]
  }, [subs])

  const statusCount = useMemo(
    () => new Set(subs.filter((s) => s.status === status).map((s) => s.speaker_id)).size,
    [subs, status],
  )

  async function send() {
    setBusy(true)
    try {
      const res = await api.sendEmails(eventId, {
        template_key: tpl.key,
        ...(mode === 'status' ? { filter: { status } } : { speaker_ids: [...picked] }),
        include_ics: includeIcs,
      })
      toast(`Sent ${res.sent} email${res.sent === 1 ? '' : 's'}${res.errors.length ? ` — ${res.errors.length} failed` : ''}`,
        { error: res.errors.length > 0 })
      onClose()
    } catch {
      toast('Send failed', { error: true })
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Send “${tpl.name}”`}
      footer={
        <>
          <label className="checkbox-row small">
            <input type="checkbox" checked={includeIcs} onChange={(e) => setIncludeIcs(e.target.checked)} />
            Attach calendar invite (.ics)
          </label>
          <Button variant="primary" busy={busy} onClick={send}
            disabled={mode === 'pick' && picked.size === 0}>
            Send {mode === 'status' ? `to ${statusCount} speaker${statusCount === 1 ? '' : 's'}` : `to ${picked.size} selected`}
          </Button>
        </>
      }>
      <div className="stack">
        <div className="row">
          <label className="checkbox-row"><input type="radio" checked={mode === 'status'} onChange={() => setMode('status')} /> By submission status</label>
          <label className="checkbox-row"><input type="radio" checked={mode === 'pick'} onChange={() => setMode('pick')} /> Pick speakers</label>
        </div>
        {mode === 'status' ? (
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        ) : (
          <div style={{ maxHeight: 240, overflowY: 'auto' }} className="stack">
            {bySpeaker.map(([spId, info]) => (
              <label key={spId} className="checkbox-row">
                <input type="checkbox" checked={picked.has(spId)}
                  onChange={(e) => setPicked((p) => {
                    const next = new Set(p)
                    if (e.target.checked) next.add(spId); else next.delete(spId)
                    return next
                  })} />
                {info.name} <span className="faint small">({info.ids.length} submission{info.ids.length === 1 ? '' : 's'})</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

function LogTab({ eventId }: { eventId: string }) {
  const [log, setLog] = useState<EmailLogRow[] | null>(null)
  useEffect(() => { api.emailLog(eventId).then(setLog) }, [eventId])

  if (!log) return <Spinner />
  if (log.length === 0) return <EmptyState glyph="📭" title="No emails sent yet" />

  return (
    <Card pad={false}>
      <div className="table-wrap">
        <table className="gr">
          <thead><tr><th>To</th><th>Subject</th><th>Template</th><th>Status</th><th>Provider</th><th>When</th></tr></thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.id}>
                <td>{e.speaker_name ?? e.speaker_id}<div className="faint small">{e.speaker_email}</div></td>
                <td style={{ maxWidth: 300 }} className="truncate">{e.subject}</td>
                <td><Badge>{e.template_key}</Badge></td>
                <td><Badge tone={e.status === 'sent' ? 'badge-ok' : e.status === 'error' ? 'badge-danger' : ''}>{e.status}</Badge></td>
                <td className="muted small">{e.provider}</td>
                <td className="muted small">{fmtDateTime(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
