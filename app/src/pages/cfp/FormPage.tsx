import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api'
import type { FieldSpec, PublicForm } from '../../types'
import { Button, Card, Field, Input, Select, Spinner, Textarea, EmptyState } from '../../components/ui'

type Answers = Record<string, unknown>

/** Evaluate a field's showIf condition against current answers. */
export function isVisible(f: FieldSpec, answers: Answers): boolean {
  if (!f.showIf) return true
  const v = answers[f.showIf.fieldId]
  switch (f.showIf.op) {
    case 'truthy': return !!v
    case 'eq': return v === f.showIf.value
    case 'neq': return v !== f.showIf.value
    case 'contains':
      return Array.isArray(v) ? v.includes(f.showIf.value) : String(v ?? '').includes(String(f.showIf.value ?? ''))
    default: return true
  }
}

function validateField(f: FieldSpec, v: unknown): string | null {
  const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0) || v === false
  if (f.required && empty) return 'This field is required.'
  if (empty) return null
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) return 'Enter a valid email address.'
  if (f.type === 'url' && !/^https?:\/\/.+/.test(String(v))) return 'Enter a full URL (starting with http:// or https://).'
  if (f.type === 'number' && Number.isNaN(Number(v))) return 'Enter a number.'
  return null
}

function FieldControl({ f, value, error, onChange }: {
  f: FieldSpec; value: unknown; error?: string; onChange: (v: unknown) => void
}) {
  const invalid = !!error
  switch (f.type) {
    case 'textarea':
      return <Textarea value={String(value ?? '')} invalid={invalid} placeholder={f.placeholder}
        onChange={(e) => onChange(e.target.value)} />
    case 'select':
      return (
        <Select value={String(value ?? '')} invalid={invalid} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      )
    case 'multiselect':
      return (
        <div className="stack" style={{ gap: 6 }}>
          {f.options?.map((o) => {
            const arr = Array.isArray(value) ? (value as string[]) : []
            return (
              <label key={o} className="checkbox-row">
                <input type="checkbox" checked={arr.includes(o)}
                  onChange={(e) => onChange(e.target.checked ? [...arr, o] : arr.filter((x) => x !== o))} />
                {o}
              </label>
            )
          })}
        </div>
      )
    case 'checkbox':
      return (
        <label className="checkbox-row">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span className="muted small">{f.hint ?? 'Yes'}</span>
        </label>
      )
    default:
      return <Input type={f.type === 'number' ? 'number' : 'text'} value={String(value ?? '')} invalid={invalid}
        placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />
  }
}

