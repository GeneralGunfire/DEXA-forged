import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { describe, fmtDate, todayStr, unwrap, useLoad } from '../../lib/data'
import { Dialog, EmptyState, Field, LoadState, PageHead, Rich } from '../../components/ui'
import { DocumentsPanel } from './Documents'
import { sectionByPath } from './sections'
import './pages.css'

type Db = {
  id: string; name: string; machine: string; db_type: string; port: string; instance_name: string
  background: string; shortfalls: string; build_record: string; created_at: string
}

const MACHINES = ["Rajen's PC", "Huzayfa's laptop"]
const TYPES = ['PostgreSQL', 'SQL Server', 'SQLite', 'MySQL', 'CSV files']

/* ---------------- list ---------------- */

export function DatabaseBoard() {
  const s = sectionByPath('databases')
  const { data, error, loading, reload } = useLoad<Db[]>(async () =>
    unwrap<Db[]>(await supabase.from('databases').select('*').order('created_at', { ascending: false })) ?? [])
  const [adding, setAdding] = useState(false)

  return (
    <div className="pg">
      <PageHead title={s.label} blurb={s.blurb} action={<button type="button" className="btn btn--dark" onClick={() => setAdding(true)}>New database</button>} />
      <LoadState loading={loading && !data} error={error}>
        {data && data.length === 0 ? (
          <EmptyState
            title="No databases added yet."
            text="Add one card per database, with its machine, type and records."
            action={<button type="button" className="btn btn--dark" onClick={() => setAdding(true)}>New database</button>}
          />
        ) : (
          <div className="tiles">
            {(data ?? []).map((d) => (
              <Link key={d.id} to={`/app/databases/${d.id}`} className="dbcard">
                <h3>{d.name}</h3>
                <dl>
                  <div><dt>Machine</dt><dd>{d.machine || '—'}</dd></div>
                  <div><dt>Type</dt><dd>{d.db_type || '—'}</dd></div>
                </dl>
              </Link>
            ))}
          </div>
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
    const row = { name, machine: String(fd.get('machine') ?? '').trim(), db_type: String(fd.get('type') ?? '').trim() }
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
      {err && <p className="formerr" role="alert">{err}</p>}
      <div className="dlg__foot">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--dark" disabled={busy}>{busy ? 'Saving…' : db ? 'Save' : 'Create'}</button>
      </div>
    </form>
  )
}

/* ---------------- detail ---------------- */

const TABS = ['Background', 'Build record', 'Development log', 'Documents'] as const
type Tab = (typeof TABS)[number]

export function DatabaseDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useLoad<Db | null>(async () =>
    unwrap<Db | null>(await supabase.from('databases').select('*').eq('id', id).maybeSingle()), [id])
  const [tab, setTab] = useState<Tab>('Background')
  const [editing, setEditing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function remove(d: Db) {
    if (!window.confirm(`Delete "${d.name}" and all of its log entries and documents? This cannot be undone.`)) return
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
              blurb={[data.machine, data.db_type].filter(Boolean).join(' · ') || 'No machine or type set yet.'}
              action={
                <>
                  <button type="button" className="btn" onClick={() => setEditing(true)}>Edit details</button>
                  <button type="button" className="btn btn--danger" onClick={() => remove(data)}>Delete</button>
                </>
              }
            />
            {msg && <p className="notice notice--err" role="alert">{msg}</p>}

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
              </>
            )}
            {tab === 'Development log' && <LogPanel databaseId={data.id} />}
            {tab === 'Documents' && <DocumentsPanel databaseId={data.id} />}

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

function LogPanel({ databaseId }: { databaseId: string }) {
  const { data, error, loading, reload } = useLoad<Entry[]>(async () =>
    unwrap<Entry[]>(await supabase.from('db_entries').select('*').eq('database_id', databaseId)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false })) ?? [], [databaseId])
  const [editing, setEditing] = useState<Entry | 'new' | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function remove(en: Entry) {
    if (!window.confirm(`Delete "${en.title}"?`)) return
    try { unwrap(await supabase.from('db_entries').delete().eq('id', en.id)); reload() } catch (e) { setMsg(describe(e)) }
  }

  return (
    <>
      <div className="bar">
        <span className="muted">Ongoing progress, newest first.</span>
        <button type="button" className="btn btn--dark" onClick={() => setEditing('new')}>Add entry</button>
      </div>
      {msg && <p className="notice notice--err" role="alert">{msg}</p>}
      <LoadState loading={loading && !data} error={error}>
        {data && data.length === 0 ? (
          <EmptyState title="No log entries yet." text="Record progress as you build and change this database." />
        ) : (
          (data ?? []).map((en) => (
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

