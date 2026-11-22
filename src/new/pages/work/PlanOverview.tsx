import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad } from '../../../lib/data'
import { btn } from '../calendar/cal'
import { STAGE_LABEL, bar, buildOrder, pct, progress, type Db, type Decision, type Dep, type Stage } from './shared'
import { cn } from '@/lib/utils'

const COLS = 'md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,2fr)_6rem]'
type Data = { dbs: Db[]; stages: Stage[]; decisions: Decision[]; deps: Dep[] }

export default function PlanOverview() {
  const { data, error, loading, reload } = useLoad<Data>(async () => {
    const [d, s, k, p] = await Promise.all([
      supabase.from('databases').select('id, name, machine, db_type, status').order('name'),
      supabase.from('gw_plan_stages').select('*').limit(5000),
      supabase.from('gw_decisions').select('*').limit(5000),
      supabase.from('gw_dependencies').select('*').limit(5000),
    ])
    return { dbs: unwrap<Db[]>(d) ?? [], stages: unwrap<Stage[]>(s) ?? [], decisions: unwrap<Decision[]>(k) ?? [], deps: unwrap<Dep[]>(p) ?? [] }
  })

  const rows = useMemo(() => (data?.dbs ?? []).map((d) => ({
    db: d, p: progress((data?.stages ?? []).filter((s) => s.database_id === d.id), (data?.decisions ?? []).filter((x) => x.database_id === d.id)),
  })), [data])
  const order = useMemo(() => buildOrder((data?.dbs ?? []).map((d) => d.id), data?.deps ?? []), [data])
  const name = (id: string) => data?.dbs.find((d) => d.id === id)?.name ?? ''
  const totals = rows.reduce((a, r) => ({ done: a.done + r.p.done, total: a.total + r.p.total, blockers: a.blockers + r.p.blockers }), { done: 0, total: 0, blockers: 0 })
  const hasLinks = (data?.deps ?? []).some((d) => d.active)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Work</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">How the gateway will be built for each database: the route in, the field mapping, the stages and what is blocking them.</p>
        </div>
        <button type="button" className={btn} onClick={reload} disabled={loading}><RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
      </header>

      {data ? (
        <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-5 sm:max-w-xl">
          {[['Databases', data.dbs.length, false], ['Stages done', `${totals.done} of ${totals.total}`, false], ['Open blockers', totals.blockers, true]].map(([k, v, bad]) => (
            <div key={String(k)}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
              <dd className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', bad && Number(v) > 0 && 'text-destructive')}>{typeof v === 'number' ? v.toLocaleString('en-ZA') : v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-10">
        {error ? <p className="text-sm text-destructive" role="alert">Could not load the plan: {error}</p>
          : loading && !data ? <p className="text-sm text-muted-foreground">Loading…</p>
          : rows.length === 0 ? <p className="rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">No databases yet. Add them under Documentation first.</p>
          : (
            <>
              <section aria-label="Build order" className="border-t border-border pt-5">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Build order</h2>
                <p className="mt-1.5 max-w-[72ch] text-sm text-muted-foreground">
                  {hasLinks ? 'Built from the “build after” links. Everything in a step can start once the step before it is done.' : 'No “build after” links are recorded yet, so every database can start now.'}
                </p>
                <ol className="mt-4 space-y-3">
                  {order.levels.map((lvl, i) => (
                    <li key={i} className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                      <span className="pt-1 text-xs font-medium text-muted-foreground">{i === 0 ? 'Start now' : `Then, step ${i + 1}`}</span>
                      <span className="flex flex-wrap gap-2">
                        {lvl.map((id) => <Link key={id} to={`/new/work/plan/${id}`} className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted">{name(id)}</Link>)}
                      </span>
                    </li>
                  ))}
                  {order.circular.length ? (
                    <li className="grid gap-3 sm:grid-cols-[6rem_1fr]">
                      <span className="pt-1 text-xs font-medium text-destructive">Circular</span>
                      <span>
                        <span className="flex flex-wrap gap-2">
                          {order.circular.map((id) => <Link key={id} to={`/new/work/plan/${id}`} className="rounded-full border border-destructive/50 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10">{name(id)}</Link>)}
                        </span>
                        <span className="mt-2 block text-xs text-muted-foreground">These wait on each other (or on something that does), so no order can be worked out. Change one of their dependencies.</span>
                      </span>
                    </li>
                  ) : null}
                </ol>
              </section>

              <section aria-label="Databases" className="mt-12 border-t border-border pt-5">
                <div className={cn('hidden gap-4 px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:grid', COLS)} aria-hidden="true">
                  <span>Database</span><span>Progress</span><span>Next stage</span><span className="text-right">Blocked</span>
                </div>
                <ul className="divide-y divide-border border-y border-border">
                  {rows.map(({ db, p }) => (
                    <li key={db.id}>
                      <Link to={`/new/work/plan/${db.id}`} className={cn('group grid items-center gap-x-4 gap-y-2 px-3 py-3.5 transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-ring', COLS)}>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{db.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{[db.db_type, db.machine].filter(Boolean).join(' · ') || 'Type not set'}</span>
                        </span>
                        <span className="min-w-0">
                          <span className={bar} role="progressbar" aria-label={`${db.name} progress`} aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}>
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct(p.done, p.total)}%` }} />
                          </span>
                          <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{p.total === 0 ? 'No stages planned yet' : `${p.done} of ${p.total} stages done`}</span>
                        </span>
                        <span className="min-w-0 truncate text-sm text-foreground/90">
                          {p.next ? <>{p.next.title} <span className="text-xs text-muted-foreground">· {STAGE_LABEL[p.next.status]}</span></> : <span className="text-muted-foreground">{p.total === 0 ? 'Nothing planned' : 'All stages done'}</span>}
                        </span>
                        <span className="md:text-right">
                          {p.blocked ? <span className="inline-flex items-center gap-1 rounded-full border border-destructive/50 px-2 text-[11px] font-medium leading-5 text-destructive"><TriangleAlert className="size-3" aria-hidden="true" /> {p.blockers ? `${p.blockers} open` : 'Blocked'}</span> : <span className="text-xs text-muted-foreground">No</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
      </div>
    </div>
  )
}
