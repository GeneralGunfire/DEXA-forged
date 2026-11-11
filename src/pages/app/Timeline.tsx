import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { describe, unwrap, useLoad, useMe, useTeam } from '../../lib/data'
import { checkRedaction } from '../../lib/redact'
import {
  activeFilterCount, AUTHORS, buildThreads, countNodes, filterEntries, fixesFor, fmtDay, fmtTime, fromLocalInput, NO_FILTERS,
  PHASES, STATUSES, toLocalInput, TYPES, type Entry, type EntryType, type Filters, type Node,
} from '../../lib/timeline'
import { Dialog, EmptyState, Field, LoadState, PageHead } from '../../components/ui'
import { sectionByPath } from './sections'
import './pages.css'
import './timeline.css'

export type DbLite = { id: string; name: string; slug: string | null }
type DocLink = { id: string; name: string; entry_id: string; database_id: string }
type Edit = { id: string; edited_by: string | null; edited_at: string; previous: Partial<Entry> }

const typeClass = (t: string) => `tl-type tl-type--${t.toLowerCase()}`

/* ---------------- global page ---------------- */

export default function GlobalTimeline() {
  const s = sectionByPath('timeline')
  return (
    <div className="pg pg--wide">
      <PageHead title={s.label} blurb={s.blurb} />
      <TimelineView />
    </div>
  )
}

/* ---------------- the timeline itself (one database, or everything) ---------------- */

export function TimelineView({ databaseId }: { databaseId?: string }) {
  const me = useMe()
  const { name: who } = useTeam()
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

  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, database: databaseId ?? '' })
  const [showFilters, setShowFilters] = useState(false)
  const [editing, setEditing] = useState<{ entry?: Entry; preset?: Partial<Entry> } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const dbName = (id: string | null) => (id ? dbs.data?.find((d) => d.id === id)?.name ?? 'Database' : 'Whole estate')
  const all = entries.data ?? []
  const shown = useMemo(() => filterEntries(all, filters), [all, filters])
  const groups = useMemo(() => buildThreads(shown), [shown])
  const filtered = activeFilterCount(filters, !!databaseId) > 0
  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }))

  // open the entry a link points at
  useEffect(() => {
    if (!focus || entries.loading) return
    const el = document.getElementById(`e-${focus}`)
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('is-flash'); const t = setTimeout(() => el.classList.remove('is-flash'), 2400); return () => clearTimeout(t) }
  }, [focus, entries.loading, groups])
  useEffect(() => {
    if (!focus) return
    const el = document.getElementById(`e-${focus}`)
    if (!el && !entries.loading && all.length && filtered) setFilters({ ...NO_FILTERS, database: databaseId ?? '' })
  }, [focus, entries.loading, all.length, filtered, databaseId])

  async function reloadAll() { entries.reload(); docs.reload() }

  async function remove(en: Entry) {
    const kids = all.filter((x) => x.parent_id === en.id).length
    const extra = kids ? ` Its ${kids} linked ${kids === 1 ? 'entry stays' : 'entries stay'} on the timeline.` : ''
    if (!window.confirm(`Delete "${en.title}"? This cannot be undone.${extra}`)) return
    try { unwrap(await supabase.from('timeline_entries').delete().eq('id', en.id)); setMsg(null); reloadAll() } catch (e) { setMsg(describe(e)) }
  }
  async function setStatus(en: Entry, status: 'Open' | 'Resolved') {
    try { unwrap(await supabase.from('timeline_entries').update({ status }).eq('id', en.id)); setMsg(null); entries.reload() } catch (e) { setMsg(describe(e)) }
  }

  const card = (n: Node, depth: number) => (
    <EntryCard
      key={n.entry.id} node={n} depth={depth} all={all} docs={docs.data ?? []} who={who}
      dbName={databaseId ? null : dbName(n.entry.database_id)}
      dbId={n.entry.database_id}
      onEdit={(entry) => setEditing({ entry })}
      onDelete={remove}
      onReply={(parent, type) => setEditing({ preset: { parent_id: parent.id, type, database_id: parent.database_id, phase: parent.phase } })}
      onStatus={setStatus}
      render={card}
      onJump={(id) => setParams((p) => { p.set('entry', id); return p }, { replace: true })}
    />
  )

  return (
    <>
      <div className="tl-bar">
        <input className="search tl-search" type="search" placeholder="Search entries" aria-label="Search the timeline"
          value={filters.q} onChange={(e) => set('q', e.target.value)} />
        <button type="button" className="btn tl-filterbtn" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
          Filters{activeFilterCount(filters, !!databaseId) - (filters.q ? 1 : 0) > 0 ? ` (${activeFilterCount(filters, !!databaseId) - (filters.q ? 1 : 0)})` : ''}
        </button>
        <button type="button" className="btn btn--dark" onClick={() => setEditing({})}>New entry</button>
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
        <label><span>Type</span>
          <select value={filters.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">All types</option>{TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label><span>Phase</span>
          <select value={filters.phase} onChange={(e) => set('phase', e.target.value)}>
            <option value="">All phases</option>{PHASES.map((p) => <option key={p} value={p}>{p === 'Other' ? 'Other' : `Phase ${p}`}</option>)}
          </select>
        </label>
        <label><span>Status</span>
          <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>{STATUSES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label><span>Author</span>
          <select value={filters.author} onChange={(e) => set('author', e.target.value)}>
            <option value="">Anyone</option>{AUTHORS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label><span>From</span><input type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} /></label>
        <label><span>To</span><input type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} /></label>
        {filtered && (
          <button type="button" className="btn btn--sm tl-clear" onClick={() => setFilters({ ...NO_FILTERS, database: databaseId ?? '' })}>Clear filters</button>
        )}
      </div>

      {msg && <p className="notice notice--err" role="alert">{msg}</p>}

      <LoadState loading={entries.loading && !entries.data} error={entries.error}>
        {all.length === 0 ? (
          <EmptyState
            title={databaseId ? 'Nothing has been logged for this database yet.' : 'Nothing has been logged yet.'}
            text="Add an entry for each action, error, fix or decision."
            action={<button type="button" className="btn btn--dark" onClick={() => setEditing({})}>New entry</button>}
          />
        ) : groups.length === 0 ? (
          <EmptyState title="No entries match these filters." text="Clear a filter or change the search." />
        ) : (
          <>
            <p className="tl-count" aria-live="polite">
              {countNodes(groups)} {countNodes(groups) === 1 ? 'entry' : 'entries'}{filtered ? ` of ${all.length}` : ''}, newest first
            </p>
            {groups.map((g) => (
              <section className="tl-day" key={g.day} aria-label={fmtDay(g.day)}>
                <h2 className="tl-day__h">{fmtDay(g.day)}</h2>
                <div className="tl-day__list">{g.nodes.map((n) => card(n, 0))}</div>
              </section>
            ))}
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
            onClose={() => setEditing(null)} onDone={reloadAll}
          />
        )}
      </Dialog>
    </>
  )
}

