import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { describe, unwrap, useLoad, useMe, useTeam } from '../../lib/data'
import { checkRedaction } from '../../lib/redact'
import {
  activeFilterCount, AUTHORS, buildThreads, countNodes, dayKey, filterEntries, fixesFor, fmtDay, fmtTime, fromLocalInput, NO_FILTERS,
  PHASES, MAIN_PHASES, phaseLabel, STATUSES, toLocalInput, TYPES, type Entry, type EntryType, type Filters, type Node as TNode,
} from '../../lib/timeline'
import { Dialog, EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { ContentSections } from '../../components/ContentSections'
import { Columns, StatTiles } from '../../components/charts'
import { sectionByPath } from './sections'
import './pages.css'
import './timeline.css'
import { useFeedback } from '../../components/feedback'
import { useOpenFromQuery } from '../../components/nav'

export type DbLite = { id: string; name: string; slug: string | null }
type DocLink = { id: string; name: string; entry_id: string; database_id: string }
type Edit = { id: string; edited_by: string | null; edited_at: string; previous: Partial<Entry> }


/* ---------------- global page ---------------- */

export default function GlobalTimeline() {
  const s = sectionByPath('timeline')
  return (
    <div className="pg pg--wide">
      <PageHead title={s.label} blurb={s.blurb} />
      <ContentSections databaseId={null} area="estate" />
      <TimelineView />
    </div>
  )
}

/* ---------------- the timeline itself (one database, or everything) ---------------- */

function Dot({ type, open }: { type: string; open?: boolean }) {
  return <span className={`tl-node-dot tl-node-dot--${type.toLowerCase()}${open ? ' is-open' : ''}`} aria-hidden="true" />
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} d ago`
}

export function TimelineView({ databaseId }: { databaseId?: string }) {
  const { confirm, toast } = useFeedback()
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const focus = params.get('entry')

  const entries = useLoad<Entry[]>(async () => {
    let q = supabase.from('timeline_entries').select('*').order('happened_at', { ascending: false }).limit(2000)
    if (databaseId) q = q.eq('database_id', databaseId)
    return unwrap<Entry[]>(await q) ?? []
  }, [databaseId])
  const dbs = useLoad<DbLite[]>(async () =>
    unwrap<DbLite[]>(await supabase.from('databases').select('id, name, slug').order('name')) ?? [])
  const docs = useLoad<DocLink[]>(async () => {
    let q = supabase.from('db_documents').select('id, name, entry_id, database_id').not('entry_id', 'is', null).eq('is_current', true)
    if (databaseId) q = q.eq('database_id', databaseId)
    return unwrap<DocLink[]>(await q) ?? []
  }, [databaseId])

  // Claude Code logs while it works, so new entries appear without a reload
  const { reload: reloadEntries } = entries
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') reloadEntries() }, 20000)
    return () => clearInterval(t)
  }, [reloadEntries])

  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, database: databaseId ?? '' })
  const [showFilters, setShowFilters] = useState(false)
  const [editing, setEditing] = useState<{ entry?: Entry; preset?: Partial<Entry> } | null>(null)
  useOpenFromQuery('new', () => setEditing({}))
  const [msg, setMsg] = useState<string | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [activeDay, setActiveDay] = useState('')

  const dbName = (id: string | null) => (id ? dbs.data?.find((d) => d.id === id)?.name ?? 'Database' : 'Whole estate')
  const all = entries.data ?? []
  const shown = useMemo(() => filterEntries(all, filters), [all, filters])
  const groups = useMemo(() => buildThreads(shown), [shown])
  const filtered = activeFilterCount(filters, !!databaseId) > 0
  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }))
  const toggle = (id: string) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const openErrors = all.filter((e) => e.type === 'Error' && e.status === 'Open').length
  const fromClaude = all.filter((e) => e.author === 'Claude Code').length
  const last = all.find((e) => e.author === 'Claude Code')

  // scrubber: one bar per day, stacked by type
  const days = useMemo(() => {
    const m = new Map<string, Record<string, number>>()
    for (const e of shown) { const d = dayKey(e.happened_at); const r = m.get(d) ?? {}; r[e.type] = (r[e.type] ?? 0) + 1; m.set(d, r) }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0])).slice(-60)
  }, [shown])

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-day]')]
    if (!els.length) return
    const io = new IntersectionObserver((ee) => {
      const hit = ee.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (hit) setActiveDay((hit.target as HTMLElement).dataset.day ?? '')
    }, { rootMargin: '-10% 0px -75% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [groups])

  const jumpDay = (d: string) => document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // open the entry a link points at
  useEffect(() => {
    if (!focus || entries.loading) return
    setOpenIds((s) => new Set(s).add(focus))
    const t0 = setTimeout(() => {
      const el = document.getElementById(`e-${focus}`)
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 2400) }
    }, 60)
    return () => clearTimeout(t0)
  }, [focus, entries.loading])
  useEffect(() => {
    if (focus && !entries.loading && all.length && filtered && !shown.some((e) => e.id === focus)) setFilters({ ...NO_FILTERS, database: databaseId ?? '' })
  }, [focus, entries.loading, all.length, filtered, shown, databaseId])

  function reloadAll() { entries.reload(); docs.reload() }
  async function remove(en: Entry) {
    const kids = all.filter((x) => x.parent_id === en.id).length
    const extra = kids ? ` Its ${kids} linked ${kids === 1 ? 'entry stays' : 'entries stay'} on the timeline.` : ''
    if (!await confirm(`Delete "${en.title}"? This cannot be undone.${extra}`)) return
    try { unwrap(await supabase.from('timeline_entries').delete().eq('id', en.id)); setMsg(null); reloadAll(); toast('Entry deleted') } catch (e) { setMsg(describe(e)); toast(describe(e), 'err') }
  }
  async function setStatus(en: Entry, status: 'Open' | 'Resolved') {
    try { unwrap(await supabase.from('timeline_entries').update({ status }).eq('id', en.id)); setMsg(null); entries.reload(); toast(status === 'Resolved' ? 'Marked as resolved' : 'Reopened') } catch (e) { setMsg(describe(e)); toast(describe(e), 'err') }
  }

  const row = (n: TNode, depth: number): React.ReactNode => (
    <TlRow
      key={n.entry.id} node={n} depth={depth} all={all} docs={docs.data ?? []}
      dbName={databaseId ? null : dbName(n.entry.database_id)} dbId={n.entry.database_id}
      open={openIds.has(n.entry.id)} onToggle={toggle}
      onEdit={(entry) => setEditing({ entry })} onDelete={remove}
      onReply={(parent, type) => setEditing({ preset: { parent_id: parent.id, type, database_id: parent.database_id, phase: parent.phase } })}
      onStatus={setStatus}
      render={row}
      onJump={(id) => setParams((p) => { p.set('entry', id); return p }, { replace: true })}
    />
  )

  const filterCount = activeFilterCount(filters, !!databaseId) - (filters.q ? 1 : 0)
  return (
    <>
      <p className="tl-note">
        <b>Claude Code keeps this timeline up to date as it works.</b>{' '}
        {last ? `Last logged ${ago(last.happened_at)}.` : 'Nothing logged by Claude Code yet.'}{' '}
        {fromClaude} of {all.length} {all.length === 1 ? 'entry' : 'entries'} came from Claude Code
        {openErrors > 0 ? `, and ${openErrors} ${openErrors === 1 ? 'error is' : 'errors are'} still open.` : '.'}
      </p>
      <StatTiles items={[
        { value: all.length.toLocaleString('en-ZA'), label: all.length === 1 ? 'entry' : 'entries' },
        { value: all.length ? `${Math.round((fromClaude / all.length) * 100)}%` : '0%', label: 'from Claude Code' },
        { value: openErrors, label: openErrors === 1 ? 'open error' : 'open errors', alert: openErrors > 0 },
        { value: all.filter((x) => x.type === 'Error' && x.status === 'Resolved').length, label: 'errors resolved' },
      ]} />

      {days.length > 3 && (
        <Columns
          ariaLabel="Entries per day. Choose a day to jump to it."
          activeKey={activeDay}
          onSelect={jumpDay}
          data={days.map(([d, r]) => {
            const total = Object.values(r).reduce((x, y) => x + y, 0)
            return { key: d, label: fmtDay(d).replace(/^\w+, /, ''), value: total, tip: `${fmtDay(d)}: ${total} ${total === 1 ? 'entry' : 'entries'}` }
          })}
        />
      )}

      <div className="tl-bar">
        <input className="search tl-search" type="search" placeholder="Search entries" aria-label="Search the timeline"
          value={filters.q} onChange={(e) => set('q', e.target.value)} />
        <div className="seg" role="group" aria-label="Who logged it">
          {([['', 'Everyone'], ['Claude Code', 'Claude Code'], ['team', 'Team']] as const).map(([v, l]) => (
            <button type="button" key={l} aria-pressed={filters.author === v} onClick={() => set('author', v)}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn tl-filterbtn" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
          Filters{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
        <button type="button" className="btn" onClick={() => setEditing({})}>Add manual entry</button>
      </div>

      <div className="seg tl-types" role="group" aria-label="Filter by type">
        <button type="button" aria-pressed={filters.type === ''} onClick={() => set('type', '')}>All types</button>
        {TYPES.map((t) => (
          <button type="button" key={t} aria-pressed={filters.type === t} onClick={() => set('type', filters.type === t ? '' : t)}>{t}</button>
        ))}
      </div>

      <div className={`tl-filters${showFilters ? ' is-open' : ''}`}>
        {!databaseId && (
          <label><span>Database</span>
            <select value={filters.database} onChange={(e) => set('database', e.target.value)}>
              <option value="">All databases</option>
              <option value="estate">Whole estate</option>
              {(dbs.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <label><span>Phase</span>
          <select value={filters.phase} onChange={(e) => set('phase', e.target.value)}>
            <option value="">All phases</option>{PHASES.map((p) => <option key={p} value={p}>{p === 'Other' ? 'Other' : phaseLabel(p)}</option>)}
          </select>
        </label>
        <label><span>Status</span>
          <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>{STATUSES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label><span>Person</span>
          <select value={(AUTHORS as readonly string[]).includes(filters.author) ? filters.author : ''} onChange={(e) => set('author', e.target.value)}>
            <option value="">Anyone</option>{AUTHORS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label><span>From</span><input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label><span>To</span><input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} /></label>
      </div>
      {filtered && <button type="button" className="btn btn--sm tl-clear" onClick={() => setFilters({ ...NO_FILTERS, database: databaseId ?? '' })}>Clear filters</button>}

      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <LoadState loading={entries.loading && !entries.data} error={entries.error}>
        {all.length === 0 ? (
          <EmptyState
            title={databaseId ? 'Nothing has been logged for this database yet.' : 'Nothing has been logged yet.'}
            text="Claude Code adds entries here as it works. You can also add one by hand."
            action={<button type="button" className="btn btn--dark" onClick={() => setEditing({})}>Add manual entry</button>}
          />
        ) : groups.length === 0 ? (
          <EmptyState title="No entries match these filters." text="Clear a filter or change the search." />
        ) : (
          <>
            <p className="tl-count" aria-live="polite">
              {countNodes(groups)} {countNodes(groups) === 1 ? 'entry' : 'entries'}{filtered ? ` of ${all.length}` : ''}, newest first
            </p>
            <div className="tl-spine">
              {groups.map((g) => (
                <section className="tl-day" key={g.day} id={`day-${g.day}`} data-day={g.day} aria-label={fmtDay(g.day)}>
                  <h2 className="tl-day__h"><span>{fmtDay(g.day)}</span></h2>
                  <div className="tl-rows">{g.nodes.map((n) => row(n, 0))}</div>
                </section>
              ))}
              <p className="tl-end">Start of the record</p>
            </div>
          </>
        )}
      </LoadState>

      <Dialog open={!!editing} onClose={() => setEditing(null)}
        title={editing?.entry ? 'Edit entry' : editing?.preset?.parent_id ? `New ${editing.preset.type ?? 'entry'}` : 'New timeline entry'}>
        {editing && (
          <EntryForm
            key={editing.entry?.id ?? JSON.stringify(editing.preset ?? {})}
            entry={editing.entry} preset={editing.preset} fixedDb={databaseId} me={me}
            dbs={dbs.data ?? []} entries={all}
            onClose={() => setEditing(null)} onDone={() => { reloadAll(); toast('Entry saved') }}
          />
        )}
      </Dialog>
    </>
  )
}

/* ---------------- one entry on the spine ---------------- */

function TlRow({
  node, depth, all, docs, dbName, dbId, open, onToggle, onEdit, onDelete, onReply, onStatus, onJump, render,
}: {
  node: TNode; depth: number; all: Entry[]; docs: DocLink[]
  dbName: string | null; dbId: string | null; open: boolean
  onToggle: (id: string) => void
  onEdit: (e: Entry) => void; onDelete: (e: Entry) => void
  onReply: (parent: Entry, type: EntryType) => void
  onStatus: (e: Entry, s: 'Open' | 'Resolved') => void
  onJump: (id: string) => void
  render: (n: TNode, depth: number) => React.ReactNode
}) {
  const e = node.entry
  const fixes = e.type === 'Error' ? fixesFor(e.id, all) : []
  const linked = docs.filter((d) => d.entry_id === e.id)
  const [hist, setHist] = useState(false)
  const robot = e.author === 'Claude Code'

  return (
    <div className={`tl-item${depth ? ' tl-item--child' : ''}`}>
      <div className={`tl-row tl-row--${e.type.toLowerCase()}${open ? ' is-open' : ''}`} id={`e-${e.id}`}>
        <time className="tl-time" dateTime={e.happened_at}>{fmtTime(e.happened_at)}</time>
        <Dot type={e.type} open={e.type === 'Error' && e.status === 'Open'} />
        <div className="tl-body">
          <button type="button" className="tl-head-btn" aria-expanded={open} onClick={() => onToggle(e.id)}>
            <span className="tl-line1">
              <span className="tl-type">{e.type}</span>
              {e.type === 'Error' && e.status && <span className={`tl-status tl-status--${e.status.toLowerCase()}`}>{e.status}</span>}
              <span className={`tl-by${robot ? ' tl-by--cc' : ''}`}>{e.author}</span>
              {dbName !== null && <span className="tl-dbtag">{dbName}</span>}
              <span className="tl-phase">{phaseLabel(e.phase)}</span>
            </span>
            <span className="tl-title">{e.title}</span>
            {e.summary && <span className={`tl-sum${open ? '' : ' is-clamped'}`}>{e.summary}</span>}
          </button>

          {e.type === 'Error' && fixes.length > 0 && (
            <p className="tl-resolved">
              Resolved by{' '}
              {fixes.map((f, i) => (
                <span key={f.id}>{i > 0 && ', '}<a href={`#e-${f.id}`} onClick={(ev) => { ev.preventDefault(); onJump(f.id) }}>{f.title}</a></span>
              ))}
            </p>
          )}

          {open && (
            <div className="tl-more">
              {e.parent_id && depth === 0 && (
                <p className="tl-resolved">
                  In reply to{' '}
                  <a href={`#e-${e.parent_id}`} onClick={(ev) => { ev.preventDefault(); onJump(e.parent_id!) }}>
                    {all.find((x) => x.id === e.parent_id)?.title ?? 'an earlier entry'}
                  </a>
                </p>
              )}
              {linked.length > 0 && (
                <p className="tl-docs">
                  Documents:{' '}
                  {linked.map((d, i) => (
                    <span key={d.id}>{i > 0 && ', '}<Link to={`/app/databases/${d.database_id}?tab=Documents&doc=${d.id}`}>{d.name}</Link></span>
                  ))}
                </p>
              )}
              {e.detail && <pre className="tl-detail">{e.detail}</pre>}
              <p className="tl-foot">
                {new Date(e.happened_at).toLocaleString('en-ZA', { dateStyle: 'long', timeStyle: 'short' })}
                {e.session_label ? ` · ${e.session_label}` : ''}{e.created_via === 'ingest' ? ' · logged automatically' : ' · added by hand'}
                {dbId && dbName !== null && <> · <Link to={`/app/databases/${dbId}?tab=Timeline`}>Open {dbName}</Link></>}
              </p>
              <div className="tl-acts">
                {e.type === 'Error' && (
                  <>
                    <button type="button" className="btn btn--sm" onClick={() => onReply(e, 'Response')}>Add response</button>
                    <button type="button" className="btn btn--sm" onClick={() => onReply(e, 'Fix')}>Add fix</button>
                    {e.status === 'Open'
                      ? <button type="button" className="btn btn--sm" onClick={() => onStatus(e, 'Resolved')}>Mark resolved</button>
                      : <button type="button" className="btn btn--sm" onClick={() => onStatus(e, 'Open')}>Reopen</button>}
                  </>
                )}
                <span className="tl-acts__gap" />
                <button type="button" className="btn btn--sm" onClick={() => setHist(!hist)} aria-expanded={hist}>History</button>
                <button type="button" className="btn btn--sm" onClick={() => onEdit(e)}>Edit</button>
                <button type="button" className="btn btn--sm btn--danger" onClick={() => onDelete(e)}>Delete</button>
              </div>
              {hist && <History entryId={e.id} />}
            </div>
          )}
        </div>
      </div>

      {node.children.length > 0 && (
        <div className="tl-branch">{node.children.map((c) => render(c, depth + 1))}</div>
      )}
    </div>
  )
}

