import { useState } from 'react'
import { Check, Minus, Pencil } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { describe, fmtDate, unwrap, useLoad } from '../../../lib/data'
import { CHECKS, completeness } from '../../../lib/completeness'
import { btn, btnGhost, btnPrimary, field, label } from '../calendar/cal'
import { Rich } from '@/components/rich'
import { Note } from '@/components/ui/note'
import { cn } from '@/lib/utils'
import { InDepth } from './Sections'
import { ago, LIMITS_TITLE, type Db } from './shared'
import { Loading } from '@/components/ui/loading'

const Sec = ({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <section className={cn('border-t border-border pt-5', className)}>
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
      {aside}
    </div>
    {children}
  </section>
)

/* ---------------- Overview ---------------- */

type Stats = {
  n: number; open: number; resolved: number; last: string; log: number; docs: number; bg: number; build: number
  limits: { detail: string; summary: string; happened_at: string } | null
}

export function OverviewTab({ db }: { db: Db }) {
  const { data, loading, error } = useLoad<Stats>(async () => {
    const head = { count: 'exact', head: true } as const
    const [t, e, d, dd, sec, lim] = await Promise.all([
      supabase.from('timeline_entries').select('type, status, happened_at').eq('database_id', db.id).limit(10000),
      supabase.from('db_entries').select('id', head).eq('database_id', db.id),
      supabase.from('documents').select('id', head).eq('database_id', db.id),
      supabase.from('db_documents').select('id', head).eq('database_id', db.id).eq('is_current', true),
      supabase.from('db_content').select('area').eq('database_id', db.id).limit(10000),
      supabase.from('timeline_entries').select('detail, summary, happened_at').eq('database_id', db.id).eq('title', LIMITS_TITLE).order('happened_at', { ascending: false }).limit(1),
    ])
    const rows = (t.error ? [] : t.data ?? []) as { type: string; status: string | null; happened_at: string }[]
    const secs = (sec.error ? [] : sec.data ?? []) as { area: string }[]
    return {
      n: rows.length,
      open: rows.filter((x) => x.type === 'Error' && x.status !== 'Resolved').length,
      resolved: rows.filter((x) => x.type === 'Error' && x.status === 'Resolved').length,
      last: rows.reduce((m, x) => (x.happened_at > m ? x.happened_at : m), ''),
      log: (e.error ? 0 : e.count ?? 0) + rows.length,
      docs: (d.error ? 0 : d.count ?? 0) + (dd.error ? 0 : dd.count ?? 0),
      bg: secs.filter((s) => s.area === 'background').length,
      build: secs.filter((s) => s.area === 'build').length,
      limits: lim.error ? null : ((lim.data ?? [])[0] as Stats['limits']) ?? null,
    }
  }, [db.id, db.background, db.shortfalls, db.build_record, db.port, db.instance_name, db.machine, db.db_type])
  const [showAll, setShowAll] = useState(false)

  if (error) return <p className="text-sm text-destructive" role="alert">Could not load the overview: {error}</p>
  if (loading && !data) return <Loading variant="detail" />
  if (!data) return null
  const c = completeness(db, data.log, data.docs)
  const limitsText = (data.limits?.detail?.trim() || data.limits?.summary?.trim() || '')
  const long = limitsText.split('\n').length > 14 || limitsText.length > 1400

  const figures: [string, string | number, string | undefined, boolean?][] = [
    ['Timeline entries', data.n.toLocaleString('en-ZA'), data.last ? `last ${ago(data.last)}` : 'nothing yet'],
    ['Open errors', data.open, data.open ? 'need attention' : 'all clear', true],
    ['Errors fixed', data.resolved, undefined],
    ['Documents', data.docs, data.docs ? undefined : 'none uploaded'],
    ['In-depth sections', data.bg + data.build, `${data.bg} background, ${data.build} build`],
    ['Documented', `${c.pct}%`, `${c.have} of ${c.total} parts`],
  ]

  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {figures.map(([k, v, note, bad]) => (
          <div key={k}>
            <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
            <dd className={cn('mt-1 text-3xl font-semibold tabular-nums tracking-tight', bad && Number(v) > 0 && 'text-destructive')}>{v}</dd>
            {note ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{note}</p> : null}
          </div>
        ))}
      </dl>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          {limitsText ? (
            <Sec title="Known limits">
              <p className="mb-3 text-xs text-muted-foreground">From the note “{LIMITS_TITLE}”, {fmtDate(data.limits!.happened_at)}.</p>
              <div className={cn('relative', long && !showAll && 'max-h-72 overflow-hidden')}>
                <p className="max-w-[72ch] whitespace-pre-wrap break-words text-[14px] leading-7 text-foreground/90">{limitsText}</p>
                {long && !showAll ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" /> : null}
              </div>
              {long ? <button type="button" className="mt-2 text-xs font-medium text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show less' : 'Show all'}</button> : null}
            </Sec>
          ) : null}

          <Sec title="Documentation progress" aside={<span className="text-xs tabular-nums text-muted-foreground">{c.have} of {c.total} parts</span>}>
            <div className="h-1.5 rounded-full bg-secondary" role="img" aria-label={`${c.pct}% documented`}><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${c.pct}%` }} /></div>
            <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {CHECKS.map((k) => (
                <li key={k.k} className="flex items-center gap-2.5 text-sm">
                  {c.ok[k.k]
                    ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    : <Minus aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
                  <span className={cn(!c.ok[k.k] && 'text-muted-foreground')}>{k.label}</span>
                  <span className="sr-only">{c.ok[k.k] ? 'done' : 'missing'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">{c.missing.length === 0 ? 'Everything this record needs is filled in.' : `Still missing: ${c.missing.map((m) => m.label.toLowerCase()).join(', ')}.`}</p>
          </Sec>
        </div>

        <Sec title="Details">
          <dl className="divide-y divide-border border-y border-border text-sm">
            {[['Status', db.status], ['Machine', db.machine], ['Type', db.db_type], ['Port', db.port], ['Instance name', db.instance_name], ['Added', fmtDate(db.created_at)]].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-2.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 break-words">{v || <span className="text-muted-foreground">Not set</span>}</dd>
              </div>
            ))}
          </dl>
        </Sec>
      </div>
    </div>
  )
}

/* ---------------- editable text (Background, Shortfalls, Technical detail) ---------------- */

function EditableText({ title, value, empty, limit, onSave, rows = 9 }: { title: string; value: string; empty: string; limit: number; onSave: (t: string) => Promise<void>; rows?: number }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const left = limit - text.length

  async function save() {
    if (busy) return
    if (text.length > limit) return setErr(`This is ${(-left).toLocaleString('en-ZA')} characters over the ${limit.toLocaleString('en-ZA')} limit. Shorten it and try again.`)
    setBusy(true); setErr(null)
    try { await onSave(text); setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2500) }
    catch (ex) { setErr(describe(ex)) }
    finally { setBusy(false) }
  }

  return (
    <Sec
      title={title}
      aside={!editing ? <button type="button" className={cn(btnGhost, '!h-7 !px-2 text-xs')} onClick={() => { setText(value); setErr(null); setEditing(true) }}><Pencil className="size-3.5" aria-hidden="true" /> {value ? 'Edit' : 'Write'}</button> : undefined}
    >
      {editing ? (
        <div>
          <label className="sr-only" htmlFor={`ed-${title}`}>{title}</label>
          <textarea id={`ed-${title}`} data-autofocus rows={rows} className={cn(field, 'min-h-48 resize-y leading-6')} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Formatting: **bold**, *italic*, [text](https://link), start lines with - for a list.</span>
            <span className={cn('tabular-nums', left < 0 ? 'font-medium text-destructive' : left < 500 && 'text-foreground')}>{text.length.toLocaleString('en-ZA')} / {limit.toLocaleString('en-ZA')}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className={btn} disabled={busy} onClick={() => { setEditing(false); setErr(null) }}>Cancel</button>
          </div>
          {err ? <Note>{err}</Note> : null}
        </div>
      ) : (
        <>
          {value.trim() ? <Rich text={value} className="max-w-[72ch]" /> : <p className="text-sm text-muted-foreground">{empty}</p>}
          {saved ? <Note ok>Saved.</Note> : null}
        </>
      )}
    </Sec>
  )
}

async function saveField(id: string, field: 'background' | 'shortfalls' | 'build_record', text: string, reload: () => void) {
  unwrap(await supabase.from('databases').update({ [field]: text }).eq('id', id))
  reload()
}

export function BackgroundTab({ db, reload }: { db: Db; reload: () => void }) {
  return (
    <div className="space-y-10">
      <EditableText title="Real-world context" value={db.background} limit={20000} empty="What this database stands in for in the real world, and how that system works today." onSave={(t) => saveField(db.id, 'background', t, reload)} />
      <EditableText title="Shortfalls" value={db.shortfalls} limit={20000} empty="The real-world shortfalls of this system: what it gets wrong, misses or cannot do." onSave={(t) => saveField(db.id, 'shortfalls', t, reload)} />
      <InDepth databaseId={db.id} area="background" />
    </div>
  )
}

function Connection({ db, reload }: { db: Db; reload: () => void }) {
  const [port, setPort] = useState(db.port)
  const [inst, setInst] = useState(db.instance_name)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const dirty = port !== db.port || inst !== db.instance_name
  async function save() {
    setBusy(true); setMsg(null)
    try { unwrap(await supabase.from('databases').update({ port: port.trim(), instance_name: inst.trim() }).eq('id', db.id)); reload(); setMsg({ ok: true, t: 'Saved.' }) }
    catch (e) { setMsg({ ok: false, t: describe(e) }) }
    finally { setBusy(false) }
  }
  return (
    <Sec title="Connection">
      <div className="grid max-w-xl gap-5 sm:grid-cols-2">
        <div><label className={label} htmlFor="cn-port">Port</label><input id="cn-port" className={field} value={port} maxLength={20} placeholder="e.g. 5432" onChange={(e) => setPort(e.target.value)} /></div>
        <div><label className={label} htmlFor="cn-inst">Instance name</label><input id="cn-inst" className={field} value={inst} maxLength={80} placeholder="e.g. PUBHOSPITAL" onChange={(e) => setInst(e.target.value)} /></div>
      </div>
      <div className="mt-4"><button type="button" className={btn} disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div>
      {msg ? <Note ok={msg.ok}>{msg.t}</Note> : null}
    </Sec>
  )
}

export function BuildTab({ db, reload }: { db: Db; reload: () => void }) {
  return (
    <div className="space-y-10">
      <Connection key={`${db.port}|${db.instance_name}`} db={db} reload={reload} />
      <EditableText title="Technical detail" value={db.build_record} limit={40000} rows={14} empty="Tables, how it was populated, versions and anything else needed to rebuild it." onSave={(t) => saveField(db.id, 'build_record', t, reload)} />
      <InDepth databaseId={db.id} area="build" />
    </div>
  )
}
