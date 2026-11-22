import { useMemo, useState, type ReactNode } from 'react'
import { Printer, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { describe, fmtDate, useLoad } from '../../../lib/data'
import { addDays, btn, btnPrimary, dayKey, todayKey } from '../calendar/cal'
import { LIMITS_TITLE, MACHINES, TYPE_DOT, TYPE_ORDER, phaseName } from '../databases/shared'
import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Db = { id: string; name: string; machine: string }
type E = { id: string; database_id: string | null; happened_at: string; type: string; phase: string; title: string; status: string | null }

const ACCEPTED_PREFIX = 'Accepted for simulated sources:'
const NOT_SET = 'Machine not set'
type Mode = '7' | '30' | 'since' | 'all'
const MODES: { v: Mode; label: string }[] = [{ v: '7', label: 'Last 7 days' }, { v: '30', label: 'Last 30 days' }, { v: 'since', label: 'Since a date' }, { v: 'all', label: 'All time' }]

/** Every row, a page at a time (the server hands back at most a thousand per request). */
async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 100000; from += 1000) {
    const r = await supabase.from(table).select(cols).order('happened_at', { ascending: false }).range(from, from + 999)
    if (r.error) throw r.error
    const rows = (r.data ?? []) as unknown as T[]
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

export default function Reports() {
  const dbs = useLoad<Db[]>(async () => {
    const r = await supabase.from('databases').select('id, name, machine').order('name')
    if (r.error) throw r.error
    return (r.data ?? []) as Db[]
  })
  const entries = useLoad<E[]>(() => fetchAll<E>('timeline_entries', 'id, database_id, happened_at, type, phase, title, status'))

  const [mode, setMode] = useState<Mode>('30')
  const [since, setSince] = useState(addDays(todayKey(), -30))
  const [scope, setScope] = useState('all')

  const today = todayKey()
  const from = mode === '7' ? addDays(today, -6) : mode === '30' ? addDays(today, -29) : mode === 'since' ? since : ''
  const rangeText = from ? `${fmtDate(from)} to ${fmtDate(today)}` : `All time, up to ${fmtDate(today)}`

  const dbList = dbs.data ?? []
  const all = entries.data ?? []
  const inScope = (e: E) => scope === 'all' || (scope === 'estate' ? !e.database_id : e.database_id === scope)

  const r = useMemo(() => {
    const scoped = all.filter(inScope)
    const inRange = scoped.filter((e) => { const d = dayKey(e.happened_at); return (!from || d >= from) && d <= today })
    const counts = new Map<string, number>()
    for (const e of inRange) counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
    const verified = new Map<string, string>()
    for (const e of all) if (e.title === LIMITS_TITLE && e.database_id && (verified.get(e.database_id) ?? '') < e.happened_at) verified.set(e.database_id, e.happened_at)
    const openNow = scoped.filter((e) => e.type === 'Error' && e.status !== 'Resolved')
    const accepted = inRange.filter((e) => e.type === 'Decision' && e.title.startsWith(ACCEPTED_PREFIX))
    return { scoped, inRange, counts, verified, openNow, accepted }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, scope, from, today])

  // blocks: the whole estate first, then databases by machine (fixed order, A to Z inside); only those with something to say
  const blocks = useMemo(() => {
    const extra = Array.from(new Set(dbList.map((d) => d.machine.trim()).filter((m) => m && !MACHINES.includes(m)))).sort()
    const ordered = [...MACHINES, ...extra, ''].map((m) => ({ machine: m || NOT_SET, list: dbList.filter((d) => d.machine.trim() === m).sort((a, b) => a.name.localeCompare(b.name)) })).filter((x) => x.list.length)
    const has = (id: string | null) => r.inRange.some((e) => e.database_id === id) || r.openNow.some((e) => e.database_id === id)
    const wanted = (d: Db) => (scope === 'all' || scope === d.id) && has(d.id)
    return {
      estate: (scope === 'all' || scope === 'estate') && has(null),
      machines: ordered.map((x) => ({ machine: x.machine, list: x.list.filter(wanted) })).filter((x) => x.list.length),
    }
  }, [dbList, r, scope])

  const scopeLabel = scope === 'all' ? 'Whole estate' : scope === 'estate' ? 'Estate-level entries only' : dbList.find((d) => d.id === scope)?.name ?? 'Database'
  const loading = (entries.loading && !entries.data) || (dbs.loading && !dbs.data)
  const error = entries.error || dbs.error
  const generated = fmtDate(new Date().toISOString())

  const dbOf = (id: string | null) => dbList.find((d) => d.id === id)
  const lines = (list: E[], withState = false): ReactNode => (
    <ul className="divide-y divide-border/60">
      {list.map((e) => (
        <li key={e.id} className="nf-printblock flex gap-3 py-1.5 text-sm leading-6">
          <span className="w-24 shrink-0 text-xs tabular-nums leading-6 text-muted-foreground">{fmtDate(e.happened_at)}</span>
          <span className="min-w-0 flex-1 break-words">{e.title}{withState ? <span className="ml-2 text-xs text-muted-foreground">{e.status === 'Resolved' ? 'Resolved' : 'Open'}</span> : null}</span>
          <span className="hidden shrink-0 text-xs leading-6 text-muted-foreground sm:block">{phaseName(e.phase)}</span>
        </li>
      ))}
    </ul>
  )
  const sub = (title: string, list: E[], withState = false) => (list.length ? (
    <div className="nf-printblock mt-4">
      <h4 className="text-xs font-medium text-muted-foreground">{title} <span className="tabular-nums">({list.length})</span></h4>
      <div className="mt-1">{lines(list, withState)}</div>
    </div>
  ) : null)

  const block = (key: string, title: string, subtitle: string | null, id: string | null) => {
    const mine = r.inRange.filter((e) => e.database_id === id)
    const notAccepted = (e: E) => !(e.type === 'Decision' && e.title.startsWith(ACCEPTED_PREFIX))
    const raised = mine.filter((e) => e.type === 'Error')
    const open = r.openNow.filter((e) => e.database_id === id)
    const v = id ? r.verified.get(id) : undefined
    return (
      <section key={key} aria-label={title} className="mt-6 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {subtitle ? <span className="text-xs text-muted-foreground">{subtitle}</span> : null}
          {id ? <span className="ml-auto text-xs text-muted-foreground">Last verified against the source: {v ? fmtDate(v) : 'not recorded'}</span> : null}
        </div>
        {sub('Done', mine.filter((e) => e.type === 'Action'))}
        {sub('Fixed', mine.filter((e) => e.type === 'Fix'))}
        {sub('Decided', mine.filter((e) => e.type === 'Decision' && notAccepted(e)))}
        {sub('Errors raised in this range, with their status now', raised, true)}
        {sub('Errors open now', open)}
        {mine.length === 0 && open.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nothing recorded in this range.</p> : null}
      </section>
    )
  }

  return (
    <div className="nf-printpage mx-auto w-full max-w-5xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
      <header className="nf-noprint flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Documentation</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Reports</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">A status report for any date range, worked out here from the timeline. Nothing is saved.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} onClick={() => { entries.reload(); dbs.reload() }} disabled={entries.loading || dbs.loading}>
            <RefreshCw className={cn('size-4', (entries.loading || dbs.loading) && 'animate-spin')} aria-hidden="true" /> Refresh
          </button>
          <button type="button" className={btnPrimary} onClick={() => window.print()} disabled={loading || !!error}><Printer className="size-4" aria-hidden="true" /> Print</button>
        </div>
      </header>

      <div className="nf-noprint mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
        <div role="group" aria-label="Date range" className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-secondary/40 p-1">
          {MODES.map((m) => (
            <button key={m.v} type="button" aria-pressed={mode === m.v} onClick={() => setMode(m.v)}
              className={cn('h-8 rounded-md px-3 text-sm font-medium transition-colors', mode === m.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{m.label}</button>
          ))}
        </div>
        {mode === 'since' ? <div className="w-48"><DatePicker value={since} onChange={(v) => setSince(v || addDays(todayKey(), -30))} max={today} aria-label="Start date" /></div> : null}
        <Select className="w-60" aria-label="Scope" value={scope} onChange={setScope} options={[{ value: 'all', label: 'Whole estate' }, { value: 'estate', label: 'Estate-level entries only' }, ...dbList.map((d) => ({ value: d.id, label: d.name }))]} />
      </div>

      {error ? <p className="mt-10 text-sm text-destructive" role="alert">Could not load the timeline: {describe(error)}</p>
        : loading ? <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
        : (
          <article className="mt-8" aria-label="Status report">
            <div className="nf-printblock">
              <h2 className="text-2xl font-semibold tracking-tight">Status report</h2>
              <p className="mt-1 text-sm text-muted-foreground">{rangeText} · {scopeLabel} · prepared {generated}</p>
              <dl className="mt-5 grid grid-cols-3 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4 lg:grid-cols-7">
                <div>
                  <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Entries</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{r.inRange.length}</dd>
                </div>
                {TYPE_ORDER.map((t) => (
                  <div key={t}>
                    <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground"><span aria-hidden="true" className={cn('size-1.5 rounded-full', TYPE_DOT[t])} />{t}</dt>
                    <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{r.counts.get(t) ?? 0}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-sm text-muted-foreground">Errors open now{scope === 'all' ? ' across the estate' : ''}: <span className="font-medium tabular-nums text-foreground">{r.openNow.length}</span>. Open and resolved come from each error's stored status; no resolution date is recorded.</p>
            </div>

            {r.inRange.length === 0 ? (
              <p className="mt-10 rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">No timeline entries in this range{scope === 'all' ? '' : ' for this scope'}.</p>
            ) : null}

            {blocks.estate ? block('estate', 'Whole estate', 'Entries not tied to one database', null) : null}
            {blocks.machines.map((m) => (
              <div key={m.machine} className="mt-10">
                <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{m.machine} <span className="tabular-nums normal-case tracking-normal">{m.list.length}</span></h2>
                {m.list.map((d) => block(d.id, d.name, null, d.id))}
              </div>
            ))}

            {r.accepted.length ? (
              <section aria-label="Accepted for simulated sources" className="mt-10 border-t border-border pt-4">
                <h3 className="text-base font-semibold tracking-tight">Accepted for simulated sources</h3>
                <p className="mt-1 text-xs text-muted-foreground">Decisions made in this range, titled “{ACCEPTED_PREFIX} …”.</p>
                <ul className="mt-2 divide-y divide-border/60">
                  {r.accepted.map((e) => (
                    <li key={e.id} className="nf-printblock flex gap-3 py-1.5 text-sm leading-6">
                      <span className="w-24 shrink-0 text-xs tabular-nums leading-6 text-muted-foreground">{fmtDate(e.happened_at)}</span>
                      <span className="min-w-0 flex-1 break-words">{e.title}</span>
                      <span className="shrink-0 text-xs leading-6 text-muted-foreground">{e.database_id ? dbOf(e.database_id)?.name ?? 'Database' : 'Whole estate'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </article>
        )}
    </div>
  )
}
