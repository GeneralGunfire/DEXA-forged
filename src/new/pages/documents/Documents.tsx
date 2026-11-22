import { useMemo, useState, type FormEvent } from 'react'
import { ChevronRight, Download, ExternalLink, FileText, Pencil, RefreshCw, Search, Upload } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { ACCEPT_DOC, checkFile, describe, downloadFile, fileKind, fmtBytes, fmtDate, unwrap, uploadFile, useLoad, useTeam } from '../../../lib/data'
import { btn, btnGhost, btnPrimary, field, label, todayKey } from '../calendar/cal'
import { MACHINES } from '../databases/shared'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { FileField } from '@/components/ui/file-field'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import { Viewer, canView, ext, type ViewDoc } from './Viewer'

type Table = 'db_documents' | 'documents'
type Db = { id: string; name: string; machine: string }
/** One file, from either table. db_documents hold a document date; the older documents table uses the day it was added. */
type Row = {
  key: string; table: Table; id: string; database_id: string | null; name: string; description: string; path: string; mime: string | null; size: number | null
  is_current: boolean; replaces_id: string | null; entry_id: string | null; date: string; created_by: string | null; made_by: string
}

const EMPTY = 'No documents yet. The database and estate PDFs are being rebuilt from the verified records.'
const NOT_SET = 'Machine not set'
const stripExt = (n: string) => n.replace(/\.[^.]+$/, '')
const TYPES = ['PDF', 'Word', 'Video', 'Image', 'File']

type Raw = Record<string, unknown>
const toRow = (table: Table, r: Raw): Row => ({
  key: `${table}:${r.id}`, table, id: String(r.id), database_id: (r.database_id as string | null) ?? null,
  name: String(r.name ?? ''), description: String(r.description ?? ''), path: String(r.path ?? ''), mime: (r.mime as string | null) ?? null, size: (r.size as number | null) ?? null,
  is_current: r.is_current !== false, replaces_id: (r.replaces_id as string | null) ?? null, entry_id: (r.entry_id as string | null) ?? null,
  date: String(table === 'db_documents' ? r.document_date ?? r.created_at : r.created_at), created_by: (r.created_by as string | null) ?? null, made_by: String(r.made_by ?? ''),
})

