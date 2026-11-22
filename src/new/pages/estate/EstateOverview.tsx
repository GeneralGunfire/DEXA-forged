import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { fmtDate, unwrap, useLoad } from '../../../lib/data'
import { btn } from '../calendar/cal'
import { InDepth } from '../databases/Sections'
import { LIMITS_TITLE, MACHINES } from '../databases/shared'
import { cn } from '@/lib/utils'

type Db = { id: string; name: string; machine: string; status: string; db_type: string }
type Note = { id: string; database_id: string; happened_at: string; detail: string; summary: string }
type Accepted = { id: string; database_id: string | null; title: string; summary: string; detail: string; happened_at: string }
type ErrRow = { database_id: string | null; status: string | null }

const ACCEPTED_PREFIX = 'Accepted for simulated sources:'
const NOT_SET = 'Machine not set'
const COLS = 'md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_8.5rem_6.5rem]'
const rec = (id: string) => `/new/documentation/databases/${id}`

export default function EstateOverview() {
  const dbs = useLoad<Db[]>(async () => unwrap<Db[]>(await supabase.from('databases').select('id, name, machine, status, db_type').order('name')) ?? [])
  const facts = useLoad<{ notes: Note[]; accepted: Accepted[]; errors: ErrRow[] }>(async () => {
    const [n, a, e] = await Promise.all([
      supabase.from('timeline_entries').select('id, database_id, happened_at, detail, summary').eq('title', LIMITS_TITLE).order('happened_at', { ascending: false }).limit(1000),
      supabase.from('timeline_entries').select('id, database_id, title, summary, detail, happened_at').eq('type', 'Decision').like('title', `${ACCEPTED_PREFIX}%`).order('happened_at', { ascending: false }).limit(1000),
      supabase.from('timeline_entries').select('database_id, status').eq('type', 'Error').limit(10000),
    ])
    const ok = <T,>(r: { error: unknown; data: unknown }) => (r.error ? [] : ((r.data ?? []) as T[]))
    return { notes: ok<Note>(n), accepted: ok<Accepted>(a), errors: ok<ErrRow>(e).filter((x) => x.status !== 'Resolved') }
  })
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [detailIds, setDetailIds] = useState<Set<string>>(new Set())

  const all = dbs.data ?? []
  const f = facts.data
  // newest "Verified against the source" note for each database
  const newest = useMemo(() => {
    const m = new Map<string, Note>()
    for (const n of f?.notes ?? []) if (!m.has(n.database_id) || n.happened_at > m.get(n.database_id)!.happened_at) m.set(n.database_id, n)
    return m
  }, [f])
  const openBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of f?.errors ?? []) if (e.database_id) m.set(e.database_id, (m.get(e.database_id) ?? 0) + 1)
    return m
  }, [f])

  // machines in a fixed order: Rajen's PC, Huzayfa's laptop, any other, then "not set"; databases A to Z inside each
  const groups = useMemo(() => {
    const extra = Array.from(new Set(all.map((d) => d.machine.trim()).filter((m) => m && !MACHINES.includes(m)))).sort()
    const g = [...MACHINES, ...extra].map((m) => ({ label: m, list: all.filter((d) => d.machine.trim() === m) }))
    g.push({ label: NOT_SET, list: all.filter((d) => !d.machine.trim()) })
    return g.filter((x) => x.list.length > 0).map((x) => ({ ...x, list: [...x.list].sort((a, b) => a.name.localeCompare(b.name)) }))
  }, [all])
  const ordered = useMemo(() => groups.flatMap((g) => g.list), [groups])

  const statuses = useMemo(() => {
    const c = new Map<string, number>()
    for (const d of all) { const k = d.status.trim() || 'No status'; c.set(k, (c.get(k) ?? 0) + 1) }
    return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [all])
  const errorsByMachine = groups.map((g) => ({ label: g.label, n: g.list.reduce((s, d) => s + (openBy.get(d.id) ?? 0), 0) }))
  const latest = [...newest.values()].reduce((m, n) => (n.happened_at > m ? n.happened_at : m), '')

  const withNote = ordered.filter((d) => newest.has(d.id))
  const without = ordered.filter((d) => !newest.has(d.id))
  const waiting = useMemo(() => {
    const c = new Map<string, string[]>()
    for (const d of without) { const k = d.status.trim() || 'No status'; c.set(k, [...(c.get(k) ?? []), d.name]) }
    return [...c.entries()]
  }, [without])

  const allOpen = withNote.length > 0 && withNote.every((d) => openIds.has(d.id))
  const toggle = (id: string) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const dbName = (id: string | null) => all.find((d) => d.id === id)?.name
  const loading = (dbs.loading && !dbs.data) || (facts.loading && !facts.data)
  const error = dbs.error || facts.error

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Documentation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Estate overview</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Every database in one ordered summary. It is read-only: open a record to change anything.</p>
        </div>
        <button type="button" className={btn} onClick={() => { dbs.reload(); facts.reload() }} disabled={dbs.loading || facts.loading}>
          <RefreshCw className={cn('size-4', (dbs.loading || facts.loading) && 'animate-spin')} aria-hidden="true" /> Refresh
        </button>
      </header>

      {error ? <p className="mt-10 text-sm text-destructive" role="alert">Could not load the estate: {error}</p>
        : loading ? <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
        : all.length === 0 ? <p className="mt-10 border-t border-border pt-10 text-center text-sm text-muted-foreground">No databases yet.</p>
        : (
          <>
            {/* totals */}
            <dl className="mt-8 grid gap-x-10 gap-y-6 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Databases</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{all.length}</dd>
                <p className="mt-0.5 text-xs text-muted-foreground">{groups.map((g) => `${g.list.length} on ${g.label}`).join(', ')}</p>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Status</dt>
                <dd className="mt-2 space-y-1.5">
                  {statuses.map(([s, n]) => (
                    <p key={s} className="flex items-baseline gap-2 text-sm"><span className="w-7 text-right text-xl font-semibold tabular-nums tracking-tight">{n}</span><span className="text-foreground/90">{s}</span></p>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Open errors</dt>
                <dd className="mt-2 space-y-1.5">
                  {errorsByMachine.map((m) => (
                    <p key={m.label} className="flex items-baseline gap-2 text-sm"><span className="w-7 text-right text-xl font-semibold tabular-nums tracking-tight">{m.n}</span><span className="text-foreground/90">on {m.label}</span></p>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Latest verification</dt>
                <dd className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">{latest ? fmtDate(latest) : '–'}</dd>
                <p className="mt-0.5 text-xs text-muted-foreground">{newest.size} of {all.length} databases</p>
              </div>
            </dl>

            {/* the ordered list */}
            <div className="mt-12 space-y-10">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label} className="border-t border-border pt-5">
                  <h2 className="flex items-baseline gap-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{g.label}<span className="tabular-nums normal-case tracking-normal">{g.list.length}</span></h2>
                  <div className={cn('mt-3 hidden gap-4 px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:grid', COLS)} aria-hidden="true">
                    <span>Database</span><span>Status</span><span>Last verified</span><span className="text-right">Open errors</span>
                  </div>
                  <ul className="divide-y divide-border border-y border-border">
                    {g.list.map((d) => {
                      const v = newest.get(d.id)
                      const open = openBy.get(d.id) ?? 0
                      return (
                        <li key={d.id}>
                          <Link to={rec(d.id)} className={cn('group grid items-center gap-x-4 gap-y-1 px-3 py-3.5 transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-ring', COLS)}>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground">{d.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{d.db_type || 'Type not set'}</span>
                            </span>
                            <span className="min-w-0 truncate text-sm text-foreground/90">{d.status || <span className="text-muted-foreground">No status</span>}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{v ? fmtDate(v.happened_at) : '–'}</span>
                            <span className="text-xs tabular-nums text-foreground/80 md:text-right">{open === 0 ? 'None open' : `${open} open`}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>

            {/* known limits */}
            <section aria-label="Known limits" className="mt-14 border-t border-border pt-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Known limits <span className="ml-2 tabular-nums normal-case tracking-normal">{withNote.length} {withNote.length === 1 ? 'database' : 'databases'}</span></h2>
                {withNote.length ? <button type="button" className="text-xs text-muted-foreground transition-colors hover:text-foreground" onClick={() => setOpenIds(allOpen ? new Set() : new Set(withNote.map((d) => d.id)))}>{allOpen ? 'Collapse all' : 'Expand all'}</button> : null}
              </div>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">The detail text of each database's newest note, “{LIMITS_TITLE}”.</p>
              {withNote.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No verification notes yet.</p> : (
                <ul className="mt-3 divide-y divide-border border-y border-border">
                  {withNote.map((d) => {
                    const v = newest.get(d.id)!
                    const on = openIds.has(d.id)
                    const text = v.detail.trim() || v.summary.trim()
                    return (
                      <li key={d.id}>
                        <button type="button" aria-expanded={on} onClick={() => toggle(d.id)} className="flex w-full items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring">
                          <ChevronRight aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform', on && 'rotate-90')} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtDate(v.happened_at)}</span>
                        </button>
                        {on ? (
                          <div className="pb-5 pl-8 pr-1">
                            {text ? <p className="max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{text}</p> : <p className="text-sm text-muted-foreground">This note has no detail text.</p>}
                            <Link to={rec(d.id)} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Open the record</Link>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
              {waiting.map(([s, names]) => (
                <p key={s} className="mt-4 text-sm leading-6 text-foreground/90"><span className="font-medium">{s}:</span> {names.map((n, i) => { const d = without.find((x) => x.name === n)!; return <span key={d.id}>{i > 0 && ', '}<Link className="text-primary hover:underline" to={rec(d.id)}>{n}</Link></span> })}</p>
              ))}
            </section>

            {/* accepted limits */}
            <section aria-label="Accepted limits" className="mt-14 border-t border-border pt-5">
              <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Accepted limits <span className="ml-2 tabular-nums normal-case tracking-normal">{f?.accepted.length ?? 0}</span></h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">Decisions titled “{ACCEPTED_PREFIX} …”.</p>
              {!f || f.accepted.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">None recorded.</p> : (
                <ul className="mt-3 divide-y divide-border border-y border-border">
                  {f.accepted.map((a) => {
                    const more = detailIds.has(a.id)
                    return (
                      <li key={a.id} className="py-4">
                        <p className="break-words text-sm font-medium leading-snug">{a.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {a.database_id ? <Link className="text-primary hover:underline" to={rec(a.database_id)}>{dbName(a.database_id) ?? 'Database'}</Link> : 'Whole estate'} · {fmtDate(a.happened_at)}
                        </p>
                        {a.summary ? <p className="mt-2 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{a.summary}</p> : null}
                        {a.detail ? (
                          <>
                            <button type="button" aria-expanded={more} onClick={() => setDetailIds((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n })} className="mt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">{more ? 'Hide detail' : 'Show detail'}</button>
                            {more ? <p className="mt-2 max-w-[72ch] whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">{a.detail}</p> : null}
                          </>
                        ) : null}
                        {a.database_id ? <p className="mt-3"><Link className="text-xs font-medium text-primary hover:underline" to={`${rec(a.database_id)}?tab=Timeline&entry=${a.id}`}>Open on the timeline</Link></p> : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* whole-estate sections, read only, plain text */}
            <InDepth databaseId={null} area="estate" plain />
          </>
        )}
    </div>
  )
}
