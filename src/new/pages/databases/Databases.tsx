import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { fmtDate, unwrap, useLoad } from '../../../lib/data'
import { btn, btnPrimary } from '../calendar/cal'
import { DbForm } from './DbForm'
import { ago, MACHINES, type Db } from './shared'
import { cn } from '@/lib/utils'

type Meta = { n: number; open: number; last: string }

const COLS = 'md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_8.5rem_5rem_6.5rem]'

export default function Databases() {
  const nav = useNavigate()
  const [adding, setAdding] = useState(false)
  const dbs = useLoad<Db[]>(async () => unwrap<Db[]>(await supabase.from('databases').select('*').order('name')) ?? [])
  // how much has been logged for each database, and when anything last changed (a timeline entry or an in-depth section)
  const meta = useLoad<Record<string, Meta>>(async () => {
    const [t, c] = await Promise.all([
      supabase.from('timeline_entries').select('database_id, type, status, happened_at').not('database_id', 'is', null).limit(10000),
      supabase.from('db_content').select('database_id, updated_at').not('database_id', 'is', null).limit(10000),
    ])
    const out: Record<string, Meta> = {}
    for (const x of (t.error ? [] : t.data ?? []) as { database_id: string; type: string; status: string | null; happened_at: string }[]) {
      const m = (out[x.database_id] ??= { n: 0, open: 0, last: '' })
      m.n++
      if (x.type === 'Error' && x.status !== 'Resolved') m.open++
      if (x.happened_at > m.last) m.last = x.happened_at
    }
    for (const x of (c.error ? [] : c.data ?? []) as { database_id: string; updated_at: string }[]) {
      const m = (out[x.database_id] ??= { n: 0, open: 0, last: '' })
      if (x.updated_at > m.last) m.last = x.updated_at
    }
    return out
  })

  const all = dbs.data ?? []
  const groups = useMemo(() => {
    const names = [...MACHINES, ...Array.from(new Set(all.map((d) => d.machine.trim()).filter((m) => m && !MACHINES.includes(m)))).sort()]
    const g = names.map((m) => ({ label: m, list: all.filter((d) => d.machine.trim() === m) }))
    g.push({ label: 'Machine not set', list: all.filter((d) => !d.machine.trim()) })
    return g.filter((x) => x.list.length > 0)
  }, [all])
  const m = meta.data ?? {}
  const openTotal = Object.values(m).reduce((a, x) => a + x.open, 0)
  const entryTotal = Object.values(m).reduce((a, x) => a + x.n, 0)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Documentation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Databases</h1>
          <p className="mt-2 text-sm text-muted-foreground">One record for each database: its background, build record, documents and timeline.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => { dbs.reload(); meta.reload() }} disabled={dbs.loading}><RefreshCw className={cn('size-4', dbs.loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
          <button type="button" className={btnPrimary} onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" /> New database</button>
        </div>
      </header>

      {all.length > 0 ? (
        <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-5 sm:max-w-xl">
          {[['Databases', all.length, false], ['Timeline entries', entryTotal, false], ['Open errors', openTotal, true]].map(([k, v, bad]) => (
            <div key={String(k)}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
              <dd className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', bad && Number(v) > 0 && 'text-destructive')}>{Number(v).toLocaleString('en-ZA')}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-10">
        {dbs.error ? (
          <p className="text-sm text-destructive" role="alert">Could not load the databases: {dbs.error}</p>
        ) : dbs.loading && !dbs.data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : all.length === 0 ? (
          <div className="border-t border-border py-16 text-center">
            <p className="text-lg font-medium">No databases added yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">Add one record per database, with its machine, type and status.</p>
            <button type="button" className={btnPrimary + ' mt-6'} onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden="true" /> New database</button>
          </div>
        ) : (
          <div className="space-y-12">
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label} className="border-t border-border pt-5">
                <h2 className="flex items-baseline gap-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {g.label}<span className="tabular-nums normal-case tracking-normal">{g.list.length}</span>
                </h2>
                <div className={cn('mt-3 hidden gap-4 px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:grid', COLS)} aria-hidden="true">
                  <span>Database</span><span>Status</span><span>Last updated</span><span className="text-right">Entries</span><span className="text-right">Open errors</span>
                </div>
                <ul className="divide-y divide-border border-y border-border">
                  {g.list.map((d) => {
                    const x = m[d.id]
                    return (
                      <li key={d.id}>
                        <Link to={`/new/documentation/databases/${d.id}`} className={cn('group grid items-center gap-x-4 gap-y-1 px-3 py-3.5 transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-ring', COLS)}>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground">{d.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{d.db_type || 'Type not set'}</span>
                            </span>
                            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 md:ml-auto md:hidden" />
                          </span>
                          <span className="min-w-0 truncate text-sm text-foreground/90">{d.status || <span className="text-muted-foreground">No status</span>}</span>
                          <span className="text-xs text-muted-foreground" title={x?.last ? fmtDate(x.last) : undefined}>{x?.last ? ago(x.last) : 'Nothing yet'}</span>
                          <span className="text-xs tabular-nums text-muted-foreground md:text-right">{meta.loading && !meta.data ? '…' : `${(x?.n ?? 0).toLocaleString('en-ZA')} ${(x?.n ?? 0) === 1 ? 'entry' : 'entries'}`}</span>
                          <span className={cn('text-xs tabular-nums md:text-right', x?.open ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                            {x?.open ? `${x.open} open` : 'None open'}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {adding ? <DbForm onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); nav(`/new/documentation/databases/${id}`) }} /> : null}
    </div>
  )
}
