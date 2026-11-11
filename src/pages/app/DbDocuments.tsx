import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  ACCEPT_DOC, checkFile, describe, downloadFile, fileKind, fmtBytes, fmtDate, removeFiles, todayStr, unwrap, uploadFile,
  useLoad,
} from '../../lib/data'
import type { Entry } from '../../lib/timeline'
import { Dialog, EmptyState, Field, LoadState } from '../../components/ui'
import { DocViewer } from '../../components/DocViewer'
import './pages.css'
import './timeline.css'
import { useFeedback } from '../../components/feedback'

type Doc = {
  id: string; database_id: string; name: string; description: string; document_date: string
  path: string; mime: string | null; size: number | null; is_current: boolean
  replaces_id: string | null; entry_id: string | null; created_at: string
}

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '')
const previewable = (d: Doc) => ['PDF', 'Image'].includes(fileKind(d.mime, d.path))
const ext = (d: Doc) => (d.path.split('.').pop() ?? '').toLowerCase()
const fileName = (d: Doc) => `${d.name}.${ext(d)}`

/** Documents tab of a database record. A replaced file stays as an "earlier copy", shown by date. */
export function DbDocuments({ databaseId }: { databaseId: string }) {
  const { confirm, toast } = useFeedback()
  const [params] = useSearchParams()
  const focus = params.get('doc')
  const { data, error, loading, reload } = useLoad<Doc[]>(async () =>
    unwrap<Doc[]>(await supabase.from('db_documents').select('*').eq('database_id', databaseId)
      .order('document_date', { ascending: false }).order('created_at', { ascending: false })) ?? [], [databaseId])
  const entries = useLoad<Entry[]>(async () =>
    unwrap<Entry[]>(await supabase.from('timeline_entries').select('*').eq('database_id', databaseId).order('happened_at', { ascending: false }).limit(300)) ?? [], [databaseId])

  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ doc?: Doc; replace?: boolean } | 'new' | null>(null)
  const [preview, setPreview] = useState<Doc | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const all = data ?? []
  const byId = useMemo(() => new Map(all.map((d) => [d.id, d])), [all])
  const current = all.filter((d) => d.is_current && d.name.toLowerCase().includes(q.trim().toLowerCase()))
  /** Earlier copies: follow replaces_id back from the current file. */
  const earlier = (d: Doc) => {
    const out: Doc[] = []
    let cur = d.replaces_id ? byId.get(d.replaces_id) : undefined
    while (cur && out.length < 50) { out.push(cur); cur = cur.replaces_id ? byId.get(cur.replaces_id) : undefined }
    return out
  }
  const entryTitle = (id: string | null) => entries.data?.find((e) => e.id === id)

  useEffect(() => {
    if (!focus || loading) return
    const el = document.getElementById(`d-${focus}`)
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('is-flash'); const t = setTimeout(() => el.classList.remove('is-flash'), 2400); return () => clearTimeout(t) }
  }, [focus, loading, data])

  async function download(d: Doc) { try { await downloadFile(d.path, fileName(d)); setMsg(null) } catch (e) { setMsg(describe(e)) } }
  async function remove(d: Doc) {
    const chain = earlier(d)
    const extra = chain.length ? ` Its ${chain.length} earlier ${chain.length === 1 ? 'copy' : 'copies'} will be deleted too.` : ''
    if (!await confirm(`Delete "${d.name}"?${extra} This cannot be undone.`)) return
    try {
      const rows = [d, ...chain]
      unwrap(await supabase.from('db_documents').delete().in('id', rows.map((r) => r.id)))
      await removeFiles(rows.map((r) => r.path))
      setMsg(null); reload(); toast('Document deleted')
    } catch (e) { setMsg(describe(e)) }
  }

  return (
    <>
      <div className="tl-bar">
        <input className="search tl-search" type="search" placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn btn--dark" onClick={() => setForm('new')}>Upload document</button>
      </div>
      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <LoadState loading={loading && !data} error={error}>
        {current.length === 0 ? (
          <EmptyState
            title={all.length ? 'No documents match your search.' : 'No documents for this database yet.'}
            text={all.length ? undefined : 'Upload PDF, Word, MP4, JPEG or PNG files, up to 50 MB each.'}
          />
        ) : (
          <div className="rows">
            {current.map((d) => {
              const old = earlier(d)
              const en = entryTitle(d.entry_id)
              return (
                <article className="dd-item" id={`d-${d.id}`} key={d.id}>
                  <div className="dd-row">
                    <span className="item__ico">{fileKind(d.mime, d.path).toUpperCase().slice(0, 4)}</span>
                    <div className="item__main">
                      <p className="item__title" title={d.name}>{d.name}</p>
                      <p className="item__meta">{[fmtDate(d.document_date), fmtBytes(d.size), ext(d).toUpperCase()].filter(Boolean).join(' · ')}</p>
                    </div>
                    <div className="item__acts">
                      {previewable(d) && <button type="button" className="btn btn--sm btn--dark" onClick={() => setPreview(d)}>View</button>}
                      <button type="button" className="btn btn--sm" onClick={() => download(d)}>Download</button>
                      <button type="button" className="btn btn--sm" onClick={() => setForm({ doc: d, replace: true })}>Replace file</button>
                      <button type="button" className="btn btn--sm" onClick={() => setForm({ doc: d })}>Edit</button>
                      <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(d)}>Delete</button>
                    </div>
                  </div>
                  {d.description && <p className="dd-desc">{d.description}</p>}
                  {d.entry_id && (
                    <p className="dd-entry">
                      Linked to timeline entry:{' '}
                      <Link to={`/app/databases/${databaseId}?tab=Timeline&entry=${d.entry_id}`}>{en?.title ?? 'view entry'}</Link>
                    </p>
                  )}
                  {old.length > 0 && (
                    <details className="dd-earlier">
                      <summary>Earlier copies ({old.length})</summary>
                      <ul>
                        {old.map((o) => (
                          <li key={o.id}>
                            <span>{fmtDate(o.document_date)}</span><span>{fmtBytes(o.size)}</span>
                            <span className="item__acts">
                              {previewable(o) && <button type="button" className="btn btn--sm" onClick={() => setPreview(o)}>View</button>}
                              <button type="button" className="btn btn--sm" onClick={() => download(o)}>Download</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </LoadState>

      <Dialog open={!!form} onClose={() => setForm(null)}
        title={form === 'new' ? 'Upload document' : form?.replace ? 'Replace file' : 'Edit document'}>
        {form && (
          <DocForm
            key={form === 'new' ? 'new' : `${form.doc?.id}${form.replace}`}
            databaseId={databaseId} doc={form === 'new' ? undefined : form.doc} replace={form !== 'new' && !!form.replace}
            entries={entries.data ?? []} onClose={() => setForm(null)} onDone={() => { reload(); toast('Document saved') }}
          />
        )}
      </Dialog>

      <DocViewer doc={preview ? { name: preview.name, path: preview.path, mime: preview.mime } : null} onClose={() => setPreview(null)} />
    </>
  )
}

function DocForm({
  databaseId, doc, replace, entries, onClose, onDone,
}: { databaseId: string; doc?: Doc; replace: boolean; entries: Entry[]; onClose: () => void; onDone: () => void }) {
  const needsFile = !doc || replace
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(doc?.name ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const row = {
      name: name.trim(),
      description: String(fd.get('description') ?? '').trim(),
      document_date: String(fd.get('date') ?? '') || todayStr(),
      entry_id: String(fd.get('entry') ?? '') || null,
    }
    if (!row.name) return setErr('Give the document a name.')
    if (needsFile) {
      if (!file) return setErr('Choose a file.')
      const bad = checkFile(file, ACCEPT_DOC)
      if (bad) return setErr(bad)
    }
    setBusy(true)
    let uploaded: string | null = null
    try {
      if (needsFile && file) {
        const up = await uploadFile(file, `databases/${databaseId}`)
        uploaded = up.path
        const ins = unwrap(await supabase.from('db_documents').insert({
          ...row, database_id: databaseId, path: up.path, mime: up.mime || null, size: up.size, replaces_id: doc?.id ?? null,
        }).select('id').single()) as { id: string } | null
        if (doc && ins) unwrap(await supabase.from('db_documents').update({ is_current: false }).eq('id', doc.id))
      } else if (doc) {
        unwrap(await supabase.from('db_documents').update(row).eq('id', doc.id))
      }
      onDone(); onClose()
    } catch (ex) {
      if (uploaded) await removeFiles([uploaded])   // do not leave an orphan file behind
      setErr(describe(ex))
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      {needsFile && (
        <Field label={replace ? 'New file' : 'File'} hint={replace ? 'The current file is kept as an earlier copy.' : 'PDF, Word, MP4, JPEG or PNG. Up to 50 MB.'}>
          <input type="file" accept={ACCEPT_DOC} onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !doc) setName(stripExt(f.name))
          }} />
        </Field>
      )}
      <Field label="Name"><input type="text" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoFocus={!needsFile} /></Field>
      <Field label="Description (optional)"><textarea name="description" rows={3} maxLength={2000} defaultValue={doc?.description ?? ''} /></Field>
      <div className="row2">
        <Field label="Document date" hint="The date the document itself is from.">
          <input type="date" name="date" defaultValue={replace ? todayStr() : doc?.document_date ?? todayStr()} />
        </Field>
        <Field label="Linked timeline entry (optional)">
          <select name="entry" defaultValue={doc?.entry_id ?? ''}>
            <option value="">Not linked</option>
            {entries.slice(0, 200).map((e) => <option key={e.id} value={e.id}>{e.type}: {e.title}</option>)}
          </select>
        </Field>
      </div>
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? (needsFile ? 'Uploading…' : 'Saving…') : replace ? 'Replace file' : doc ? 'Save' : 'Upload'}</button>
      </div>
    </form>
  )
}
