import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { describe, fmtDate, todayStr, unwrap, useLoad } from '../../lib/data'
import { Dialog, EmptyState, Field, LoadState, PageHead, Rich } from '../../components/ui'
import { completeness, countBy } from '../../lib/completeness'
import { DocumentsPanel } from './Documents'
import { DbDocuments } from './DbDocuments'
import { TimelineView } from './Timeline'
import { ContentSections } from '../../components/ContentSections'
import { StatTiles } from '../../components/charts'
import { sectionByPath } from './sections'
import './pages.css'
import { useFeedback } from '../../components/feedback'

type Db = {
  id: string; name: string; machine: string; db_type: string; port: string; instance_name: string
  background: string; shortfalls: string; build_record: string; created_at: string
  slug: string | null; status: string
}

const MACHINES = ["Rajen's PC", "Huzayfa's laptop"]
const TYPES = ['PostgreSQL', 'SQL Server', 'SQLite', 'MySQL', 'CSV files']

/* ---------------- list ---------------- */

export function DatabaseBoard() {
  const s = sectionByPath('databases')
  const { data, error, loading, reload } = useLoad<Db[]>(async () =>
    unwrap<Db[]>(await supabase.from('databases').select('*').order('created_at', { ascending: false })) ?? [])
  const [adding, setAdding] = useState(false)
  // how many log entries and documents each database has, for the completeness score
  const counts = useLoad<{ log: Record<string, number>; docs: Record<string, number>; tl: Record<string, { n: number; open: number; last: string }> }>(async () => {
    const [e, d, t, dd] = await Promise.all([
      supabase.from('db_entries').select('database_id'), supabase.from('documents').select('database_id'),
      supabase.from('timeline_entries').select('database_id, type, status, happened_at'), supabase.from('db_documents').select('database_id'),
    ])
    const sum = (a: Record<string, number>, b: Record<string, number>) => {
      const o = { ...a }
      for (const k of Object.keys(b)) o[k] = (o[k] ?? 0) + b[k]
      return o
    }
    // the newer tables may not exist yet on an older database, so a missing table counts as nothing
    const rows = (r: { data: unknown; error: unknown }) => (r.error ? [] : ((r.data as { database_id: string | null }[]) ?? []))
    const tl: Record<string, { n: number; open: number; last: string }> = {}
    if (!t.error) {
      for (const x of (t.data ?? []) as { database_id: string | null; type: string; status: string | null; happened_at: string }[]) {
        if (!x.database_id) continue
        const c = (tl[x.database_id] ??= { n: 0, open: 0, last: '' })
        c.n++
        if (x.type === 'Error' && x.status === 'Open') c.open++
        if (x.happened_at > c.last) c.last = x.happened_at
      }
    }
    return {
      tl,
      log: sum(countBy(unwrap<{ database_id: string }[]>(e) ?? []), countBy(rows(t))),
      docs: sum(countBy(unwrap<{ database_id: string | null }[]>(d) ?? []), countBy(rows(dd))),
    }
  })

  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} action={<button type="button" className="btn btn--dark" onClick={() => setAdding(true)}>New database</button>} />
      <LoadState loading={loading && !data} error={error}>
        {data && data.length > 0 && counts.data && (() => {
          const tl = Object.values(counts.data.tl)
          const avg = Math.round(data.reduce((t, d) => t + completeness(d, counts.data!.log[d.id] ?? 0, counts.data!.docs[d.id] ?? 0).pct, 0) / data.length)
          const open = tl.reduce((t, x) => t + x.open, 0)
          return (
            <StatTiles items={[
              { value: data.length, label: 'databases', hint: `${data.filter((d) => d.machine === MACHINES[0]).length} on Machine A` },
              { value: `${avg}%`, label: 'documented on average' },
              { value: tl.reduce((t, x) => t + x.n, 0).toLocaleString('en-ZA'), label: 'timeline entries' },
              { value: open, label: open === 1 ? 'open error' : 'open errors', alert: open > 0 },
            ]} />
          )
        })()}
        {data && data.length === 0 ? (
          <EmptyState
            title="No databases added yet."
            text="Add one card per database, with its machine, type and records."
            action={<button type="button" className="btn btn--dark" onClick={() => setAdding(true)}>New database</button>}
          />
        ) : (
          <>
            {[
              { label: "Machine A: Rajen's PC", list: (data ?? []).filter((d) => d.machine === MACHINES[0]) },
              { label: "Machine B: Huzayfa's laptop", list: (data ?? []).filter((d) => d.machine === MACHINES[1]) },
              { label: 'Other', list: (data ?? []).filter((d) => d.machine !== MACHINES[0] && d.machine !== MACHINES[1]) },
            ].filter((g) => g.list.length > 0).map((g) => (
              <section key={g.label} className="dbgroup" aria-label={g.label}>
                <h2 className="dbgroup__h">{g.label} <span>{g.list.length}</span></h2>
                <div className="dbgrid">
                  {[...g.list].sort((x, y) => x.name.localeCompare(y.name)).map((d) => {
                    const pct = counts.data ? completeness(d, counts.data.log[d.id] ?? 0, counts.data.docs[d.id] ?? 0).pct : null
                    const st = counts.data?.tl[d.id]
                    return (
                      <Link key={d.id} to={`/app/databases/${d.id}`} className="dbcard2">
                        <span className="dbcard2__top">
                          <span className="dbcard2__ic" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>
                          </span>
                          <svg className="dbcard2__go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
                        </span>
                        <h3>{d.name}</h3>
                        <span className="dbcard2__chips">
                          {d.db_type && <span className="chip2">{d.db_type}</span>}
                          {d.status && <span className={`chip2 chip2--${/complete|verified/i.test(d.status) && !/awaiting/i.test(d.status) ? 'good' : 'wait'}`}><i aria-hidden="true" />{d.status}</span>}
                        </span>
                        <span className="dbcard2__foot">
                          <span>
                            {st ? `${st.n} ${st.n === 1 ? 'entry' : 'entries'}` : 'No entries'}
                            {st && st.open > 0 && <b className="dbcard2__open"> · {st.open} open {st.open === 1 ? 'error' : 'errors'}</b>}
                          </span>
                          {pct !== null && <b>{pct}%</b>}
                        </span>
                        {pct !== null && <span className="dbcard2__bar" role="img" aria-label={`${pct}% documented`}><i style={{ width: `${pct}%` }} /></span>}
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </>
        )}
      </LoadState>
      <Dialog open={adding} onClose={() => setAdding(false)} title="New database">
        {adding && <DbForm onClose={() => setAdding(false)} onDone={reload} />}
      </Dialog>
    </div>
  )
}

function DbForm({ db, onClose, onDone }: { db?: Db; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const name = String(fd.get('name') ?? '').trim()
    if (!name) return setErr('Give the database a name.')
    const row = { name, machine: String(fd.get('machine') ?? '').trim(), db_type: String(fd.get('type') ?? '').trim(), status: String(fd.get('status') ?? '').trim() }
    setBusy(true)
    try {
      if (db) unwrap(await supabase.from('databases').update(row).eq('id', db.id))
      else unwrap(await supabase.from('databases').insert(row))
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Name"><input type="text" name="name" autoFocus maxLength={120} defaultValue={db?.name ?? ''} /></Field>
      <div className="row2">
        <Field label="Machine it is on">
          <select name="machine" defaultValue={db?.machine ?? ''}>
            <option value="">Not set</option>
            {MACHINES.map((m) => <option key={m} value={m}>{m}</option>)}
            {db?.machine && !MACHINES.includes(db.machine) && <option value={db.machine}>{db.machine}</option>}
          </select>
        </Field>
        <Field label="Type">
          <input type="text" name="type" list="dbtypes" maxLength={60} defaultValue={db?.db_type ?? ''} />
          <datalist id="dbtypes">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
      </div>
      <Field label="Status" hint="Free text, for example Phase 1 complete."><input type="text" name="status" maxLength={80} defaultValue={db?.status ?? ''} /></Field>
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : db ? 'Save' : 'Create'}</button>
      </div>
    </form>
  )
}

/* ---------------- detail ---------------- */

const TABS = ['Timeline', 'Documents', 'Background', 'Build record', 'Development log'] as const
type Tab = (typeof TABS)[number]

export function DatabaseDetail() {
  const { confirm } = useFeedback()
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useLoad<Db | null>(async () =>
    unwrap<Db | null>(await supabase.from('databases').select('*').eq('id', id).maybeSingle()), [id])
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as Tab) : 'Timeline'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); p.delete('entry'); p.delete('doc'); return p }, { replace: true })
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function remove(d: Db) {
    if (!await confirm(`Delete "${d.name}" and all of its log entries and documents? This cannot be undone.`)) return
    try {
      const docs = unwrap<{ path: string }[]>(await supabase.from('documents').select('path').eq('database_id', d.id)) ?? []
      unwrap(await supabase.from('databases').delete().eq('id', d.id))
      if (docs.length) await supabase.storage.from('forged-files').remove(docs.map((x) => x.path))
      nav('/app/databases', { replace: true })
    } catch (e) { setMsg(describe(e)) }
  }

  async function saveField(field: 'background' | 'shortfalls' | 'build_record', text: string) {
    unwrap(await supabase.from('databases').update({ [field]: text }).eq('id', id))
    reload()
  }

  if (!loading && !error && data === null) return <Navigate to="/app/databases" replace />

  return (
    <div className="pg">
      <Link to="/app/databases" className="back">← All databases</Link>
      <LoadState loading={loading && !data} error={error}>
        {data && (
          <>
            <PageHead
              title={data.name}
              blurb={[data.machine, data.db_type, data.status].filter(Boolean).join(' · ') || 'No machine or type set yet.'}
              action={
                <>
                  <button type="button" className="btn" onClick={() => setEditing(true)}>Edit details</button>
                  <button type="button" className="btn btn--danger" onClick={() => remove(data)}>Delete</button>
                </>
              }
            />
            {msg && <p className="notice notice--err" role="alert">{msg}</p>}

            <CompletenessPanel db={data} />

            <div className="tabs" role="tablist" aria-label="Database sections">
              {TABS.map((t) => (
                <button key={t} type="button" role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            {tab === 'Background' && (
              <>
                <EditableText
                  title="Real-world context" value={data.background}
                  empty="What this database stands in for in the real world, and how that system works today."
                  onSave={(t) => saveField('background', t)}
                />
                <EditableText
                  title="Shortfalls" value={data.shortfalls}
                  empty="The real-world shortfalls of this system: what it gets wrong, misses or cannot do."
                  onSave={(t) => saveField('shortfalls', t)}
                />
                <ContentSections databaseId={data.id} area="background" />
              </>
            )}
            {tab === 'Build record' && (
              <>
                <ConnectionPanel db={data} onSaved={reload} />
                <EditableText
                  title="Technical detail" value={data.build_record}
                  empty="Tables, how it was populated, versions and anything else needed to rebuild it."
                  onSave={(t) => saveField('build_record', t)} rows={14}
                />
                <ContentSections databaseId={data.id} area="build" />
              </>
            )}
            {tab === 'Development log' && <LogPanel databaseId={data.id} />}
            {tab === 'Timeline' && <TimelineView databaseId={data.id} />}
            {tab === 'Documents' && (
              <>
                <DbDocuments databaseId={data.id} />
                <LegacyDocuments databaseId={data.id} />
              </>
            )}

            <Dialog open={editing} onClose={() => setEditing(false)} title="Edit details">
              {editing && <DbForm db={data} onClose={() => setEditing(false)} onDone={reload} />}
            </Dialog>
          </>
        )}
      </LoadState>
    </div>
  )
}

function ConnectionPanel({ db, onSaved }: { db: Db; onSaved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setBusy(true); setSaved(false)
    try {
      unwrap(await supabase.from('databases').update({
        port: String(fd.get('port') ?? '').trim(), instance_name: String(fd.get('instance') ?? '').trim(),
      }).eq('id', db.id))
      setErr(null); setSaved(true); onSaved()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <h3>Connection</h3>
      <form onSubmit={submit}>
        <div className="row2">
          <Field label="Port"><input type="text" name="port" maxLength={20} defaultValue={db.port} placeholder="e.g. 5432" /></Field>
          <Field label="Instance name"><input type="text" name="instance" maxLength={80} defaultValue={db.instance_name} placeholder="e.g. PUBHOSPITAL" /></Field>
        </div>
        {err && <p className="formerr" role="alert">{err}</p>}
        <button type="submit" className="btn btn--sm" disabled={busy}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save'}</button>
      </form>
    </section>
  )
}

/** How documented this database is, and exactly what is still missing. */
function CompletenessPanel({ db }: { db: Db }) {
  const { data } = useLoad<{ log: number; docs: number; n: number; open: number; resolved: number; last: string }>(async () => {
    const head = { count: 'exact', head: true } as const
    const [e, d, t, dd] = await Promise.all([
      supabase.from('db_entries').select('id', head).eq('database_id', db.id),
      supabase.from('documents').select('id', head).eq('database_id', db.id),
      supabase.from('timeline_entries').select('type, status, happened_at').eq('database_id', db.id),
      supabase.from('db_documents').select('id', head).eq('database_id', db.id).eq('is_current', true),
    ])
    const rows = (t.error ? [] : (t.data ?? [])) as { type: string; status: string | null; happened_at: string }[]
    // dated documents and timeline entries count too; a table that does not exist yet counts as nothing
    return {
      log: (e.count ?? 0) + rows.length, docs: (d.count ?? 0) + (dd.error ? 0 : dd.count ?? 0),
      n: rows.length, open: rows.filter((x) => x.type === 'Error' && x.status === 'Open').length,
      resolved: rows.filter((x) => x.type === 'Error' && x.status === 'Resolved').length,
      last: rows.reduce((m, x) => (x.happened_at > m ? x.happened_at : m), ''),
    }
  }, [db.id, db.background, db.shortfalls, db.build_record, db.port, db.instance_name, db.machine, db.db_type])
  if (!data) return null
  const c = completeness(db, data.log, data.docs)
  return (
    <>
      <section className="cbar" aria-label="Documentation progress">
        <div className="cbar__row">
          <strong>{c.have} of {c.total} parts documented</strong>
          <div className="cbar__track" role="img" aria-label={`${c.pct}% documented`}><i style={{ width: `${c.pct}%` }} /></div>
        </div>
        <p>{c.missing.length === 0 ? 'Everything this record needs is filled in.' : `Still missing: ${c.missing.map((m) => m.label.toLowerCase()).join(', ')}.`}</p>
      </section>
      <StatTiles items={[
        { value: data.n.toLocaleString('en-ZA'), label: data.n === 1 ? 'timeline entry' : 'timeline entries', hint: data.last ? `last ${fmtDate(data.last)}` : undefined },
        { value: data.open, label: data.open === 1 ? 'open error' : 'open errors', alert: data.open > 0, hint: data.resolved ? `${data.resolved} resolved` : undefined },
        { value: data.docs, label: data.docs === 1 ? 'document' : 'documents' },
        { value: `${c.pct}%`, label: 'documented' },
      ]} />
    </>
  )
}

function EditableText({
  title, value, empty, onSave, rows = 8,
}: { title: string; value: string; empty: string; onSave: (t: string) => Promise<void>; rows?: number }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try { await onSave(String(new FormData(e.currentTarget).get('text') ?? '')); setEditing(false); setErr(null) }
    catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <div className="bar" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {!editing && <button type="button" className="btn btn--sm" onClick={() => setEditing(true)}>{value ? 'Edit' : 'Write'}</button>}
      </div>
      {editing ? (
        <form onSubmit={submit}>
          <Field label="" hint="Formatting: **bold**, *italic*, [text](https://link), start lines with - for a list.">
            <textarea name="text" rows={rows} maxLength={40000} defaultValue={value} autoFocus />
          </Field>
          {err && <p className="formerr" role="alert">{err}</p>}
          <div className="dlg__foot" style={{ justifyContent: 'flex-start' }}>
            <button type="submit" className="btn btn--dark btn--sm" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn--sm" onClick={() => { setEditing(false); setErr(null) }}>Cancel</button>
          </div>
        </form>
      ) : value.trim() ? <Rich text={value} /> : <p className="muted">{empty}</p>}
    </section>
  )
}

/* ---------------- development log ---------------- */

type Entry = { id: string; database_id: string; title: string; body: string; entry_date: string }
type TlItem = { id: string; type: string; author: string; title: string; summary: string; happened_at: string; status: string | null }

function LogPanel({ databaseId }: { databaseId: string }) {
  const { confirm } = useFeedback()
  const { data, error, loading, reload } = useLoad<Entry[]>(async () =>
    unwrap<Entry[]>(await supabase.from('db_entries').select('*').eq('database_id', databaseId)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false })) ?? [], [databaseId])
  // what Claude Code (and the team) logged on the timeline for this database also shows here
  const tl = useLoad<TlItem[]>(async () =>
    unwrap<TlItem[]>(await supabase.from('timeline_entries').select('id, type, author, title, summary, happened_at, status')
      .eq('database_id', databaseId).order('happened_at', { ascending: false }).limit(500)) ?? [], [databaseId])
  const [editing, setEditing] = useState<Entry | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const merged = [
    ...(data ?? []).map((en) => ({ at: en.entry_date, en, t: null as TlItem | null })),
    ...(tl.data ?? []).map((t) => ({ at: t.happened_at, en: null as Entry | null, t })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  async function remove(en: Entry) {
    if (!await confirm(`Delete "${en.title}"?`)) return
    try { unwrap(await supabase.from('db_entries').delete().eq('id', en.id)); reload() } catch (e) { setMsg(describe(e)) }
  }

  return (
    <>
      <div className="bar">
        <span className="muted">Ongoing progress, newest first. Entries Claude Code logs on the timeline appear here too.</span>
        <button type="button" className="btn btn--dark" onClick={() => setEditing('new')}>Add entry</button>
      </div>
      {msg && <p className="notice notice--err" role="alert">{msg}</p>}
      <LoadState loading={(loading && !data) || (tl.loading && !tl.data)} error={error}>
        {merged.length === 0 ? (
          <EmptyState title="No log entries yet." text="Claude Code adds entries as it works. You can also write one by hand." />
        ) : (
          merged.map(({ en, t }) => t ? (
            <article className="post" key={`t${t.id}`}>
              <div className="post__top">
                <h2 style={{ fontSize: 16 }}>{t.title}</h2>
                <Link className="btn btn--sm" to={`/app/databases/${databaseId}?tab=Timeline&entry=${t.id}`}>Open on timeline</Link>
              </div>
              <div className="post__meta">
                <span>{fmtDate(t.happened_at)}</span>
                <span className={`chip${t.author === 'Claude Code' ? ' chip--on' : ''}`}>{t.author}</span>
                <span className="chip">{t.type}{t.status ? `, ${t.status}` : ''}</span>
              </div>
              {t.summary && <p className="rich">{t.summary}</p>}
            </article>
          ) : en && (
            <article className="post" key={en.id}>
              <div className="post__top">
                <h2 style={{ fontSize: 16 }}>{en.title}</h2>
                <div className="item__acts">
                  <button type="button" className="btn btn--sm" onClick={() => setEditing(en)}>Edit</button>
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => remove(en)}>Delete</button>
                </div>
              </div>
              <div className="post__meta"><span>{fmtDate(en.entry_date)}</span></div>
              <Rich text={en.body} />
            </article>
          ))
        )}
      </LoadState>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing && editing !== 'new' ? 'Edit entry' : 'New log entry'}>
        {editing && (
          <EntryForm
            key={editing === 'new' ? 'new' : editing.id}
            databaseId={databaseId} entry={editing === 'new' ? null : editing}
            onClose={() => setEditing(null)} onDone={reload}
          />
        )}
      </Dialog>
    </>
  )
}

function EntryForm({ databaseId, entry, onClose, onDone }: { databaseId: string; entry: Entry | null; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const title = String(fd.get('title') ?? '').trim()
    if (!title) return setErr('Give the entry a title.')
    const row = { title, body: String(fd.get('body') ?? ''), entry_date: String(fd.get('date') ?? '') || todayStr() }
    setBusy(true)
    try {
      if (entry) unwrap(await supabase.from('db_entries').update(row).eq('id', entry.id))
      else unwrap(await supabase.from('db_entries').insert({ ...row, database_id: databaseId }))
      onDone(); onClose()
    } catch (ex) { setErr(describe(ex)) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Title"><input type="text" name="title" autoFocus maxLength={200} defaultValue={entry?.title ?? ''} /></Field>
      <Field label="Date"><input type="date" name="date" defaultValue={entry?.entry_date ?? todayStr()} /></Field>
      <Field label="Details" hint="Formatting: **bold**, *italic*, [text](https://link), start lines with - for a list.">
        <textarea name="body" rows={7} maxLength={20000} defaultValue={entry?.body ?? ''} />
      </Field>
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : entry ? 'Save changes' : 'Add entry'}</button>
      </div>
    </form>
  )
}


/** Files uploaded before documents were dated: still shown, only if there are any. */
function LegacyDocuments({ databaseId }: { databaseId: string }) {
  const { data } = useLoad<number>(async () => {
    const r = await supabase.from('documents').select('id', { count: 'exact', head: true }).eq('database_id', databaseId)
    return r.count ?? 0
  }, [databaseId])
  if (!data) return null
  return (
    <section style={{ marginTop: 28 }}>
      <h3 className="group-title">Earlier uploads</h3>
      <DocumentsPanel databaseId={databaseId} />
    </section>
  )
}
