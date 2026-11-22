import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronRight, Plus, RefreshCw, Search, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { describe, unwrap, useLoad, useMe, useTeam } from '../../../lib/data'
import { checkRedaction } from '../../../lib/redact'
import { AUTHORS, filterEntries, NO_FILTERS, STATUSES, TYPES, type EntryType } from '../../../lib/timeline'
import { btn, btnGhost, btnPrimary, dateTimeLabel, field, fromInput, label, toInput } from '../calendar/cal'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { DateTimeField } from '@/components/ui/datetime-field'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import { ago, phaseName, TYPE_DOT, TYPE_ORDER, type Db, type Entry } from './shared'
import { Loading } from '@/components/ui/loading'

type Node = { entry: Entry; children: Node[] }
type DocLink = { id: string; name: string; entry_id: string }

const newest = (a: Entry, b: Entry) => b.happened_at.localeCompare(a.happened_at) || b.created_at.localeCompare(a.created_at)
const count = (n: Node): number => 1 + n.children.reduce((s, c) => s + count(c), 0)
const stamp = (n: Node): string => n.children.reduce((m, c) => (stamp(c) > m ? stamp(c) : m), n.entry.happened_at)

/** Chain replies under their parent. Top level newest first; replies oldest first so a chain reads in order. */
function threads(entries: Entry[]): Node[] {
  const ids = new Set(entries.map((e) => e.id))
  const kids = new Map<string, Entry[]>()
  const top: Entry[] = []
  for (const e of entries) {
    if (e.parent_id && ids.has(e.parent_id) && e.parent_id !== e.id) kids.set(e.parent_id, [...(kids.get(e.parent_id) ?? []), e])
    else top.push(e)
  }
  const seen = new Set<string>()
  const node = (e: Entry): Node => {
    seen.add(e.id)
    return { entry: e, children: (kids.get(e.id) ?? []).sort((a, b) => -newest(a, b)).filter((c) => !seen.has(c.id)).map(node) }
  }
  const out = top.sort(newest).map(node)
  for (const e of entries) if (!seen.has(e.id)) out.push(node(e)) // a loop of replies is surfaced rather than hidden
  return out
}

const TypeChip = ({ type, className }: { type: string; className?: string }) => (
  <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2 text-[11px] font-medium leading-5 text-foreground', className)}>
    <span aria-hidden="true" className={cn('size-1.5 rounded-full', TYPE_DOT[type] ?? 'bg-border')} />{type}
  </span>
)