function History({ entryId }: { entryId: string }) {
  const { name } = useTeam()
  const { data, error, loading } = useLoad<Edit[]>(async () =>
    unwrap<Edit[]>(await supabase.from('timeline_entry_edits').select('*').eq('entry_id', entryId).order('edited_at', { ascending: false })) ?? [], [entryId])
  return (
    <div className="tl-hist">
      <LoadState loading={loading && !data} error={error}>
        {data && data.length === 0 ? <p className="muted">This entry has not been edited.</p> : (
          <ol>
            {(data ?? []).map((h) => (
              <li key={h.id}>
                <strong>{new Date(h.edited_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                {' '}edited by {name(h.edited_by) || 'the log ingest'}. It used to say:
                <blockquote>
                  <b>{h.previous.title}</b>
                  {h.previous.summary && <span>{h.previous.summary}</span>}
                  {h.previous.detail && <span className="tl-hist__d">{h.previous.detail}</span>}
                </blockquote>
              </li>
            ))}
          </ol>
        )}
      </LoadState>
    </div>
  )
}

/* ---------------- create / edit ---------------- */

function EntryForm({
  entry, preset, fixedDb, me, dbs, entries, onClose, onDone,
}: {
  entry?: Entry; preset?: Partial<Entry>; fixedDb?: string; me: string; dbs: DbLite[]; entries: Entry[]
  onClose: () => void; onDone: () => void
}) {
  const start = entry ?? preset ?? {}
  const [dbId, setDbId] = useState<string>(entry ? entry.database_id ?? '' : fixedDb ?? start.database_id ?? '')
  const [type, setType] = useState<EntryType>((start.type as EntryType) ?? 'Note')
  const [phaseSel, setPhaseSel] = useState(() => (!start.phase || MAIN_PHASES.includes(start.phase) ? start.phase ?? '1' : 'Other'))
  const [phaseOther, setPhaseOther] = useState(() => (start.phase && !MAIN_PHASES.includes(start.phase) ? start.phase : ''))
  const [parentId, setParentId] = useState(start.parent_id ?? '')
  const [resolve, setResolve] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const defaultAuthor = entry?.author ?? (AUTHORS.find((a) => a === me) ?? 'Rajen')

  const parentOptions = entries
    .filter((x) => x.id !== entry?.id && (dbId ? x.database_id === dbId : x.database_id === null))
    .slice(0, 200)
  const parent = entries.find((x) => x.id === parentId)

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const fd = new FormData(ev.currentTarget)
    const title = String(fd.get('title') ?? '').trim()
    const summary = String(fd.get('summary') ?? '').trim()
    const detail = String(fd.get('detail') ?? '').trim()
    if (!title) return setErr('Give the entry a one-line title.')
    const when = String(fd.get('when') ?? '')
    if (!when || Number.isNaN(new Date(when).getTime())) return setErr('Choose when this happened.')
    const phase = phaseSel === 'Other' ? phaseOther.trim() : phaseSel
    if (!phase) return setErr('Name the phase.')
    const red = checkRedaction({ title, summary, detail })
    if (!red.ok) return setErr(red.message)

    const row = {
      database_id: dbId || null,
      happened_at: fromLocalInput(when),
      type, phase,
      author: String(fd.get('author') ?? defaultAuthor),
      title, summary, detail,
      status: type === 'Error' ? (String(fd.get('status') ?? 'Open') as 'Open' | 'Resolved') : null,
      parent_id: parentId || null,
      session_label: String(fd.get('session') ?? '').trim().slice(0, 120),
    }
    setBusy(true)
    try {
      if (entry) unwrap(await supabase.from('timeline_entries').update(row).eq('id', entry.id))
      else {
        unwrap(await supabase.from('timeline_entries').insert({ ...row, created_via: 'web' }))
        if (type === 'Fix' && parent?.type === 'Error' && resolve && parent.status !== 'Resolved') {
          unwrap(await supabase.from('timeline_entries').update({ status: 'Resolved' }).eq('id', parent.id))
        }
      }
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="tl-form">
      <div className="row2">
        <Field label="Database">
          <select value={dbId} disabled={!!fixedDb} onChange={(e) => { setDbId(e.target.value); setParentId('') }}>
            <option value="">Whole estate</option>
            {dbs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as EntryType)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
      </div>
      <Field label="Title" hint="One line, in plain words.">
        <input type="text" name="title" autoFocus maxLength={200} defaultValue={entry?.title ?? ''} />
      </Field>
      <Field label="Summary" hint="What happened and why it matters, for someone who is not technical.">
        <textarea name="summary" rows={3} maxLength={5000} defaultValue={entry?.summary ?? ''} />
      </Field>
      <Field label="Technical detail (optional)" hint="Error messages, counts and timings. Never patient rows, ID numbers, passwords or connection strings.">
        <textarea name="detail" rows={5} maxLength={100000} defaultValue={entry?.detail ?? ''} className="mono" />
      </Field>
      <div className="row2">
        <Field label="Happened at" hint="Change this to backdate an older event.">
          <input type="datetime-local" name="when" defaultValue={toLocalInput(entry?.happened_at ?? new Date().toISOString())} />
        </Field>
        <Field label="Author">
          <select name="author" defaultValue={defaultAuthor}>{AUTHORS.map((a) => <option key={a}>{a}</option>)}</select>
        </Field>
      </div>
      <div className="row2">
        <Field label="Phase">
          <select value={phaseSel} onChange={(e) => setPhaseSel(e.target.value)}>
            {PHASES.map((p) => <option key={p} value={p}>{p === 'Other' ? 'Other' : phaseLabel(p)}</option>)}
          </select>
        </Field>
        {phaseSel === 'Other'
          ? <Field label="Phase name"><input type="text" value={phaseOther} maxLength={40} onChange={(e) => setPhaseOther(e.target.value)} /></Field>
          : <div />}
      </div>
      <div className="row2">
        {type === 'Error' && (
          <Field label="Status"><select name="status" defaultValue={entry?.status ?? 'Open'}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        )}
        <Field label="Session (optional)"><input type="text" name="session" maxLength={120} defaultValue={entry?.session_label ?? ''} placeholder="e.g. Claude Code, hospital load" /></Field>
      </div>
      <Field label="Linked to (optional)" hint="Attach this entry to an earlier one, for example a response or fix to an error.">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">Not linked</option>
          {parentOptions.map((x) => <option key={x.id} value={x.id}>{x.type}: {x.title}</option>)}
        </select>
      </Field>
      {!entry && type === 'Fix' && parent?.type === 'Error' && parent.status === 'Open' && (
        <label className="check"><input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />Mark the error as resolved</label>
      )}
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}</button>
      </div>
    </form>
  )
}