export default function Documents() {
  const team = useTeam()
  const dbs = useLoad<Db[]>(async () => unwrap<Db[]>(await supabase.from('databases').select('id, name, machine').order('name')) ?? [])
  const docs = useLoad<Row[]>(async () => {
    const [a, b] = await Promise.all([
      supabase.from('db_documents').select('*').order('created_at', { ascending: false }).limit(5000),
      supabase.from('documents').select('*').order('created_at', { ascending: false }).limit(5000),
    ])
    if (a.error) throw a.error
    return [...((a.data ?? []) as Raw[]).map((r) => toRow('db_documents', r)), ...(b.error ? [] : ((b.data ?? []) as Raw[]).map((r) => toRow('documents', r)))]
  })

  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [scope, setScope] = useState('all')
  const [form, setForm] = useState<{ doc?: Row; replace?: boolean } | 'new' | null>(null)
  const [viewing, setViewing] = useState<ViewDoc | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const all = docs.data ?? []
  const dbList = dbs.data ?? []
  const dbName = (id: string | null) => (id ? dbList.find((d) => d.id === id)?.name ?? 'Database' : 'Estate')
  const byKey = useMemo(() => new Map(all.map((d) => [d.key, d])), [all])
  const earlier = (d: Row) => {
    const out: Row[] = []
    let cur = d.replaces_id ? byKey.get(`${d.table}:${d.replaces_id}`) : undefined
    while (cur && out.length < 50) { out.push(cur); cur = cur.replaces_id ? byKey.get(`${cur.table}:${cur.replaces_id}`) : undefined }
    return out
  }

  const needle = q.trim().toLowerCase()
  const shown = all.filter((d) => d.is_current
    && (type === 'all' || fileKind(d.mime, d.path) === type)
    && (scope === 'all' || (scope === 'estate' ? !d.database_id : d.database_id === scope))
    && (!needle || `${d.name} ${d.description} ${dbName(d.database_id)}`.toLowerCase().includes(needle)))

  // Estate first, then databases by machine (Rajen's PC, Huzayfa's laptop, others, not set), A to Z inside each
  const groups = useMemo(() => {
    const extra = Array.from(new Set(dbList.map((d) => d.machine.trim()).filter((m) => m && !MACHINES.includes(m)))).sort()
    const order = [...MACHINES, ...extra, ''].flatMap((m) => dbList.filter((d) => d.machine.trim() === m).sort((a, b) => a.name.localeCompare(b.name)))
    const g: { id: string; title: string; sub: string; list: Row[] }[] = [{ id: 'estate', title: 'Estate', sub: 'Whole estate', list: shown.filter((d) => !d.database_id) }]
    for (const d of order) g.push({ id: d.id, title: d.name, sub: d.machine.trim() || NOT_SET, list: shown.filter((x) => x.database_id === d.id) })
    return g.filter((x) => x.list.length > 0).map((x) => ({ ...x, list: [...x.list].sort((a, b) => b.date.localeCompare(a.date)) }))
  }, [shown, dbList])

  const view = (d: ViewDoc) => { if (canView(d)) { setViewing(d); setMsg(null) } }
  const download = async (d: { name: string; path: string }) => { try { await downloadFile(d.path, `${d.name}.${ext(d.path)}`); setMsg(null) } catch (e) { setMsg(describe(e)) } }
  const loading = (docs.loading && !docs.data) || (dbs.loading && !dbs.data)
  const error = docs.error || dbs.error
  const who = (d: Row) => d.made_by || team.name(d.created_by)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Documentation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Documents</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Every document in the estate, grouped by database. Replacing a file keeps the old one as an earlier copy.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => { docs.reload(); dbs.reload() }} disabled={docs.loading || dbs.loading}>
            <RefreshCw className={cn('size-4', (docs.loading || dbs.loading) && 'animate-spin')} aria-hidden="true" /> Refresh
          </button>
          <button type="button" className={btnPrimary} onClick={() => setForm('new')}><Upload className="size-4" aria-hidden="true" /> Upload document</button>
        </div>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <div className="relative min-w-52 max-w-sm flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" className={cn(field, 'h-9 pl-9')} placeholder="Search documents" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-40" aria-label="Filter by type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...TYPES.map((t) => ({ value: t, label: t }))]} />
        <Select className="w-56" aria-label="Filter by database" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All databases' }, { value: 'estate', label: 'Estate' }, ...dbList.map((d) => ({ value: d.id, label: d.name }))]} />
      </div>
      {msg ? <Note>{msg}</Note> : null}

      <div className="mt-8">
        {error ? <p className="text-sm text-destructive" role="alert">Could not load the documents: {error}</p>
          : loading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><FileText aria-hidden="true" className="size-6" /></span>
              <p className="mx-auto mt-5 max-w-md text-base leading-7 text-muted-foreground">{all.some((d) => d.is_current) ? 'No documents match your search or filters.' : EMPTY}</p>
            </div>
          ) : (
            <div className="space-y-10">
              {groups.map((g) => (
                <section key={g.id} aria-label={g.title} className="border-t border-border pt-5">
                  <h2 className="flex flex-wrap items-baseline gap-x-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {g.title}<span className="tabular-nums normal-case tracking-normal">{g.list.length}</span>
                    {g.id !== 'estate' ? <span className="normal-case tracking-normal text-muted-foreground/70">{g.sub}</span> : null}
                  </h2>
                  <ul className="mt-3 divide-y divide-border border-y border-border">
                    {g.list.map((d) => {
                      const old = earlier(d)
                      return (
                        <li key={d.key} className="py-4">
                          <div className="flex flex-wrap items-start gap-4">
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary text-[10px] font-semibold tracking-wide text-muted-foreground">{fileKind(d.mime, d.path).toUpperCase().slice(0, 4)}</span>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium">{d.name}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">{[fileKind(d.mime, d.path), fmtBytes(d.size), fmtDate(d.date), who(d) && `by ${who(d)}`, dbName(d.database_id)].filter(Boolean).join(' · ')}</p>
                              {d.description ? <p className="mt-2 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{d.description}</p> : null}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {canView(d) ? <button type="button" className={cn(btn, '!h-8')} onClick={() => view(d)}><ExternalLink className="size-3.5" aria-hidden="true" /> View</button> : null}
                              <button type="button" className={cn(btn, '!h-8')} onClick={() => download(d)}><Download className="size-3.5" aria-hidden="true" /> Download</button>
                              <button type="button" className={cn(btnGhost, '!h-8 !px-2')} onClick={() => setForm({ doc: d, replace: true })}><Upload className="size-3.5" aria-hidden="true" /> Replace</button>
                              <button type="button" className={cn(btnGhost, '!h-8 !px-2')} onClick={() => setForm({ doc: d })}><Pencil className="size-3.5" aria-hidden="true" /> Edit details</button>
                            </div>
                          </div>
                          {old.length ? <Earlier list={old} onView={view} onDownload={download} /> : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
      </div>

      {form ? (
        <DocForm
          key={form === 'new' ? 'new' : `${form.doc?.key}${form.replace}`}
          doc={form === 'new' ? undefined : form.doc}
          replace={form !== 'new' && !!form.replace}
          dbs={dbList}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); docs.reload() }}
        />
      ) : null}
      <Viewer doc={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

function Earlier({ list, onView, onDownload }: { list: Row[]; onView: (d: Row) => void; onDownload: (d: Row) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 pl-14">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform', open && 'rotate-90')} /> Earlier copies ({list.length})
      </button>
      {open ? (
        <ul className="mt-2 divide-y divide-border/60">
          {list.map((o) => (
            <li key={o.key} className="flex flex-wrap items-center gap-3 py-2 text-xs">
              <span className="text-muted-foreground">{fmtDate(o.date)} · {fmtBytes(o.size)}</span>
              <span className="ml-auto flex gap-1">
                {canView(o) ? <button type="button" className={cn(btnGhost, '!h-7 !px-2 text-xs')} onClick={() => onView(o)}>View</button> : null}
                <button type="button" className={cn(btnGhost, '!h-7 !px-2 text-xs')} onClick={() => onDownload(o)}>Download</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function DocForm({ doc, replace, dbs, onClose, onDone }: { doc?: Row; replace: boolean; dbs: Db[]; onClose: () => void; onDone: () => void }) {
  const needsFile = !doc || replace
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState(doc?.name ?? '')
  const [desc, setDesc] = useState(doc?.description ?? '')
  const [where, setWhere] = useState(doc ? doc.database_id ?? 'estate' : 'estate')
  const [date, setDate] = useState(doc && !replace && doc.table === 'db_documents' ? doc.date.slice(0, 10) : todayKey())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const databaseId = where === 'estate' ? null : where
  // a database's documents live in db_documents; whole-estate ones in the documents table
  const table: Table = doc ? doc.table : databaseId ? 'db_documents' : 'documents'
  const dated = table === 'db_documents'

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (busy) return
    const base = { name: name.trim(), description: desc.trim() }
    if (!base.name) return setErr('Give the document a name.')
    if (needsFile) {
      if (!file) return setErr('Choose a file.')
      const bad = checkFile(file, ACCEPT_DOC)
      if (bad) return setErr(bad)
    }
    setBusy(true); setErr(null)
    try {
      if (needsFile && file) {
        const up = await uploadFile(file, databaseId ? `databases/${databaseId}` : 'documents')
        const row = { ...base, database_id: databaseId, path: up.path, mime: up.mime || null, size: up.size, replaces_id: doc?.id ?? null, ...(dated ? { document_date: date || todayKey(), entry_id: doc?.entry_id ?? null } : {}) }
        const ins = unwrap(await supabase.from(table).insert(row).select('id').single()) as { id: string } | null
        if (doc && ins) unwrap(await supabase.from(table).update({ is_current: false }).eq('id', doc.id))
      } else if (doc) {
        unwrap(await supabase.from(table).update({ ...base, ...(dated ? { document_date: date || todayKey() } : {}) }).eq('id', doc.id))
      }
      onDone()
    } catch (e) { setErr(describe(e)); setBusy(false) }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={!doc ? 'Upload document' : replace ? 'Replace file' : 'Edit details'}
      notice={err}
      footer={
        <>
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" form="lib-doc-form" className={btnPrimary} disabled={busy}>{busy ? (needsFile ? 'Uploading…' : 'Saving…') : replace ? 'Replace file' : doc ? 'Save' : 'Upload'}</button>
        </>
      }
    >
      <form id="lib-doc-form" onSubmit={submit} className="space-y-5">
        {needsFile ? (
          <div>
            <span className={label}>{replace ? 'New file' : 'File'}</span>
            <FileField file={file} accept={ACCEPT_DOC} hint={replace ? 'The current file is kept as an earlier copy.' : 'PDF, Word, MP4, JPEG or PNG. Up to 50 MB.'}
              onChange={(f) => { setFile(f); if (f && !doc) setName(stripExt(f.name)) }} />
          </div>
        ) : null}
        <div>
          <label className={label} htmlFor="ld-name">Name</label>
          <input id="ld-name" data-autofocus={!needsFile ? true : undefined} className={field} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          <p className="mt-1.5 text-xs text-muted-foreground">Do not put version numbers in the name. Replacing the file keeps the earlier copies.</p>
        </div>
        {!doc ? (
          <div>
            <label className={label} htmlFor="ld-where">Belongs to</label>
            <Select id="ld-where" value={where} onChange={setWhere} options={[{ value: 'estate', label: 'Estate (no database)' }, ...dbs.map((d) => ({ value: d.id, label: d.name }))]} />
          </div>
        ) : null}
        <div>
          <label className={label} htmlFor="ld-desc">Description (optional)</label>
          <textarea id="ld-desc" className={cn(field, 'min-h-20 resize-y')} value={desc} maxLength={2000} onChange={(e) => setDesc(e.target.value)} />
        </div>
        {dated ? (
          <div className="sm:w-1/2">
            <label className={label} htmlFor="ld-date">Document date</label>
            <DatePicker id="ld-date" value={date} onChange={(v) => setDate(v || todayKey())} />
          </div>
        ) : null}
      </form>
    </Dialog>
  )
}