/** `onlyPhase` limits the tab to one phase (the Work > Progress page passes '2'); `onLoaded` hands the loaded entries to the page. */
export function TimelineTab({ db, onlyPhase, onLoaded }: { db: Db; onlyPhase?: string; onLoaded?: (entries: Entry[]) => void }) {
  const me = useMe()
  const entries = useLoad<Entry[]>(async () => {
    let q = supabase.from('timeline_entries').select('*').eq('database_id', db.id)
    if (onlyPhase) q = q.eq('phase', onlyPhase)
    return unwrap<Entry[]>(await q.order('happened_at', { ascending: false }).limit(2000)) ?? []
  }, [db.id, onlyPhase])
  useEffect(() => { if (entries.data) onLoaded?.(entries.data) }, [entries.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const docs = useLoad<DocLink[]>(async () => {
    const r = await supabase.from('db_documents').select('id, name, entry_id').eq('database_id', db.id).eq('is_current', true).not('entry_id', 'is', null)
    return r.error ? [] : ((r.data ?? []) as DocLink[])
  }, [db.id])

  // Claude Code logs while it works, so new entries appear without a reload
  const { reload } = entries
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 20000)
    return () => clearInterval(t)
  }, [reload])

  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [author, setAuthor] = useState('')
  const [phase, setPhase] = useState('')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [fixedOpen, setFixedOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<{ entry?: Entry; preset?: Partial<Entry> } | null>(null)
  const [params] = useSearchParams()
  const focus = params.get('entry')
  const [flash, setFlash] = useState<string | null>(null)

  const all = entries.data ?? []
  const filtering = !!(q || type || author || phase)
  const shown = useMemo(() => filterEntries(all, { ...NO_FILTERS, q, type, author, phase }), [all, q, type, author, phase])
  const nodes = useMemo(() => threads(shown), [shown])

  const { openErrors, groups } = useMemo(() => {
    const isErr = (n: Node) => n.entry.type === 'Error'
    const openErrors = nodes.filter((n) => isErr(n) && n.entry.status !== 'Resolved')
    const by = new Map<string, { key: string; rest: Node[]; fixed: Node[]; last: string }>()
    for (const n of nodes) {
      if (isErr(n) && n.entry.status !== 'Resolved') continue
      const k = n.entry.phase || 'Other'
      const g = by.get(k) ?? { key: k, rest: [], fixed: [], last: '' }
      ;(isErr(n) ? g.fixed : g.rest).push(n)
      if (stamp(n) > g.last) g.last = stamp(n)
      by.set(k, g)
    }
    return { openErrors, groups: [...by.values()].sort((a, b) => b.last.localeCompare(a.last)) }
  }, [nodes])

  const toggle = (id: string) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const fromClaude = all.filter((e) => e.author === 'Claude Code').length
  const lastAny = all[0]
  const open = all.filter((e) => e.type === 'Error' && e.status !== 'Resolved').length

  const row = (n: Node, depth: number): React.ReactNode => (
    <Row key={n.entry.id} node={n} depth={depth} all={all} docs={docs.data ?? []} dbId={db.id} open={openIds.has(n.entry.id)} flash={flash === n.entry.id} onToggle={toggle} render={row}
      onEdit={(entry) => setEditing({ entry })} onReply={(parent, t) => setEditing({ preset: { parent_id: parent.id, type: t, phase: parent.phase } })} onChanged={reload} />
  )

  const clear = () => { setQ(''); setType(''); setAuthor(''); setPhase('') }

  // a link such as ?tab=Timeline&entry=<id> opens that entry, opens any collapsed group holding it, and scrolls to it
  useEffect(() => {
    if (!focus || entries.loading || all.length === 0) return
    const target = all.find((e) => e.id === focus)
    if (!target) return
    if (!shown.some((e) => e.id === focus)) { clear(); return } // a filter was hiding it; this runs again once the filters are clear
    let root = target
    while (root.parent_id) { const up = all.find((x) => x.id === root.parent_id); if (!up) break; root = up }
    if (root.type === 'Error' && root.status === 'Resolved') setFixedOpen((o) => ({ ...o, [root.phase || 'Other']: true }))
    setOpenIds((s) => new Set(s).add(focus))
    const t = setTimeout(() => {
      const el = document.getElementById(`e-${focus}`)
      if (!el) return
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' })
      setFlash(focus)
      setTimeout(() => setFlash(null), 2600)
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, entries.loading, all.length, shown.length])

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {all.length.toLocaleString('en-ZA')} {all.length === 1 ? 'entry' : 'entries'}
        {fromClaude ? `, ${fromClaude.toLocaleString('en-ZA')} from Claude Code` : ''}
        {lastAny ? `. Last logged ${ago(lastAny.happened_at)}.` : '.'}
        {open ? <span className="font-medium text-destructive"> {open} open {open === 1 ? 'error' : 'errors'}.</span> : ' No open errors.'}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 max-w-sm flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" className={cn(field, 'h-9 pl-9 pr-8')} placeholder="Search entries" aria-label="Search the timeline" value={q} onChange={(e) => setQ(e.target.value)} />
          {q ? <button type="button" aria-label="Clear the search" onClick={() => setQ('')} className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="size-3.5" aria-hidden="true" /></button> : null}
        </div>
        <div className="w-40"><Select aria-label="Who logged it" value={author} onChange={setAuthor} options={[{ value: '', label: 'Everyone' }, { value: 'Claude Code', label: 'Claude Code' }, { value: 'team', label: 'The team' }]} /></div>
        {onlyPhase ? null : <div className="w-44"><Select aria-label="Phase" value={phase} onChange={setPhase} options={[{ value: '', label: 'All phases' }, { value: '1', label: 'Phase 1' }, { value: '1-2', label: 'Phases 1-2' }, { value: '2', label: 'Phase 2' }, { value: 'Other', label: 'Other' }]} /></div>}
        <div className="ml-auto flex gap-2">
          <button type="button" className={btn} onClick={reload} disabled={entries.loading}><RefreshCw className={cn('size-4', entries.loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
          <button type="button" className={btnPrimary} onClick={() => setEditing(onlyPhase ? { preset: { phase: onlyPhase } } : {})}><Plus className="size-4" aria-hidden="true" /> Add entry</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by type">
        <button type="button" aria-pressed={type === ''} onClick={() => setType('')} className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', type === '' ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>All types</button>
        {TYPE_ORDER.map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(type === t ? '' : t)}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors', type === t ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
            <span aria-hidden="true" className={cn('size-1.5 rounded-full', TYPE_DOT[t])} />{t}
          </button>
        ))}
        {filtering ? <button type="button" onClick={clear} className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Clear filters</button> : null}
      </div>

      <div className="mt-8">
        {entries.error ? <p className="text-sm text-destructive" role="alert">Could not load the timeline: {entries.error}</p>
          : entries.loading && !entries.data ? <Loading variant="rows" />
          : all.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
              <p className="text-lg font-medium">Nothing has been logged for this database yet.</p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Claude Code adds entries here as it works. You can also add one by hand.</p>
              <button type="button" className={cn(btnPrimary, 'mt-6')} onClick={() => setEditing(onlyPhase ? { preset: { phase: onlyPhase } } : {})}><Plus className="size-4" aria-hidden="true" /> Add entry</button>
            </div>
          ) : nodes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">No entries match these filters. <button type="button" className="text-primary hover:underline" onClick={clear}>Clear them</button></p>
          ) : (
            <div className="space-y-10">
              {openErrors.length ? (
                <section aria-label="Open errors" className="rounded-xl border border-destructive/40 bg-destructive/[0.06] px-4 pb-2 pt-4">
                  <h2 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-destructive">
                    <span aria-hidden="true" className="size-2 rounded-full bg-destructive" /> Open errors <span className="tabular-nums normal-case tracking-normal">{openErrors.length}</span>
                  </h2>
                  <ul className="divide-y divide-border/60">{openErrors.map((n) => row(n, 0))}</ul>
                </section>
              ) : null}

              {groups.map((g) => (
                <section key={g.key} aria-label={phaseName(g.key)}>
                  <h2 className="flex items-baseline gap-3 border-b border-border pb-2 text-sm font-semibold tracking-tight">
                    {phaseName(g.key)}<span className="text-xs font-normal tabular-nums text-muted-foreground">{g.rest.reduce((s, n) => s + count(n), 0) + g.fixed.reduce((s, n) => s + count(n), 0)} {g.rest.reduce((s, n) => s + count(n), 0) + g.fixed.reduce((s, n) => s + count(n), 0) === 1 ? 'entry' : 'entries'}</span>
                  </h2>
                  {g.rest.length ? <ul className="divide-y divide-border/60">{g.rest.map((n) => row(n, 0))}</ul> : null}
                  {g.fixed.length ? (
                    <div className="mt-2">
                      <button type="button" aria-expanded={!!fixedOpen[g.key]} onClick={() => setFixedOpen((o) => ({ ...o, [g.key]: !o[g.key] }))}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground">
                        <ChevronRight aria-hidden="true" className={cn('size-4 transition-transform', fixedOpen[g.key] && 'rotate-90')} />
                        Issues found and fixed ({g.fixed.length})
                      </button>
                      {fixedOpen[g.key] ? <ul className="divide-y divide-border/60">{g.fixed.map((n) => row(n, 0))}</ul> : null}
                    </div>
                  ) : null}
                </section>
              ))}
              <p className="text-center text-xs text-muted-foreground">Start of the record</p>
            </div>
          )}
      </div>

      {editing ? (
        <EntryForm
          key={editing.entry?.id ?? JSON.stringify(editing.preset ?? {})}
          db={db} entry={editing.entry} preset={editing.preset} me={me} entries={all} lockPhase={onlyPhase}
          onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }}
        />
      ) : null}
    </div>
  )
}

