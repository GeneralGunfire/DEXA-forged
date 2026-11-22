import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { unwrap, useLoad } from '../../../lib/data'
import { btn } from '../calendar/cal'
import { ago, TYPE_DOT, type Entry } from '../databases/shared'
import { cn } from '@/lib/utils'

type Mini = { id: string; name: string; db_type: string }
type Gw = { database_id: string | null; status: string }
type Data = { dbs: Mini[]; entries: Entry[]; prompts: Gw[] }
const COLS = 'md:grid-cols-[minmax(0,2.4fr)_8.5rem_5rem_6.5rem_6.5rem]'

export default function ProgressOverview() {
  const { data, error, loading, reload } = useLoad<Data>(async () => {
    const [d, t, p] = await Promise.all([
      supabase.from('databases').select('id, name, db_type').order('name'),
      supabase.from('timeline_entries').select('*').eq('phase', '2').order('happened_at', { ascending: false }).limit(5000),
      supabase.from('calendar_events').select('database_id, status').eq('kind', 'prompt').eq('workstream', 'gateway').limit(5000),
    ])
    return { dbs: unwrap<Mini[]>(d) ?? [], entries: unwrap<Entry[]>(t) ?? [], prompts: unwrap<Gw[]>(p) ?? [] }
  })

  const name = (id: string | null) => data?.dbs.find((d) => d.id === id)?.name ?? 'Whole estate'
  const link = (e: Entry) => (e.database_id ? `/new/work/progress/${e.database_id}?entry=${e.id}` : null)
  const rows = useMemo(() => (data?.dbs ?? []).map((d) => {
    const mine = (data?.entries ?? []).filter((e) => e.database_id === d.id)
    return {
      d, n: mine.length, last: mine[0]?.happened_at ?? '',
      open: mine.filter((e) => e.type === 'Error' && e.status !== 'Resolved').length,
      prompts: (data?.prompts ?? []).filter((p) => p.database_id === d.id && (p.status === 'scheduled' || p.status === 'ran')).length,
    }
  }), [data])
  const openErrors = (data?.entries ?? []).filter((e) => e.type === 'Error' && e.status !== 'Resolved')
  const latest = (data?.entries ?? []).slice(0, 12)

  const entryRow = (e: Entry) => {
    const to = link(e)
    const body = (
      <>
        <span className="mt-0.5 inline-flex w-[5.5rem] shrink-0 items-center gap-1.5 rounded-full border border-border px-2 text-[11px] font-medium leading-5 text-foreground">
          <span aria-hidden="true" className={cn('size-1.5 rounded-full', TYPE_DOT[e.type] ?? 'bg-border')} />{e.type}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium leading-snug text-foreground">{e.title}</span>
          <span className="mt-1 block text-[11px] text-muted-foreground">{name(e.database_id)} · {e.author}</span>
        </span>
        <time dateTime={e.happened_at} className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">{ago(e.happened_at)}</time>
      </>
    )
    const cls = 'flex items-start gap-3 rounded-md px-2 py-3 transition-colors hover:bg-secondary/40 focus-visible:outline-2 focus-visible:outline-ring'
    return <li key={e.id}>{to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-8 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Work</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Progress</h1>
          <p className="mt-2 text-sm text-muted-foreground">What has happened in Phase 2, database by database: entries, open errors and the gateway prompts.</p>
        </div>
        <button type="button" className={btn} onClick={reload} disabled={loading}><RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> Refresh</button>
      </header>

      {data ? (
        <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-5 sm:max-w-xl">
          {[['Phase 2 entries', data.entries.length, false], ['Open errors', openErrors.length, true], ['Open prompts', rows.reduce((a, r) => a + r.prompts, 0), false]].map(([k, v, bad]) => (
            <div key={String(k)}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
              <dd className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', bad && Number(v) > 0 && 'text-destructive')}>{Number(v).toLocaleString('en-ZA')}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-10 space-y-12">
        {error ? <p className="text-sm text-destructive" role="alert">Could not load progress: {error}</p>
          : loading && !data ? <p className="text-sm text-muted-foreground">Loading…</p>
          : (
            <>
              {openErrors.length ? (
                <section aria-label="Open Phase 2 errors" className="rounded-xl border border-destructive/40 bg-destructive/[0.06] px-4 pb-2 pt-4">
                  <h2 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-destructive">
                    <span aria-hidden="true" className="size-2 rounded-full bg-destructive" /> Open Phase 2 errors <span className="tabular-nums normal-case tracking-normal">{openErrors.length}</span>
                  </h2>
                  <ul className="divide-y divide-border/60">{openErrors.map(entryRow)}</ul>
                </section>
              ) : null}

              <section aria-label="Databases" className="border-t border-border pt-5">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Databases</h2>
                <div className={cn('mt-3 hidden gap-4 px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground md:grid', COLS)} aria-hidden="true">
                  <span>Database</span><span>Last entry</span><span className="text-right">Entries</span><span className="text-right">Open errors</span><span className="text-right">Open prompts</span>
                </div>
                <ul className="divide-y divide-border border-y border-border">
                  {rows.map(({ d, n, last, open, prompts }) => (
                    <li key={d.id}>
                      <Link to={`/new/work/progress/${d.id}`} className={cn('group grid items-center gap-x-4 gap-y-1 px-3 py-3.5 transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-ring', COLS)}>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{d.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{d.db_type || 'Type not set'}</span>
                          </span>
                          <ChevronRight aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 md:hidden" />
                        </span>
                        <span className="text-xs text-muted-foreground">{last ? ago(last) : 'Nothing yet'}</span>
                        <span className="text-xs tabular-nums text-muted-foreground md:text-right">{n.toLocaleString('en-ZA')}</span>
                        <span className={cn('text-xs tabular-nums md:text-right', open ? 'font-medium text-destructive' : 'text-muted-foreground')}>{open ? `${open} open` : 'None open'}</span>
                        <span className="text-xs tabular-nums text-muted-foreground md:text-right">{prompts ? `${prompts} open` : 'None'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-label="Latest Phase 2 entries" className="border-t border-border pt-5">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Latest Phase 2 entries</h2>
                {latest.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">Nothing has been logged in Phase 2 yet.</p>
                  : <ul className="mt-3 divide-y divide-border/60">{latest.map(entryRow)}</ul>}
              </section>
            </>
          )}
      </div>
    </div>
  )
}