export function FormPage() {
  const { formId = '' } = useParams()
  const nav = useNavigate()
  const [form, setForm] = useState<PublicForm | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [speaker, setSpeaker] = useState({ name: '', email: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.publicForm(formId).then(setForm).catch((e) =>
      setLoadErr(e instanceof ApiError && e.status === 404 ? 'This form does not exist.' : 'Could not load the form.'))
  }, [formId])

  const visibleFields = useMemo(
    () => form?.spec.fields.filter((f) => isVisible(f, answers)) ?? [],
    [form, answers],
  )

  function setAnswer(id: string, v: unknown) {
    setAnswers((a) => ({ ...a, [id]: v }))
    setErrors((e) => { const { [id]: _drop, ...rest } = e; return rest })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const errs: Record<string, string> = {}
    if (!speaker.name.trim()) errs['speaker.name'] = 'This field is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(speaker.email)) errs['speaker.email'] = 'Enter a valid email address.'
    for (const f of visibleFields) {
      const err = validateField(f, answers[f.id])
      if (err) errs[f.id] = err
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    // only submit answers for visible fields — hidden conditional answers are dropped
    const payload: Answers = {}
    for (const f of visibleFields) if (answers[f.id] !== undefined) payload[f.id] = answers[f.id]
    setBusy(true)
    try {
      const res = await api.submitForm(form.id, { speaker, answers: payload })
      nav(`/f/${form.id}/success`, {
        state: {
          portal_url: res.portal_url, email_delivery: res.email_delivery,
          event: form.event.name, title: payload.title,
        },
      })
    } catch (err) {
      setErrors({ _form: err instanceof ApiError ? err.message : 'Submission failed — please try again.' })
    } finally {
      setBusy(false)
    }
  }

  if (loadErr) return <PublicShell><EmptyState glyph="🤷" title={loadErr} /></PublicShell>
  if (!form) return <PublicShell><Spinner label="Loading form…" /></PublicShell>

  if (!form.is_open) {
    return (
      <PublicShell>
        <EmptyState glyph="🔒" title="This call for speakers is closed">
          Follow {form.event.name} for future announcements.
        </EmptyState>
      </PublicShell>
    )
  }

  return (
    <PublicShell>
      <header style={{ marginBottom: 22 }}>
        <p className="muted small" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {form.event.name}
        </p>
        <h1>{form.name}</h1>
      </header>

      <form onSubmit={submit} noValidate className="stack" style={{ gap: 16 }}>
        <Card title="About you" className="stack" >
          <Field label="Your name" required error={errors['speaker.name']}>
            <Input value={speaker.name} invalid={!!errors['speaker.name']} autoComplete="name"
              onChange={(e) => setSpeaker((s) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Field label="Email" required error={errors['speaker.email']}
            hint="We’ll send your confirmation and portal link here.">
            <Input type="email" value={speaker.email} invalid={!!errors['speaker.email']} autoComplete="email"
              onChange={(e) => setSpeaker((s) => ({ ...s, email: e.target.value }))} />
          </Field>
        </Card>

        <Card title="Your proposal" className="stack" >
          {visibleFields.map((f) => (
            f.type === 'checkbox'
              ? (
                <div className="field" key={f.id}>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={!!answers[f.id]} onChange={(e) => setAnswer(f.id, e.target.checked)} />
                    <span>{f.label}{f.required && <span className="req">*</span>}</span>
                  </label>
                  {errors[f.id] && <span className="error" role="alert">{errors[f.id]}</span>}
                </div>
              )
              : (
                <Field key={f.id} label={f.label} required={f.required} hint={f.hint} error={errors[f.id]}>
                  <FieldControl f={f} value={answers[f.id]} error={errors[f.id]} onChange={(v) => setAnswer(f.id, v)} />
                </Field>
              )
          ))}
        </Card>

        {errors._form && <p className="error" role="alert" style={{ color: 'var(--danger)', marginBottom: 10 }}>{errors._form}</p>}
        <Button variant="primary" busy={busy} style={{ width: '100%', padding: '11px' }}>
          Submit proposal
        </Button>
        <p className="faint small" style={{ textAlign: 'center', marginTop: 10 }}>
          You can edit your profile after submitting via your speaker portal link.
        </p>
      </form>
    </PublicShell>
  )
}

// Pinned decision #8: the success screen ALWAYS presents the portal link
// prominently; copy varies on how the confirmation email was delivered.
export function FormSuccessPage() {
  const { state } = useLocation() as {
    state?: { portal_url?: string; email_delivery?: 'logged' | 'real'; event?: string; title?: unknown }
  }
  const portalUrl = state?.portal_url ?? '/portal'
  const emailed = state?.email_delivery === 'real'
  return (
    <PublicShell>
      <div className="empty" style={{ paddingTop: 60 }}>
        <div style={{ fontSize: '2.6rem' }} aria-hidden>🎉</div>
        <h1>Proposal received!</h1>
        <p className="muted" style={{ maxWidth: 440 }}>
          {typeof state?.title === 'string' && state.title
            ? <>Thanks for submitting <strong>“{state.title}”</strong>{state?.event ? <> to {state.event}</> : null}.</>
            : 'Thanks for your submission.'}
        </p>
        <Link to={portalUrl} className="btn btn-primary" style={{ marginTop: 12, padding: '11px 22px' }}>
          Go to your speaker portal →
        </Link>
        <p className="small muted" style={{ maxWidth: 420 }}>
          {emailed
            ? <>We’ve also emailed this link to you — either one works.</>
            : <><strong>Save this link</strong> — it’s your portal access. You’ll use it to manage your
              bio, headshot, slides, and onboarding tasks.</>}
        </p>
      </div>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px 80px' }}>
      {children}
      <footer className="faint small" style={{ textAlign: 'center', marginTop: 40 }}>
        Powered by <Link to="/">GreenRoom</Link>
      </footer>
    </main>
  )
}
