import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, ExternalLink, FileText, Pencil, Plus, RefreshCw, Search, Upload } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { ACCEPT_DOC, checkFile, describe, downloadFile, fileKind, fmtBytes, fmtDate, signedUrl, unwrap, uploadFile, useLoad } from '../../../lib/data'
import { btn, btnGhost, btnPrimary, field, label, todayKey } from '../calendar/cal'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { FileField } from '@/components/ui/file-field'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import type { Db } from './shared'

type Doc = {
  id: string; database_id: string; name: string; description: string; document_date: string; path: string; mime: string | null; size: number | null
  is_current: boolean; replaces_id: string | null; entry_id: string | null; created_at: string; reason?: string; tags?: string[]; made_by?: string
}
type EntryLite = { id: string; type: string; title: string }
type Legacy = { id: string; name: string; path: string; mime: string | null; size: number | null; created_at: string }

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '')
const ext = (d: { path: string }) => (d.path.split('.').pop() ?? '').toLowerCase()
const previewable = (d: Doc) => ['PDF', 'Image'].includes(fileKind(d.mime, d.path))

export function DocumentsTab({ db }: { db: Db }) {
  const docs = useLoad<Doc[]>(async () =>
    unwrap<Doc[]>(await supabase.from('db_documents').select('*').eq('database_id', db.id).order('document_date', { ascending: false }).order('created_at', { ascending: false })) ?? [], [db.id])
  const entries = useLoad<EntryLite[]>(async () =>
    unwrap<EntryLite[]>(await supabase.from('timeline_entries').select('id, type, title').eq('database_id', db.id).order('happened_at', { ascending: false }).limit(200)) ?? [], [db.id])
  // files uploaded before documents were dated, shown only if there are any
  const legacy = useLoad<Legacy[]>(async () => {
    const r = await supabase.from('documents').select('id, name, path, mime, size, created_at').eq('database_id', db.id).order('created_at', { ascending: false })
    return r.error ? [] : ((r.data ?? []) as Legacy[])
  }, [db.id])

  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ doc?: Doc; replace?: boolean } | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const all = docs.data ?? []
  const byId = useMemo(() => new Map(all.map((d) => [d.id, d])), [all])
  const current = all.filter((d) => d.is_current && d.name.toLowerCase().includes(q.trim().toLowerCase()))
  const earlier = (d: Doc) => {
    const out: Doc[] = []
    let cur = d.replaces_id ? byId.get(d.replaces_id) : undefined
    while (cur && out.length < 50) { out.push(cur); cur = cur.replaces_id ? byId.get(cur.replaces_id) : undefined }
    return out
  }
  const entryOf = (id: string | null) => entries.data?.find((e) => e.id === id)

  const view = async (d: { path: string }) => { try { window.open(await signedUrl(d.path), '_blank', 'noopener'); setMsg(null) } catch (e) { setMsg(describe(e)) } }
  const download = async (d: { name: string; path: string }) => { try { await downloadFile(d.path, `${d.name}.${ext(d)}`); setMsg(null) } catch (e) { setMsg(describe(e)) } }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 max-w-sm flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" className={cn(field, 'h-9 pl-9')} placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" className={btn} onClick={docs.reload} disabled={docs.loading}><RefreshCw className={cn('size-4', docs.loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
          <button type="button" className={btnPrimary} onClick={() => setForm('new')}><Upload className="size-4" aria-hidden="true" /> Upload document</button>
        </div>
      </div>
      {msg ? <Note>{msg}</Note> : null}

      <div className="mt-6">
        {docs.error ? <p className="text-sm text-destructive" role="alert">Could not load the documents: {docs.error}</p>
          : docs.loading && !docs.data ? <p className="text-sm text-muted-foreground">Loading…</p>
          : current.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><FileText aria-hidden="true" className="size-6" /></span>
              <p className="mt-5 text-lg font-medium">{all.length ? 'No documents match your search.' : 'No documents for this database yet.'}</p>
              {all.length ? null : (
                <>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Documents for {db.name} will appear here: PDFs, Word files, pictures and videos, each with its date and a link to the timeline entry that explains why it was made. Replacing a file keeps the old one as an earlier copy.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">PDF, Word, MP4, JPEG or PNG, up to 50 MB each. Counts and descriptions only: no patient data.</p>
                  <button type="button" className={cn(btnPrimary, 'mt-6')} onClick={() => setForm('new')}><Plus className="size-4" aria-hidden="true" /> Upload the first document</button>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {current.map((d) => {
                const old = earlier(d)
                const en = entryOf(d.entry_id)
                return (
                  <li key={d.id} className="py-4">
                    <div className="flex flex-wrap items-start gap-4">
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-[10px] font-semibold tracking-wide text-muted-foreground">{fileKind(d.mime, d.path).toUpperCase().slice(0, 4)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{d.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{[fmtDate(d.document_date), fmtBytes(d.size), ext(d).toUpperCase(), d.made_by && `by ${d.made_by}`].filter(Boolean).join(' · ')}</p>
                        {d.reason ? <p className="mt-1 break-words text-xs text-muted-foreground">Reason: {d.reason}</p> : null}
                        {d.description ? <p className="mt-2 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{d.description}</p> : null}
                        {d.tags?.length ? <p className="mt-2 flex flex-wrap gap-1.5">{d.tags.map((t) => <span key={t} className="rounded-full border border-border px-2 text-[11px] leading-5 text-muted-foreground">{t}</span>)}</p> : null}
                        {d.entry_id ? <p className="mt-2 text-xs text-muted-foreground">Linked to: <Link className="text-primary hover:underline" to={`/new/documentation/databases/${db.id}?tab=Timeline&entry=${d.entry_id}`}>{en?.title ?? 'a timeline entry'}</Link></p> : null}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {previewable(d) ? <button type="button" className={cn(btn, '!h-8')} onClick={() => view(d)}><ExternalLink className="size-3.5" aria-hidden="true" /> View</button> : null}
                        <button type="button" className={cn(btn, '!h-8')} onClick={() => download(d)}><Download className="size-3.5" aria-hidden="true" /> Download</button>
                        <button type="button" className={cn(btnGhost, '!h-8 !px-2')} onClick={() => setForm({ doc: d, replace: true })}><Upload className="size-3.5" aria-hidden="true" /> Replace</button>
                        <button type="button" className={cn(btnGhost, '!h-8 !px-2')} onClick={() => setForm({ doc: d })}><Pencil className="size-3.5" aria-hidden="true" /> Edit</button>
                      </div>
                    </div>
                    {old.length ? <Earlier list={old} onView={view} onDownload={download} /> : null}
                  </li>
                )
              })}
            </ul>
          )}
      </div>

      {legacy.data && legacy.data.length ? (
        <section className="mt-10 border-t border-border pt-5">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Earlier uploads <span className="ml-2 tabular-nums normal-case tracking-normal">{legacy.data.length}</span></h2>
          <ul className="divide-y divide-border border-y border-border">
            {legacy.data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1 break-words">{d.name}</span>
                <span className="text-xs text-muted-foreground">{[fmtDate(d.created_at), fmtBytes(d.size)].filter(Boolean).join(' · ')}</span>
                <button type="button" className={cn(btn, '!h-8')} onClick={() => download({ name: d.name, path: d.path })}><Download className="size-3.5" aria-hidden="true" /> Download</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {form ? (
        <DocForm
          key={form === 'new' ? 'new' : `${form.doc?.id}${form.replace}`}
          databaseId={db.id}
          doc={form === 'new' ? undefined : form.doc}
          replace={form !== 'new' && !!form.replace}
          entries={entries.data ?? []}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); docs.reload() }}
        />
      ) : null}
    </div>
  )
}

function Earlier({ list, onView, onDownload }: { list: Doc[]; onView: (d: Doc) => void; onDownload: (d: Doc) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 pl-14">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform', open && 'rotate-90')} /> Earlier copies ({list.length})
      </button>
      {open ? (
        <ul className="mt-2 divide-y divide-border/60">
          {list.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-xs">
              <span className="text-muted-foreground">{fmtDate(o.document_date)} · {fmtBytes(o.size)}</span>
              <span className="ml-auto flex gap-1">
                {previewable(o) ? <button type="button" className={cn(btnGhost, '!h-7 !px-2 text-xs')} onClick={() => onView(o)}>View</button> : null}
                <button type="button" className={cn(btnGhost, '!h-7 !px-2 text-xs')} onClick={() => onDownload(o)}>Download</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function DocForm({ databaseId, doc, replace, entries, onClose, onDone }: { databaseId: string; doc?: Doc; replace: boolean; entries: EntryLite[]; onClose: () => void; onDone: () => void }) {
  const needsFile = !doc || replace
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(doc?.name ?? '')
  const [desc, setDesc] = useState(doc?.description ?? '')
  const [date, setDate] = useState(replace ? todayKey() : doc?.document_date ?? todayKey())
  const [entry, setEntry] = useState(doc?.entry_id ?? '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (busy) return
    const row = { name: name.trim(), description: desc.trim(), document_date: date || todayKey(), entry_id: entry || null }
    if (!row.name) return setErr('Give the document a name.')
    if (needsFile) {
      if (!file) return setErr('Choose a file.')
      const bad = checkFile(file, ACCEPT_DOC)
      if (bad) return setErr(bad)
    }
    setBusy(true); setErr(null)
    try {
      if (needsFile && file) {
        const up = await uploadFile(file, `databases/${databaseId}`)
        const ins = unwrap(await supabase.from('db_documents').insert({ ...row, database_id: databaseId, path: up.path, mime: up.mime || null, size: up.size, replaces_id: doc?.id ?? null }).select('id').single()) as { id: string } | null
        if (doc && ins) unwrap(await supabase.from('db_documents').update({ is_current: false }).eq('id', doc.id))
      } else if (doc) {
        unwrap(await supabase.from('db_documents').update(row).eq('id', doc.id))
      }
      onDone()
    } catch (e) { setErr(describe(e)); setBusy(false) }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={!doc ? 'Upload document' : replace ? 'Replace file' : 'Edit document'}
      notice={err}
      footer={
        <>
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" form="doc-form" className={btnPrimary} disabled={busy}>{busy ? (needsFile ? 'Uploading…' : 'Saving…') : replace ? 'Replace file' : doc ? 'Save' : 'Upload'}</button>
        </>
      }
    >
      <form id="doc-form" onSubmit={submit} className="space-y-5">
        {needsFile ? (
          <div>
            <span className={label}>{replace ? 'New file' : 'File'}</span>
            <FileField file={file} accept={ACCEPT_DOC} hint={replace ? 'The current file is kept as an earlier copy.' : 'PDF, Word, MP4, JPEG or PNG. Up to 50 MB.'}
              onChange={(f) => { setFile(f); if (f && !doc) setName(stripExt(f.name)) }} />
          </div>
        ) : null}
        <div>
          <label className={label} htmlFor="dc-name">Name</label>
          <input id="dc-name" data-autofocus={!needsFile ? true : undefined} className={field} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="dc-desc">Description (optional)</label>
          <textarea id="dc-desc" className={cn(field, 'min-h-20 resize-y')} value={desc} maxLength={2000} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="dc-date">Document date</label>
            <DatePicker id="dc-date" value={date} onChange={(v) => setDate(v || todayKey())} />
            <p className="mt-1.5 text-xs text-muted-foreground">The date the document itself is from.</p>
          </div>
          <div>
            <label className={label} htmlFor="dc-entry">Linked timeline entry</label>
            <Select id="dc-entry" value={entry} onChange={setEntry} options={[{ value: '', label: 'Not linked' }, ...entries.map((e) => ({ value: e.id, label: `${e.type}: ${e.title}` }))]} />
          </div>
        </div>
      </form>
    </Dialog>
  )
}