/* ---------------- one entry (and the entries that answer it) ---------------- */

function Row({ node, depth, all, docs, dbId, open, flash, onToggle, render, onEdit, onReply, onChanged }: {
  node: Node; depth: number; all: Entry[]; docs: DocLink[]; dbId: string; open: boolean; flash: boolean; onToggle: (id: string) => void
  render: (n: Node, d: number) => React.ReactNode; onEdit: (e: Entry) => void; onReply: (parent: Entry, t: EntryType) => void; onChanged: () => void
}) {
  const e = node.entry
  const linked = docs.filter((d) => d.entry_id === e.id)
  const [hist, setHist] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const isErr = e.type === 'Error'
  const resolved = isErr && e.status === 'Resolved'

  async function setStatus(status: 'Open' | 'Resolved') {
    if (busy) return
    setBusy(true); setMsg(null)
    try { unwrap(await supabase.from('timeline_entries').update({ status }).eq('id', e.id)); onChanged() }
    catch (ex) { setMsg(describe(ex)) }
    finally { setBusy(false) }
  }

  return (
    <li id={`e-${e.id}`} className={cn(depth > 0 && 'ml-4 border-l border-border pl-3 sm:ml-6', flash && 'rounded-md ring-2 ring-primary/70 transition-shadow')}>
      <button type="button" aria-expanded={open} onClick={() => onToggle(e.id)} className="group flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring">
        <TypeChip type={e.type} className="mt-0.5 w-[5.5rem] justify-start" />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium leading-snug text-foreground">{e.title}</span>
          {e.summary && !open ? <span className="mt-1 line-clamp-2 block break-words text-xs leading-5 text-muted-foreground">{e.summary}</span> : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className={cn(e.author === 'Claude Code' && 'text-foreground/80')}>{e.author}</span>
            {isErr ? <span className={cn('rounded-full border px-1.5 leading-4', resolved ? 'border-border' : 'border-destructive/50 text-destructive')}>{resolved ? 'Resolved' : 'Open'}</span> : null}
            {node.children.length ? <span>{node.children.length} {node.children.length === 1 ? 'reply' : 'replies'}</span> : null}
          </span>
        </span>
        <time dateTime={e.happened_at} title={dateTimeLabel(e.happened_at)} className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">{ago(e.happened_at)}</time>
      </button>

      {open ? (
        <div className="mb-3 ml-2 space-y-3 border-l border-border pl-4 sm:ml-[6.5rem]">
          {e.parent_id && depth === 0 ? <p className="text-xs text-muted-foreground">In reply to “{all.find((x) => x.id === e.parent_id)?.title ?? 'an earlier entry'}”.</p> : null}
          {e.summary ? <p className="max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{e.summary}</p> : null}
          {e.detail ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground/90">{e.detail}</pre> : null}
          {linked.length ? <p className="text-xs text-muted-foreground">Documents: {linked.map((d, i) => <span key={d.id}>{i > 0 && ', '}<Link className="text-primary hover:underline" to={`/new/documentation/databases/${dbId}?tab=Documents&doc=${d.id}`}>{d.name}</Link></span>)}</p> : null}
          <p className="text-[11px] text-muted-foreground">
            {dateTimeLabel(e.happened_at)} · {phaseName(e.phase)}{e.session_label ? ` · ${e.session_label}` : ''} · {e.created_via === 'ingest' ? 'logged automatically' : 'added by hand'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {isErr ? (
              <>
                <button type="button" className={cn(btn, '!h-8')} onClick={() => onReply(e, 'Response')}>Add response</button>
                <button type="button" className={cn(btn, '!h-8')} onClick={() => onReply(e, 'Fix')}>Add fix</button>
                <button type="button" className={cn(btn, '!h-8')} disabled={busy} onClick={() => setStatus(resolved ? 'Open' : 'Resolved')}>{resolved ? 'Reopen' : 'Mark resolved'}</button>
              </>
            ) : null}
            <span className="flex-1" />
            <button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} aria-expanded={hist} onClick={() => setHist(!hist)}>History</button>
            <button type="button" className={cn(btnGhost, '!h-8 !px-2.5')} onClick={() => onEdit(e)}>Edit</button>
          </div>
          {msg ? <Note>{msg}</Note> : null}
          {hist ? <History entryId={e.id} /> : null}
        </div>
      ) : null}

      {node.children.length ? <ul>{node.children.map((c) => render(c, depth + 1))}</ul> : null}
    </li>
  )
}

type Edit = { id: string; edited_by: string | null; edited_at: string; previous: Partial<Entry> }

function History({ entryId }: { entryId: string }) {
  const { name } = useTeam()
  const { data, error, loading } = useLoad<Edit[]>(async () =>
    unwrap<Edit[]>(await supabase.from('timeline_entry_edits').select('*').eq('entry_id', entryId).order('edited_at', { ascending: false })) ?? [], [entryId])
  if (loading && !data) return <p className="text-xs text-muted-foreground">Loading the history…</p>
  if (error) return <p className="text-xs text-destructive">Could not load the history: {error}</p>
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">This entry has not been edited.</p>
  return (
    <ol className="space-y-3 rounded-lg border border-border p-3 text-xs">
      {data.map((h) => (
        <li key={h.id}>
          <p className="text-muted-foreground"><b className="font-medium text-foreground">{dateTimeLabel(h.edited_at)}</b> edited by {name(h.edited_by) || 'the log ingest'}. It used to say:</p>
          <blockquote className="mt-1.5 space-y-1 border-l border-border pl-3">
            <p className="font-medium text-foreground">{h.previous.title}</p>
            {h.previous.summary ? <p className="whitespace-pre-wrap break-words text-muted-foreground">{h.previous.summary}</p> : null}
            {h.previous.detail ? <p className="whitespace-pre-wrap break-words font-mono text-muted-foreground">{h.previous.detail}</p> : null}
          </blockquote>
        </li>
      ))}
    </ol>
  )
}

/* ---------------- add or edit an entry (nothing here can delete) ---------------- */

const PHASE_OPTIONS = [{ value: '1', label: 'Phase 1' }, { value: '1-2', label: 'Phases 1-2' }, { value: '2', label: 'Phase 2' }, { value: 'Other', label: 'Other' }]
const MAIN = ['1', '1-2', '2']

function EntryForm({ db, entry, preset, me, entries, lockPhase, onClose, onDone }: {
  db: Db; entry?: Entry; preset?: Partial<Entry>; me: string; entries: Entry[]; lockPhase?: string; onClose: () => void; onDone: () => void
}) {
  const start = entry ?? preset ?? {}
  const [type, setType] = useState<EntryType>((start.type as EntryType) ?? 'Note')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [summary, setSummary] = useState(entry?.summary ?? '')
  const [detail, setDetail] = useState(entry?.detail ?? '')
  const [when, setWhen] = useState(toInput(entry?.happened_at ?? new Date().toISOString()))
  const [author, setAuthor] = useState(entry?.author ?? (AUTHORS.find((a) => a === me) ?? 'Rajen'))
  const [phaseSel, setPhaseSel] = useState(!start.phase || MAIN.includes(start.phase) ? start.phase ?? '1' : 'Other')
  const [phaseOther, setPhaseOther] = useState(start.phase && !MAIN.includes(start.phase) ? start.phase : '')
  const [status, setStatus] = useState<'Open' | 'Resolved'>(entry?.status ?? 'Open')
  const [parentId, setParentId] = useState(start.parent_id ?? '')
  const [session, setSession] = useState(entry?.session_label ?? '')
  const [resolve, setResolve] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parent = entries.find((x) => x.id === parentId)
  const parents = entries.filter((x) => x.id !== entry?.id).slice(0, 200)

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (busy) return
    if (!title.trim()) return setErr('Give the entry a one-line title.')
    if (!when) return setErr('Choose when this happened.')
    const phase = lockPhase ?? (phaseSel === 'Other' ? phaseOther.trim() : phaseSel)
    if (!phase) return setErr('Name the phase.')
    const red = checkRedaction({ title: title.trim(), summary: summary.trim(), detail: detail.trim() })
    if (!red.ok) return setErr(red.message)
    const row = {
      database_id: db.id, happened_at: fromInput(when), type, phase, author, title: title.trim(), summary: summary.trim(), detail: detail.trim(),
      status: type === 'Error' ? status : null, parent_id: parentId || null, session_label: session.trim().slice(0, 120),
    }
    setBusy(true); setErr(null)
    try {
      if (entry) unwrap(await supabase.from('timeline_entries').update(row).eq('id', entry.id))
      else {
        unwrap(await supabase.from('timeline_entries').insert({ ...row, created_via: 'web' }))
        if (type === 'Fix' && parent?.type === 'Error' && resolve && parent.status !== 'Resolved') unwrap(await supabase.from('timeline_entries').update({ status: 'Resolved' }).eq('id', parent.id))
      }
      onDone()
    } catch (ex) { setErr(describe(ex)); setBusy(false) }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={entry ? 'Edit entry' : start.parent_id ? `New ${start.type ?? 'entry'}` : 'New timeline entry'}
      size="lg"
      notice={err}
      footer={
        <>
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" form="tl-form" className={btnPrimary} disabled={busy}>{busy ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}</button>
        </>
      }
    >
      <form id="tl-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div><span className={label}>Database</span><p className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground">{db.name}</p></div>
          <div><label className={label} htmlFor="tl-type">Type</label><Select id="tl-type" value={type} onChange={(v) => setType(v as EntryType)} options={TYPES.map((t) => ({ value: t, label: t }))} /></div>
        </div>
        <div><label className={label} htmlFor="tl-title">Title</label><input id="tl-title" data-autofocus className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /><p className="mt-1.5 text-xs text-muted-foreground">One line, in plain words.</p></div>
        <div><label className={label} htmlFor="tl-sum">Summary</label><textarea id="tl-sum" className={cn(field, 'min-h-20 resize-y')} value={summary} maxLength={5000} onChange={(e) => setSummary(e.target.value)} /><p className="mt-1.5 text-xs text-muted-foreground">What happened and why it matters, for someone who is not technical.</p></div>
        <div><label className={label} htmlFor="tl-det">Technical detail (optional)</label><textarea id="tl-det" className={cn(field, 'min-h-28 resize-y font-mono text-xs')} value={detail} maxLength={100000} onChange={(e) => setDetail(e.target.value)} /><p className="mt-1.5 text-xs text-muted-foreground">Error messages, counts and timings. Never patient rows, ID numbers, passwords or connection strings.</p></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div><label className={label} htmlFor="tl-when">Happened at</label><DateTimeField id="tl-when" label="Happened" value={when} onChange={setWhen} /><p className="mt-1.5 text-xs text-muted-foreground">Johannesburg time. Change it to backdate an older event.</p></div>
          <div><label className={label} htmlFor="tl-author">Author</label><Select id="tl-author" value={author} onChange={setAuthor} options={AUTHORS.map((a) => ({ value: a as string, label: a }))} /></div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {lockPhase ? null : <div><label className={label} htmlFor="tl-phase">Phase</label><Select id="tl-phase" value={phaseSel} onChange={setPhaseSel} options={PHASE_OPTIONS} /></div>}
          {!lockPhase && phaseSel === 'Other' ? <div><label className={label} htmlFor="tl-phase2">Phase name</label><input id="tl-phase2" className={field} value={phaseOther} maxLength={40} onChange={(e) => setPhaseOther(e.target.value)} /></div> : null}
          {type === 'Error' ? <div><label className={label} htmlFor="tl-status">Status</label><Select id="tl-status" value={status} onChange={(v) => setStatus(v as 'Open' | 'Resolved')} options={STATUSES.map((s) => ({ value: s as string, label: s }))} /></div> : null}
        </div>
        <div>
          <label className={label} htmlFor="tl-parent">Linked to (optional)</label>
          <Select id="tl-parent" value={parentId} onChange={setParentId} options={[{ value: '', label: 'Not linked' }, ...parents.map((x) => ({ value: x.id, label: `${x.type}: ${x.title}` }))]} />
          <p className="mt-1.5 text-xs text-muted-foreground">Attach this entry to an earlier one, for example a response or fix to an error.</p>
        </div>
        <div><label className={label} htmlFor="tl-session">Session (optional)</label><input id="tl-session" className={field} value={session} maxLength={120} onChange={(e) => setSession(e.target.value)} placeholder="e.g. Claude Code, hospital load" /></div>
        {!entry && type === 'Fix' && parent?.type === 'Error' && parent.status !== 'Resolved' ? <Checkbox checked={resolve} onChange={setResolve}>Mark the error as resolved</Checkbox> : null}
      </form>
    </Dialog>
  )
}
