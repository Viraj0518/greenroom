import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { FieldSpec, FieldType, FormDef, FormSpec, RoutingRule, Track } from '../../types'
import { formSpec } from '../../types'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, useToast } from '../../components/ui'

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'email', 'url', 'number', 'select', 'multiselect', 'checkbox']

export function FormsPage() {
  const { event } = useOrg()
  const toast = useToast()
  const [forms, setForms] = useState<FormDef[] | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [editing, setEditing] = useState<FormDef | null>(null)

  useEffect(() => {
    api.listForms(event.id).then(setForms)
    api.listTracks(event.id).then(setTracks)
  }, [event.id])

  if (!forms) return <Spinner />

  async function createForm() {
    const created = await api.createForm(event.id, {
      name: 'New CFP form',
      is_open: 0,
      spec: {
        fields: [
          { id: 'title', type: 'text', label: 'Talk title', required: true },
          { id: 'abstract', type: 'textarea', label: 'Abstract', required: true },
        ],
        routing: [],
      },
    })
    setForms((f) => (f ? [...f, created] : [created]))
    setEditing(created)
  }

  return (
    <>
      <div className="page-title">
        <h1>CFP forms</h1>
        <Button variant="primary" onClick={createForm}>New form</Button>
      </div>

      {forms.length === 0 ? <EmptyState glyph="⊞" title="No forms yet" /> : (
        <div className="stack">
          {forms.map((f) => {
            const spec = formSpec(f)
            return (
              <Card key={f.id}>
                <div className="spread" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <strong>{f.name}</strong>{' '}
                    {f.is_open ? <Badge tone="badge-ok">open</Badge> : <Badge>closed</Badge>}
                    <p className="muted small" style={{ marginTop: 3 }}>
                      {spec.fields.length} fields · {spec.fields.filter((x) => x.showIf).length} conditional ·{' '}
                      {spec.routing.length} routing rule{spec.routing.length === 1 ? '' : 's'} ·{' '}
                      public link: <Link to={`/f/${f.id}`} className="mono small">/f/{f.id}</Link>
                    </p>
                  </div>
                  <div className="row">
                    <Button size="sm" onClick={async () => {
                      const updated = await api.updateForm(f.id, { is_open: f.is_open ? 0 : 1 })
                      setForms((fs) => fs?.map((x) => (x.id === f.id ? { ...x, ...updated } : x)) ?? null)
                      toast(updated.is_open ? 'Form opened' : 'Form closed')
                    }}>
                      {f.is_open ? 'Close' : 'Open'}
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setEditing(f)}>Edit fields</Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <FormBuilder form={editing} tracks={tracks} onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setForms((fs) => fs?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
            setEditing(null)
            toast('Form saved ✓')
          }} />
      )}
    </>
  )
}

function FormBuilder({ form, tracks, onClose, onSaved }: {
  form: FormDef; tracks: Track[]; onClose: () => void; onSaved: (f: FormDef) => void
}) {
  const [name, setName] = useState(form.name)
  const [spec, setSpec] = useState<FormSpec>(() => structuredClone(formSpec(form)))
  const [busy, setBusy] = useState(false)

  const categoryField = spec.fields.find((f) => f.id === 'category')

  function updateField(i: number, patch: Partial<FieldSpec>) {
    setSpec((s) => ({ ...s, fields: s.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }))
  }
  function move(i: number, dir: -1 | 1) {
    setSpec((s) => {
      const fields = [...s.fields]
      const j = i + dir
      if (j < 0 || j >= fields.length) return s
      ;[fields[i], fields[j]] = [fields[j], fields[i]]
      return { ...s, fields }
    })
  }
  function addField() {
    const idBase = 'question'
    let n = 1
    while (spec.fields.some((f) => f.id === `${idBase}_${n}`)) n++
    setSpec((s) => ({ ...s, fields: [...s.fields, { id: `${idBase}_${n}`, type: 'text', label: 'New question' }] }))
  }
  function updateRule(i: number, patch: Partial<RoutingRule>) {
    setSpec((s) => ({ ...s, routing: s.routing.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))
  }

  // reserved id 'title' must exist and be required (pinned decision 2026-08-08)
  const titleOk = spec.fields.some((f) => f.id === 'title' && f.required)

  async function save() {
    setBusy(true)
    try {
      const updated = await api.updateForm(form.id, { name, spec })
      onSaved({ ...form, ...updated, name, spec })
    } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="Form builder" wide footer={
      <>
        {!titleOk
          ? <span className="small" style={{ color: 'var(--danger)' }}>A required field with id “title” is mandatory.</span>
          : <span className="faint small">Reserved ids: title, abstract, category</span>}
        <Button variant="primary" busy={busy} disabled={!titleOk} onClick={save}>Save form</Button>
      </>
    }>
      <div className="stack" style={{ gap: 16 }}>
        <Field label="Form name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div>
          <h3 style={{ marginBottom: 8 }}>Fields</h3>
          <div className="stack">
            {spec.fields.map((f, i) => (
              <div key={i} className="card card-pad" style={{ padding: 12 }}>
                <div className="row-wrap" style={{ marginBottom: 8 }}>
                  <Input value={f.id} className="mono" style={{ width: 140 }} aria-label="Field id"
                    disabled={['title', 'abstract', 'category'].includes(f.id)}
                    onChange={(e) => updateField(i, { id: e.target.value.replace(/\W/g, '_') })} />
                  <Select value={f.type} style={{ width: 130 }} aria-label="Field type"
                    onChange={(e) => updateField(i, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                  <Input value={f.label} className="grow" aria-label="Label"
                    onChange={(e) => updateField(i, { label: e.target.value })} />
                  <label className="checkbox-row small">
                    <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                    required
                  </label>
                  <span className="row" style={{ gap: 2 }}>
                    <Button size="sm" variant="ghost" onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
                    <Button size="sm" variant="ghost" onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
                    <Button size="sm" variant="ghost" aria-label="Remove field"
                      disabled={f.id === 'title'}
                      onClick={() => setSpec((s) => ({ ...s, fields: s.fields.filter((_, j) => j !== i) }))}>✕</Button>
                  </span>
                </div>

                {(f.type === 'select' || f.type === 'multiselect') && (
                  <Field label="Options (one per line)">
                    <textarea className="textarea" style={{ minHeight: 70, fontFamily: 'var(--mono)', fontSize: '0.82rem' }}
                      value={(f.options ?? []).join('\n')}
                      onChange={(e) => updateField(i, { options: e.target.value.split('\n').filter(Boolean) })} />
                  </Field>
                )}

                <details>
                  <summary className="small muted" style={{ cursor: 'pointer' }}>
                    Conditional visibility {f.showIf ? `— shows when ${f.showIf.fieldId} ${f.showIf.op} ${f.showIf.value ?? ''}` : ''}
                  </summary>
                  <div className="row-wrap" style={{ marginTop: 8 }}>
                    <Select value={f.showIf?.fieldId ?? ''} style={{ width: 160 }} aria-label="Controlling field"
                      onChange={(e) => updateField(i, {
                        showIf: e.target.value ? { fieldId: e.target.value, op: f.showIf?.op ?? 'eq', value: f.showIf?.value } : undefined,
                      })}>
                      <option value="">Always visible</option>
                      {spec.fields.filter((x, j) => j !== i).map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
                    </Select>
                    {f.showIf && (
                      <>
                        <Select value={f.showIf.op} style={{ width: 110 }} aria-label="Operator"
                          onChange={(e) => updateField(i, { showIf: { ...f.showIf!, op: e.target.value as NonNullable<FieldSpec['showIf']>['op'] } })}>
                          <option value="eq">equals</option>
                          <option value="neq">not equals</option>
                          <option value="contains">contains</option>
                          <option value="truthy">is checked</option>
                        </Select>
                        {f.showIf.op !== 'truthy' && (
                          <Input value={String(f.showIf.value ?? '')} style={{ width: 180 }} aria-label="Comparison value"
                            onChange={(e) => updateField(i, { showIf: { ...f.showIf!, value: e.target.value } })} />
                        )}
                      </>
                    )}
                  </div>
                </details>
              </div>
            ))}
            <Button onClick={addField}>+ Add field</Button>
          </div>
        </div>

        <div>
          <h3 style={{ marginBottom: 4 }}>Category → track routing</h3>
          <p className="muted small" style={{ marginBottom: 8 }}>
            {categoryField
              ? 'When a submission’s category matches, it’s automatically assigned to the track.'
              : 'Add a select field with id “category” to enable routing.'}
          </p>
          {categoryField && (
            <div className="stack">
              {spec.routing.map((r, i) => (
                <div key={i} className="row-wrap">
                  <Select value={r.whenCategory} style={{ width: 200 }} aria-label="Category"
                    onChange={(e) => updateRule(i, { whenCategory: e.target.value })}>
                    <option value="">Choose category…</option>
                    {categoryField.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                  <span className="muted">→</span>
                  <Select value={r.assignTrack} style={{ width: 180 }} aria-label="Track"
                    onChange={(e) => updateRule(i, { assignTrack: e.target.value })}>
                    <option value="">Choose track…</option>
                    {tracks.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </Select>
                  <Button size="sm" variant="ghost" aria-label="Remove rule"
                    onClick={() => setSpec((s) => ({ ...s, routing: s.routing.filter((_, j) => j !== i) }))}>✕</Button>
                </div>
              ))}
              <Button size="sm" onClick={() => setSpec((s) => ({ ...s, routing: [...s.routing, { whenCategory: '', assignTrack: '' }] }))}>
                + Add rule
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
