import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Bell, CalendarClock, CalendarDays, Image, Inbox, MessageSquareHeart, Settings, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fmtDate, unwrap, useLoad } from '../../lib/data'
import { addDays, dateTimeLabel, dayKey, shortDay, startOfWeek, todayKey, weekdayShort } from './calendar/cal'
import { cn } from '@/lib/utils'

type Db = { id: string; name: string; status: string | null }
type Entry = { id: string; database_id: string | null; type: string; status: string | null; title: string; author: string; happened_at: string }
type Stamp = { happened_at: string; type: string; author: string }
type Post = { id: string; title: string; body: string; posted_at: string }
type Cal = { id: string; title: string; starts_at: string; all_day: boolean; assignee: string | null; category: string | null; status: string }
type Fb = { id: string; rating: number | null; message: string; page: string; created_at: string }
type Data = {
  dbs: Db[]; latest: Entry[]; errors: Entry[]; post: Post | null; stamps: Stamp[]
  next: Cal[]; running: (Cal & { tag?: string })[]; overdue: (Cal & { tag?: string })[]; fb: Fb[]
}

const COLS = 'id, database_id, type, status, title, author, happened_at'
const CAL = 'id, title, starts_at, all_day, assignee, category, status'

const hello = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  if (m < 10080) return `${Math.round(m / 1440)} d ago`
  return fmtDate(iso)
}
const plain = (s: string, n = 200) => {
  const t = s.replace(/[#*_`>[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

const SEG = ['bg-primary', 'bg-accent', 'bg-muted-foreground/60', 'bg-border']
const TYPE_TONE: Record<string, string> = {
  Action: 'bg-primary', Decision: 'bg-accent', Note: 'bg-muted-foreground/60', Response: 'bg-secondary', Fix: 'bg-primary/50', Error: 'bg-destructive',
}
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A number that counts up to its value when it first appears. */
function useCount(target: number, ms = 800) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (reduced()) { setV(target); return }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

function Stat({ k, value, note, bad, to }: { k: string; value: number; note?: string; bad?: boolean; to?: string }) {
  const n = useCount(value)
  const body = (
    <>
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
      <dd className={cn('mt-1 text-3xl font-semibold tabular-nums tracking-tight', bad && value > 0 && 'text-destructive')}>{n}</dd>
      {note ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{note}</p> : null}
    </>
  )
  return to ? <Link to={to} className="block rounded-md transition-opacity hover:opacity-80">{body}</Link> : <div>{body}</div>
}

/** A labelled module: a thin divider above, no box. */
function Mod({ title, link, to, span, children }: { title: string; link?: string; to?: string; span: string; children: ReactNode }) {
  return (
    <section className={cn('min-w-0 border-t border-border pt-4', span)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
        {link && to ? (
          <Link to={to} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            {link}<ArrowUpRight aria-hidden="true" className="size-3" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

const Quiet = ({ icon, title, note }: { icon: ReactNode; title: string; note: string }) => (
  <div className="flex items-start gap-2.5 text-muted-foreground">
    <span aria-hidden="true" className="mt-0.5 grid size-4 place-items-center">{icon}</span>
    <div>
      <p className="text-[13px] font-medium text-foreground/80">{title}</p>
      <p className="mt-0.5 text-xs leading-5">{note}</p>
    </div>
  </div>
)
const Loading = () => <p className="text-xs text-muted-foreground">Loading…</p>

const LINKS = [
  { to: '/new/admin/calendar', t: 'Calendar', d: 'Events and prompts', i: CalendarDays },
  { to: '/new/admin/announcements', t: 'Announcements', d: 'News and images', i: Bell },
  { to: '/new/admin/branding', t: 'Branding', d: 'Logos and media', i: Image },
  { to: '/new/admin/feedback', t: 'Feedback', d: 'What people send', i: MessageSquareHeart },
  { to: '/new/admin/settings', t: 'Settings', d: 'Picture and status', i: Settings },
]

export default function Home({ name }: { name: string }) {
  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // the same queries the old site uses (databases, timeline_entries, posts), plus the calendar and feedback tables
  const { data, loading, error } = useLoad<Data>(async () => {
    const nowIso = new Date().toISOString()
    const since = new Date(Date.now() - 90 * 86400000).toISOString()
    const [dbs, latest, errors, post, stamps, next, running, overdue, fb] = await Promise.all([
      supabase.from('databases').select('id, name, status').order('name'),
      supabase.from('timeline_entries').select(COLS).order('happened_at', { ascending: false }).limit(5),
      supabase.from('timeline_entries').select(COLS).eq('type', 'Error').eq('status', 'Open').order('happened_at', { ascending: false }),
      supabase.from('posts').select('id, title, body, posted_at').order('posted_at', { ascending: false }).limit(1),
      supabase.from('timeline_entries').select('happened_at, type, author').gte('happened_at', since).order('happened_at', { ascending: false }).limit(3000),
      supabase.from('calendar_events').select(CAL).eq('kind', 'event').neq('status', 'cancelled').gte('starts_at', nowIso).order('starts_at', { ascending: true }).limit(4),
      supabase.from('calendar_events').select(CAL).eq('kind', 'prompt').eq('status', 'ran').order('starts_at', { ascending: true }).limit(6),
      supabase.from('calendar_events').select(CAL).eq('kind', 'prompt').in('status', ['scheduled', 'ran']).lt('starts_at', nowIso).order('starts_at', { ascending: true }).limit(6),
      supabase.from('feedback').select('id, rating, message, page, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(50),
    ])
    const ok = <T,>(r: { error: unknown; data: unknown }) => (r.error ? [] : ((r.data ?? []) as T[]))
    const run = ok<Cal>(running)
    const over = ok<Cal>(overdue)
    const ids = [...new Set([...run, ...over].map((r) => r.id))]
    const tags = ids.length ? await supabase.from('prompt_tasks').select('event_id, tag').in('event_id', ids) : { data: [] as { event_id: string; tag: string }[] }
    const tagOf = Object.fromEntries(((tags.data ?? []) as { event_id: string; tag: string }[]).map((t) => [t.event_id, t.tag]))
    return {
      dbs: unwrap<Db[]>(dbs) ?? [], latest: unwrap<Entry[]>(latest) ?? [], errors: unwrap<Entry[]>(errors) ?? [],
      post: (unwrap<Post[]>(post) ?? [])[0] ?? null,
      stamps: ok<Stamp>(stamps), next: ok<Cal>(next),
      running: run.map((r) => ({ ...r, tag: tagOf[r.id] })), overdue: over.map((r) => ({ ...r, tag: tagOf[r.id] })),
      fb: ok<Fb>(fb),
    }
  })

  const dbName = (id: string | null) => data?.dbs.find((d) => d.id === id)?.name
  const [ready, setReady] = useState(false)
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t) }, [])

  const groups = Object.entries(
    (data?.dbs ?? []).reduce<Record<string, number>>((a, d) => { const k = d.status?.trim() || 'No status'; a[k] = (a[k] ?? 0) + 1; return a }, {}),
  ).sort((a, b) => b[1] - a[1])
  const total = data?.dbs.length ?? 0

  // activity, in Johannesburg time
  const act = useMemo(() => {
    const t = todayKey()
    const stamps = data?.stamps ?? []
    const perDay: Record<string, number> = {}
    for (const s of stamps) { const k = dayKey(s.happened_at); perDay[k] = (perDay[k] ?? 0) + 1 }
    const first = addDays(startOfWeek(t), -77)
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const start = addDays(first, i * 7); let n = 0
      for (let d = 0; d < 7; d++) n += perDay[addDays(start, d)] ?? 0
      return { start, n }
    })
    const gridStart = addDays(startOfWeek(t), -28)
    const days = Array.from({ length: 35 }, (_, i) => { const k = addDays(gridStart, i); return { k, n: perDay[k] ?? 0, future: k > t } })
    const cut = addDays(t, -29)
    const recent = stamps.filter((s) => dayKey(s.happened_at) >= cut)
    const by = (f: (s: Stamp) => string) => Object.entries(recent.reduce<Record<string, number>>((a, s) => { const k = f(s); a[k] = (a[k] ?? 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1])
    return {
      weeks, days, max: Math.max(1, ...weeks.map((w) => w.n)), maxDay: Math.max(1, ...days.map((d) => d.n)),
      thisWeek: weeks[11].n, lastWeek: weeks[10].n, month: days.reduce((a, d) => a + d.n, 0),
      types: by((s) => s.type), people: by((s) => s.author), recent: recent.length,
    }
  }, [data?.stamps])
  const headline = useCount(act.thisWeek)
  const delta = act.thisWeek - act.lastWeek
  const maxPerson = Math.max(1, ...act.people.map((p) => p[1]))

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-12 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{today}</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{hello()}, {name}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">The infrastructure behind better health.</p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Quick links">
          {[['Calendar', '/new/admin/calendar'], ['Announcements', '/new/admin/announcements'], ['Feedback', '/new/admin/feedback']].map(([t, to]) => (
            <Link key={to} to={to} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">{t}</Link>
          ))}
        </nav>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat k="Databases" value={total} to="/new/documentation/databases" note={groups[0] ? `${groups[0][1]} ${groups[0][0].toLowerCase()}` : undefined} />
        <Stat k="Open errors" value={data?.errors.length ?? 0} bad to="/new/work/errors" note={data?.errors.length ? 'need attention' : 'all clear'} />
        <Stat k="This week" value={act.thisWeek} to="/new/work/timeline" note="timeline entries" />
        <Stat k="Prompts running" value={data?.running.length ?? 0} to="/new/admin/calendar" note="awaiting a response" />
        <Stat k="Overdue" value={data?.overdue.length ?? 0} bad to="/new/admin/calendar" note="prompts past due" />
        <Stat k="New feedback" value={data?.fb.length ?? 0} to="/new/admin/feedback" note="not yet read" />
      </dl>

      {error ? (
        <p className="mt-8 text-sm text-destructive" role="alert">Could not load the data: {error}</p>
      ) : (
        <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-12">
          {/* row 1: activity */}
          <Mod title="Activity, last 12 weeks" link="Timeline" to="/new/work/timeline" span="lg:col-span-6">
            <p className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{loading ? '–' : headline}</span>
              <span className="text-xs text-muted-foreground">entries this week{!loading && delta !== 0 ? ` · ${delta > 0 ? '+' : ''}${delta} on last week` : ''}</span>
            </p>
            <div className="mt-4 flex h-28 items-end gap-1 sm:h-32" role="img" aria-label={`Timeline entries per week: ${act.weeks.map((w) => w.n).join(', ')}`}>
              {act.weeks.map((w, i) => (
                <div key={w.start} className="group flex h-full flex-1 flex-col justify-end" title={`Week of ${shortDay(w.start)}: ${w.n} ${w.n === 1 ? 'entry' : 'entries'}`}>
                  <div
                    className={cn('w-full rounded-t-[3px] transition-[height,background-color] duration-700 ease-out', i === 11 ? 'bg-primary' : 'bg-accent group-hover:bg-primary/80')}
                    style={{ height: ready && !loading ? `${Math.max(w.n ? 4 : 1, (w.n / act.max) * 100)}%` : '1%', transitionDelay: `${i * 40}ms` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1 text-[10px] text-muted-foreground">
              {act.weeks.map((w, i) => <span key={w.start} className="flex-1 truncate text-center">{i % 3 === 0 ? shortDay(w.start).replace(/^[A-Za-z]+,? /, '') : ''}</span>)}
            </div>
          </Mod>

          <Mod title="Last five weeks" span="lg:col-span-3">
            <p className="flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums tracking-tight">{loading ? '–' : act.month}</span><span className="text-xs text-muted-foreground">entries</span></p>
            <div className="mt-4 grid grid-cols-7 gap-1 text-[9px] text-muted-foreground">
              {act.days.slice(0, 7).map((d) => <span key={d.k} className="text-center uppercase">{weekdayShort(d.k).slice(0, 1)}</span>)}
              {act.days.map((d, i) => (
                <div
                  key={d.k}
                  title={`${shortDay(d.k)}: ${d.n} ${d.n === 1 ? 'entry' : 'entries'}`}
                  className={cn('aspect-square rounded-[3px] border transition-opacity duration-500', d.k === todayKey() ? 'border-foreground' : 'border-transparent', d.future ? 'bg-muted/40' : d.n === 0 ? 'bg-secondary' : 'bg-primary')}
                  style={{ opacity: ready ? (d.future ? 0.5 : d.n === 0 ? 1 : 0.3 + 0.7 * (d.n / act.maxDay)) : 0, transitionDelay: `${i * 10}ms` }}
                />
              ))}
            </div>
          </Mod>

          <Mod title="Estate" link="Databases" to="/new/documentation/databases" span="lg:col-span-3">
            {loading ? <Loading /> : total > 0 ? (
              <>
                <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={groups.map(([k, n]) => `${n} ${k}`).join(', ')}>
                  {groups.map(([k, n], i) => <span key={k} className={`h-full ${SEG[i % SEG.length]}`} style={{ flex: n }} />)}
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {groups.map(([k, n], i) => (
                    <li key={k} className="flex items-center gap-2.5 py-2 text-[13px] first:pt-0">
                      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${SEG[i % SEG.length]}`} />
                      <span className="min-w-0 flex-1 truncate">{k}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="text-xs text-muted-foreground">No databases yet.</p>}
          </Mod>

          {/* row 2: what happened */}
          <Mod title="Latest activity" link="Open the timeline" to="/new/work/timeline" span="lg:col-span-6">
            {loading ? <Loading /> : data!.latest.length === 0 ? <p className="text-xs text-muted-foreground">Nothing has been logged yet.</p> : (
              <ol className="divide-y divide-border">
                {data!.latest.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                    <span className="mt-1 flex w-16 shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                      <span aria-hidden="true" className={cn('size-1.5 rounded-full', TYPE_TONE[e.type] ?? 'bg-border')} />{e.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-snug text-foreground">{e.title}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[dbName(e.database_id), e.author].filter(Boolean).join(' · ')}</p>
                    </div>
                    <time dateTime={e.happened_at} className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">{ago(e.happened_at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </Mod>

          <Mod title="Last 30 days" span="lg:col-span-3">
            {loading ? <Loading /> : act.recent === 0 ? <p className="text-xs text-muted-foreground">No entries in the last 30 days.</p> : (
              <>
                <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={act.types.map(([k, n]) => `${n} ${k}`).join(', ')}>
                  {act.types.map(([k, n]) => <span key={k} className={`h-full ${TYPE_TONE[k] ?? 'bg-border'}`} style={{ flex: n }} />)}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {act.types.map(([k, n]) => (
                    <li key={k} className="flex items-center gap-2"><span aria-hidden="true" className={`size-2 rounded-full ${TYPE_TONE[k] ?? 'bg-border'}`} /><span className="flex-1 truncate">{k}</span><span className="tabular-nums text-muted-foreground">{n}</span></li>
                  ))}
                </ul>
                <h3 className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Who</h3>
                <ul className="space-y-2">
                  {act.people.map(([k, n]) => (
                    <li key={k} className="text-xs">
                      <div className="flex justify-between"><span>{k}</span><span className="tabular-nums text-muted-foreground">{n}</span></div>
                      <div className="mt-1 h-1 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: ready ? `${(n / maxPerson) * 100}%` : '0%' }} /></div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Mod>

          <Mod title="Open errors" link="All errors" to="/new/work/errors" span="lg:col-span-3">
            {loading ? <Loading /> : data!.errors.length === 0 ? <p className="text-xs text-muted-foreground">No open errors.</p> : (
              <ul className="divide-y divide-border">
                {data!.errors.slice(0, 3).map((e) => (
                  <li key={e.id} className="py-2.5 first:pt-0">
                    <p className="text-[13px] font-medium leading-snug text-foreground">{e.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{[dbName(e.database_id), ago(e.happened_at)].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </Mod>

          {/* row 3: announcements and the calendar */}
          <Mod title="Latest announcement" link="All announcements" to="/new/admin/announcements" span="lg:col-span-6">
            {loading ? <Loading /> : data!.post ? (
              <article>
                <time dateTime={data!.post.posted_at} className="text-[11px] text-muted-foreground">{fmtDate(data!.post.posted_at)}</time>
                <h3 className="mt-1 text-base font-semibold tracking-tight text-foreground">{data!.post.title}</h3>
                {data!.post.body ? <p className="mt-1.5 max-w-prose text-[13px] leading-5 text-muted-foreground">{plain(data!.post.body)}</p> : null}
              </article>
            ) : <p className="text-xs text-muted-foreground">No announcements yet.</p>}
          </Mod>

          <Mod title="Next events" link="Calendar" to="/new/admin/calendar" span="lg:col-span-3">
            {loading ? <Loading /> : data!.next.length ? (
              <ul className="divide-y divide-border">
                {data!.next.map((e) => (
                  <li key={e.id} className="py-2.5 first:pt-0">
                    <p className="text-[13px] font-medium leading-snug text-foreground">{e.title}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{e.all_day ? shortDay(dayKey(e.starts_at)) : dateTimeLabel(e.starts_at)}{e.assignee ? ` · ${e.assignee}` : ''}</p>
                  </li>
                ))}
              </ul>
            ) : <Quiet icon={<CalendarClock className="size-4" />} title="Nothing scheduled" note="Upcoming events will appear here." />}
          </Mod>

          <Mod title="Prompts" link="Calendar" to="/new/admin/calendar" span="lg:col-span-3">
            {loading ? <Loading /> : data!.overdue.length + data!.running.length ? (
              <ul className="divide-y divide-border">
                {[...data!.overdue.map((e) => ({ e, late: true })), ...data!.running.filter((r) => !data!.overdue.some((o) => o.id === r.id)).map((e) => ({ e, late: false }))].slice(0, 4).map(({ e, late }) => (
                  <li key={e.id} className="py-2.5 first:pt-0">
                    <p className="text-[13px] font-medium leading-snug text-foreground">{e.title}</p>
                    <p className={cn('mt-0.5 text-[11px]', late ? 'text-destructive' : 'text-muted-foreground')}>{[e.tag, e.assignee, late ? 'overdue' : 'waiting for a response'].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            ) : <Quiet icon={<Sparkles className="size-4" />} title="Nothing running" note="Prompts that are running or overdue show here." />}
          </Mod>

          {/* row 4 */}
          <Mod title="New feedback" link="Open feedback" to="/new/admin/feedback" span="lg:col-span-6">
            {loading ? <Loading /> : data!.fb.length ? (
              <ul className="divide-y divide-border">
                {data!.fb.slice(0, 3).map((f) => (
                  <li key={f.id} className="flex items-start gap-3 py-2.5 first:pt-0">
                    <span className="mt-0.5 w-10 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">{f.rating ? `${f.rating} / 5` : '–'}</span>
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">{f.message ? plain(f.message, 120) : <span className="text-muted-foreground">No message</span>}</p>
                    <time dateTime={f.created_at} className="shrink-0 text-[11px] text-muted-foreground">{ago(f.created_at)}</time>
                  </li>
                ))}
              </ul>
            ) : <Quiet icon={<Inbox className="size-4" />} title="Nothing new" note="Feedback that has not been read yet appears here." />}
          </Mod>

          <Mod title="Jump to" span="lg:col-span-6">
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {LINKS.map((l) => (
                <li key={l.to} className="border-b border-border last:border-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-0">
                  <Link to={l.to} className="group flex items-center gap-3 py-2.5 transition-colors">
                    <l.i aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium">{l.t}</span><span className="block text-[11px] text-muted-foreground">{l.d}</span></span>
                    <ArrowUpRight aria-hidden="true" className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </Mod>
        </div>
      )}
    </div>
  )
}