/* ---------------- one entry ---------------- */

function EntryCard({
  node, depth, all, docs, who, dbName, dbId, onEdit, onDelete, onReply, onStatus, onJump, render,
}: {
  node: Node; depth: number; all: Entry[]; docs: DocLink[]; who: (id?: string | null) => string
  dbName: string | null; dbId: string | null
  onEdit: (e: Entry) => void; onDelete: (e: Entry) => void
  onReply: (parent: Entry, type: EntryType) => void
  onStatus: (e: Entry, s: 'Open' | 'Resolved') => void
  onJump: (id: string) => void
  render: (n: Node, depth: number) => React.ReactNode
}) {
  const e = node.entry
  const fixes = e.type === 'Error' ? fixesFor(e.id, all) : []
  const linked = docs.filter((d) => d.entry_id === e.id)
  const [open, setOpen] = useState(false)
  const [hist, setHist] = useState(false)
  void who

  return (
    <div className={`tl-node${depth ? ' tl-node--child' : ''}`}>
      <article className={`tl-card tl-card--${e.type.toLowerCase()}`} id={`e-${e.id}`}>
        <header className="tl-card__top">
          <span className={typeClass(e.type)}>{e.type}</span>
          {e.type === 'Error' && e.status && (
            <span className={`tl-status tl-status--${e.status.toLowerCase()}`}>{e.status}</span>
          )}
          {dbName !== null && (
            dbId ? <Link className="tl-dbchip" to={`/app/databases/${dbId}?tab=Timeline`}>{dbName}</Link>
              : <span className="tl-dbchip tl-dbchip--estate">{dbName}</span>
          )}
          <span className="tl-meta">
            <time dateTime={e.happened_at}>{fmtTime(e.happened_at)}</time> · {e.author} · {/^[12]$/.test(e.phase) ? `Phase ${e.phase}` : e.phase}
            {e.created_via === 'ingest' ? ' · logged automatically' : ''}
          </span>
        </header>

        <h3 className="tl-card__title">{e.title}</h3>
        {e.summary && <p className="tl-card__sum">{e.summary}</p>}

        {e.type === 'Error' && fixes.length > 0 && (
          <p className="tl-resolved">
            Resolved by{' '}
            {fixes.map((f, i) => (
              <span key={f.id}>{i > 0 && ', '}<a href={`#e-${f.id}`} onClick={(ev) => { ev.preventDefault(); onJump(f.id) }}>{f.title}</a></span>
            ))}
          </p>
        )}
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

        {e.detail && (
          <>
            <button type="button" className="tl-link" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Hide technical detail' : 'Show technical detail'}
            </button>
            {open && <pre className="tl-detail">{e.detail}</pre>}
          </>
        )}

        <footer className="tl-acts">
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
        </footer>
        {hist && <History entryId={e.id} />}
      </article>

      {node.children.length > 0 && (
        <div className="tl-children">{node.children.map((c) => render(c, depth + 1))}</div>
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
  const [phaseSel, setPhaseSel] = useState(() => (!start.phase || /^[12]$/.test(start.phase) ? start.phase ?? '1' : 'Other'))
  const [phaseOther, setPhaseOther] = useState(() => (start.phase && !/^[12]$/.test(start.phase) ? start.phase : ''))
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
            {PHASES.map((p) => <option key={p} value={p}>{p === 'Other' ? 'Other' : `Phase ${p}`}</option>)}
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
