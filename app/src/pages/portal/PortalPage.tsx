import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError, assetUrl, icsUrl, setSpeakerToken } from '../../api'
import type { Asset, PortalMe } from '../../types'
import { fmtBytes, fmtDate, isOverdue } from '../../lib'
import {
  Avatar, Badge, Button, Card, EmptyState, Field, Input, Progress, Spinner, Textarea, useToast,
} from '../../components/ui'
import { STATUS_BADGE, STATUS_LABELS } from '../../types'

const TOKEN_KEY = 'gr-speaker-token'

export function PortalPage() {
  const [params] = useSearchParams()
  const toast = useToast()
  const [me, setMe] = useState<PortalMe | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const token = params.get('token') ?? localStorage.getItem(TOKEN_KEY)
    if (!token) { setErr('missing'); return }
    localStorage.setItem(TOKEN_KEY, token)
    setSpeakerToken(token)
    api.portalMe().then(setMe).catch((e) => {
      setErr(e instanceof ApiError && e.status === 401 ? 'invalid' : 'load')
    })
  }, [params])

  if (err === 'missing' || err === 'invalid') {
    return (
      <Shell>
        <EmptyState glyph="🔑" title={err === 'missing' ? 'This portal needs your personal link' : 'This link is no longer valid'}>
          Use the magic link from your confirmation email. Lost it? Contact the organizers and they’ll resend it.
        </EmptyState>
      </Shell>
    )
  }
  if (err) return <Shell><EmptyState glyph="⚠️" title="Could not load your portal">Try again in a minute.</EmptyState></Shell>
  if (!me) return <Shell><Spinner label="Loading your portal…" /></Shell>

  const done = me.tasks.filter((t) => t.done).length
  const headshot = me.assets.find((a) => a.kind === 'headshot')

  return (
    <Shell>
      <header className="row" style={{ marginBottom: 20, gap: 14 }}>
        <Avatar name={me.speaker.name} src={headshot ? assetUrl(headshot.id) : null} size={52} />
        <div className="grow">
          <h1>Hi, {me.speaker.name.split(' ')[0]} 👋</h1>
          <p className="muted small">{me.event.name} · {fmtDate(me.event.starts_on)}–{fmtDate(me.event.ends_on, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </header>

      <div className="stack" style={{ gap: 16 }}>
        <Card title={`Onboarding checklist — ${done}/${me.tasks.length} done`}>
          <Progress value={done} max={me.tasks.length} />
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 14 }} className="stack">
            {me.tasks.map((t) => {
              const overdue = !t.done && isOverdue(t.due_at)
              return (
                <li key={t.key} className="spread" style={{ gap: 10 }}>
                  <span className="row" style={{ gap: 9 }}>
                    <span aria-hidden style={{
                      width: 20, height: 20, borderRadius: '50%', flex: 'none',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
                      background: t.done ? 'var(--ok-soft)' : 'var(--surface-3)',
                      color: t.done ? 'var(--ok)' : 'var(--faint)',
                    }}>{t.done ? '✓' : ''}</span>
                    <span style={{ textDecoration: t.done ? 'line-through' : undefined }}>
                      {t.label}
                      {!t.required && <span className="faint small"> (optional)</span>}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    {overdue
                      ? <Badge tone="badge-danger">overdue · was due {fmtDate(t.due_at)}</Badge>
                      : t.due_at && !t.done ? <span className="faint small">due {fmtDate(t.due_at)}</span> : null}
                    {!t.done && !['headshot', 'slides', 'bio'].includes(t.key) && (
                      <MarkDone taskKey={t.key} onDone={setMe} />
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>

        <ProfileCard me={me} onSaved={(m) => { setMe(m); toast('Profile saved ✓') }} />

        <Card title="Files">
          <div className="stack" style={{ gap: 14 }}>
            <UploadRow label="Headshot" hint="Square JPG/PNG, ≥800px. Shown in the public speaker gallery."
              kind="headshot" accept="image/*" assets={me.assets} onChange={setMe} />
            <UploadRow label="Slides" hint="PDF preferred, 16:9." kind="slides"
              accept=".pdf,.key,.pptx,application/pdf" assets={me.assets} onChange={setMe} />
            <UploadRow label="Supporting documents" hint="Anything else the organizers should have."
              kind="document" accept="*/*" assets={me.assets} onChange={setMe} />
          </div>
        </Card>

        <Card title="Your submissions">
          {me.submissions.length === 0
            ? <EmptyState glyph="📝" title="No submissions yet" />
            : (
              <ul style={{ listStyle: 'none', padding: 0 }} className="stack">
                {me.submissions.map((s) => (
                  <li key={s.id} className="spread">
                    <span className="grow">
                      <strong>{s.title}</strong>
                      {s.track && <span className="muted small"> · {s.track}</span>}
                    </span>
                    <Badge tone={STATUS_BADGE[s.status]}>{STATUS_LABELS[s.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          {me.submissions.some((s) => s.status === 'accepted') && (
            <p className="small muted" style={{ marginTop: 12 }}>
              📆 <a href={icsUrl(me.speaker.id, localStorage.getItem(TOKEN_KEY) ?? '')}>
                Add your talks to your calendar (.ics)
              </a>
            </p>
          )}
        </Card>
      </div>
    </Shell>
  )
}

function MarkDone({ taskKey, onDone }: { taskKey: string; onDone: (m: PortalMe) => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button size="sm" busy={busy} onClick={async () => {
      setBusy(true)
      try { onDone(await api.portalTaskDone(taskKey)) } finally { setBusy(false) }
    }}>
      Mark done
    </Button>
  )
}

function ProfileCard({ me, onSaved }: { me: PortalMe; onSaved: (m: PortalMe) => void }) {
  const [form, setForm] = useState({
    name: me.speaker.name,
    tagline: me.speaker.tagline ?? '',
    company: me.speaker.company ?? '',
    bio: me.speaker.bio ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try { onSaved(await api.portalUpdate(form)) } finally { setBusy(false) }
  }

  return (
    <Card title="Your profile">
      <form onSubmit={save}>
        <div style={{ display: 'grid', gap: '0 16px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Field label="Name" required><Input value={form.name} onChange={set('name')} required /></Field>
          <Field label="Company / affiliation"><Input value={form.company} onChange={set('company')} /></Field>
        </div>
        <Field label="Tagline" hint="One line under your name in the program. e.g. “Distributed-systems engineer chasing tail latencies”">
          <Input value={form.tagline} onChange={set('tagline')} maxLength={90} />
        </Field>
        <Field label="Bio" hint="Third person, 2–4 sentences.">
          <Textarea value={form.bio} onChange={set('bio')} />
        </Field>
        <Button variant="primary" busy={busy}>Save profile</Button>
      </form>
    </Card>
  )
}

function UploadRow({ label, hint, kind, accept, assets, onChange }: {
  label: string; hint: string; kind: Asset['kind']; accept: string
  assets: Asset[]; onChange: (m: PortalMe) => void
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const mine = assets.filter((a) => a.kind === kind)

  async function upload(file: File) {
    setBusy(true)
    try {
      await api.portalUpload(kind, file)
      onChange(await api.portalMe())
      toast(`${label} uploaded ✓`)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'storage_not_configured') {
        toast('File storage isn’t configured on this deployment yet — the organizers have been notified of everything else you completed.', { error: true })
      } else {
        toast('Upload failed — try again', { error: true })
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <div className="spread">
        <div>
          <strong className="small">{label}</strong>
          <p className="faint small">{hint}</p>
        </div>
        <Button size="sm" busy={busy} onClick={() => inputRef.current?.click()}>Upload</Button>
        <input ref={inputRef} type="file" accept={accept} hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
      </div>
      {mine.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }} className="stack">
          {mine.map((a) => (
            <li key={a.id} className="spread small" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: '6px 10px' }}>
              <span className="truncate">📎 {a.filename} <span className="faint">({fmtBytes(a.size)})</span></span>
              <Button size="sm" variant="ghost" aria-label={`Remove ${a.filename}`} onClick={async () => {
                await api.portalDeleteAsset(a.id)
                onChange(await api.portalMe())
              }}>✕</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px 80px' }}>
      {children}
      <footer className="faint small" style={{ textAlign: 'center', marginTop: 40 }}>
        Powered by <Link to="/">GreenRoom</Link>
      </footer>
    </main>
  )
}
