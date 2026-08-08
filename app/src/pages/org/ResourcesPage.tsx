import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useOrg } from './OrgLayout'
import type { Resource } from '../../types'
import { embedHtml, md } from '../../lib'
import { Badge, Button, Card, EmptyState, Field, Input, Spinner, Textarea, useToast } from '../../components/ui'

export function ResourcesPage() {
  const { event } = useOrg()
  const toast = useToast()
  const [list, setList] = useState<Resource[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Resource> | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.listResources(event.id).then(setList) }, [event.id])

  const current = list?.find((r) => r.id === sel) ?? null

  function edit(r: Resource | null) {
    setSel(r?.id ?? null)
    setDraft(r ? { ...r } : { title: '', slug: '', body_md: '', embed_html: '', is_public: 1 })
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    try {
      // whitelisted body only — unknown top-level keys are a 400 (pinned decision #5)
      const body = {
        title: draft.title ?? '', slug: draft.slug ?? '', body_md: draft.body_md ?? '',
        embed_html: draft.embed_html || null, is_public: draft.is_public ?? 0,
      }
      if (sel) {
        const updated = await api.updateResource(sel, body)
        setList((l) => l?.map((r) => (r.id === sel ? updated : r)) ?? null)
      } else {
        const created = await api.createResource(event.id, body)
        setList((l) => (l ? [...l, created] : [created]))
        setSel(created.id)
      }
      toast('Page saved ✓')
    } finally { setBusy(false) }
  }

  if (!list) return <Spinner />

  return (
    <>
      <div className="page-title">
        <h1>Resources</h1>
        <Button variant="primary" onClick={() => edit(null)}>New page</Button>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(180px, 250px) 1fr', alignItems: 'start' }}>
        <Card pad={false}>
          {list.length === 0 ? <EmptyState glyph="📄" title="No pages yet" /> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 6 }}>
              {list.map((r) => (
                <li key={r.id}>
                  <button onClick={() => edit(r)} style={{
                    all: 'unset', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    width: '100%', boxSizing: 'border-box', padding: '8px 10px', cursor: 'pointer',
                    borderRadius: 'var(--r-md)', background: r.id === sel ? 'var(--accent-soft)' : undefined,
                  }}>
                    <span className="truncate small" style={{ fontWeight: r.id === sel ? 640 : 450 }}>{r.title}</span>
                    {!r.is_public && <Badge>private</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {draft ? (
          <div className="stack" style={{ gap: 16 }}>
            <Card title={sel ? 'Edit page' : 'New page'} actions={
              <div className="row">
                {sel && (
                  <Button size="sm" variant="danger" onClick={async () => {
                    await api.deleteResource(sel)
                    setList((l) => l?.filter((r) => r.id !== sel) ?? null)
                    setDraft(null); setSel(null)
                    toast('Page deleted')
                  }}>Delete</Button>
                )}
                <Button size="sm" variant="primary" busy={busy} onClick={save}>Save</Button>
              </div>
            }>
              <div style={{ display: 'grid', gap: '0 14px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <Field label="Title" required>
                  <Input value={draft.title ?? ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </Field>
                <Field label="Slug" hint="Used in the public URL.">
                  <Input value={draft.slug ?? ''} className="mono"
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value.replace(/[^a-z0-9-]/g, '-').toLowerCase() })} />
                </Field>
              </div>
              <label className="checkbox-row" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={!!draft.is_public}
                  onChange={(e) => setDraft({ ...draft, is_public: e.target.checked ? 1 : 0 })} />
                Public (visible to speakers and on public pages)
              </label>
              <Field label="Content (Markdown)">
                <Textarea value={draft.body_md ?? ''} style={{ minHeight: 220, fontFamily: 'var(--mono)', fontSize: '0.85rem' }}
                  onChange={(e) => setDraft({ ...draft, body_md: e.target.value })} />
              </Field>
              <Field label="HTML embed (optional)" hint="Raw HTML rendered below the content — maps, widgets, iframes.">
                <Textarea value={draft.embed_html ?? ''} style={{ minHeight: 90, fontFamily: 'var(--mono)', fontSize: '0.85rem' }}
                  onChange={(e) => setDraft({ ...draft, embed_html: e.target.value })} />
              </Field>
            </Card>

            <Card title="Preview">
              <div className="markdown" dangerouslySetInnerHTML={{ __html: md(draft.body_md ?? '') }} />
              {draft.embed_html && (
                <div style={{ marginTop: 14 }} dangerouslySetInnerHTML={{ __html: embedHtml(draft.embed_html) }} />
              )}
            </Card>
          </div>
        ) : (
          <Card><EmptyState glyph="👈" title="Pick a page to edit">Or create a new one — speaker guides, AV specs, venue maps.</EmptyState></Card>
        )}
      </div>
    </>
  )
}
