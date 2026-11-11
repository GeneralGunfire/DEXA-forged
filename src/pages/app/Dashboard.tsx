import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmtDate, todayStr, useLoad } from '../../lib/data'
import { Columns, StatTiles } from '../../components/charts'
import './dashboard.css'

type TlRow = { id: string; database_id: string | null; type: string; status: string | null; title: string; author: string; happened_at: string; created_at: string }
type Task = { id: string; title: string; due_date: string | null; kind: string }
type Data = { entries: TlRow[]; dbs: Record<string, string>; dbCount: number; tasks: Task[]; fb: number }

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  if (m < 10080) return `${Math.round(m / 1440)} d ago`
  return fmtDate(iso)
}
const link = (e: TlRow) => (e.database_id ? `/app/databases/${e.database_id}?tab=Timeline&entry=${e.id}` : `/app/timeline?entry=${e.id}`)
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (day: string, n: number) => { const d = new Date(day + 'T00:00:00'); d.setDate(d.getDate() + n); return dayKey(d) }

const VISIT = 'forged_last_visit'
const readVisit = () => { try { return localStorage.getItem(VISIT) } catch { return null } }

/** The live part of Home: what needs attention, what changed since you were last here, and what has just happened. */
export function Dashboard({ name }: { name: string }) {
  // remember when this person last looked, so we can say what is new (kept only in this browser)
  const lastVisit = useMemo(() => {
    const prev = readVisit()
    try { localStorage.setItem(VISIT, new Date().toISOString()) } catch { /* storage blocked */ }
    return prev
  }, [])

  const { data, loading } = useLoad<Data>(async () => {
    const [tl, dbs, tasks, fb] = await Promise.all([
      supabase.from('timeline_entries').select('id, database_id, type, status, title, author, happened_at, created_at').order('happened_at', { ascending: false }).limit(500),
      supabase.from('databases').select('id, name'),
      supabase.from('tasks').select('id, title, due_date, kind').eq('done', false),
      supabase.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    ])
    return {
      entries: tl.error ? [] : ((tl.data ?? []) as TlRow[]),
      dbs: Object.fromEntries(((dbs.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name])),
      dbCount: (dbs.data ?? []).length,
      tasks: tasks.error ? [] : ((tasks.data ?? []) as Task[]),
      fb: fb.error ? 0 : fb.count ?? 0,
    }
  })

  const today = todayStr()
  const entries = data?.entries ?? []
  const openErrors = entries.filter((e) => e.type === 'Error' && e.status === 'Open')
  const overdue = (data?.tasks ?? []).filter((t) => t.due_date && t.due_date < today)
  const soon = (data?.tasks ?? []).filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7)).sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
  const attention = openErrors.length + overdue.length + (data?.fb ?? 0)
  const recent = entries.slice(0, 8)
  const fresh = lastVisit ? entries.filter((e) => e.created_at > lastVisit) : []
  const freshByClaude = fresh.filter((e) => e.author === 'Claude Code').length
  const freshErrors = fresh.filter((e) => e.type === 'Error').length

  // entries per week, last 12 weeks
  const weeks = useMemo(() => {
    const start = (iso: string) => { const d = new Date(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayKey(d) }
    const by: Record<string, number> = {}
    for (const e of entries) { const k = start(e.happened_at); by[k] = (by[k] ?? 0) + 1 }
    const cur = new Date(start(new Date().toISOString()) + 'T00:00:00')
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(cur); d.setDate(d.getDate() - (11 - i) * 7)
      const k = dayKey(d)
      return { key: k, label: d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }), value: by[k] ?? 0, tip: `Week of ${d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' })}: ${by[k] ?? 0} ${(by[k] ?? 0) === 1 ? 'entry' : 'entries'}` }
    })
  }, [entries])
  const hour = new Date().getHours()

  return (
    <section className="dash" aria-label="Dashboard">
      <header className="dash__head">
        <div>
          <p className="dash__eyebrow">{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, {name}</p>
          <h2>{loading ? 'Checking the estate…' : attention === 0 ? 'Everything is on track.' : `${attention} ${attention === 1 ? 'thing needs' : 'things need'} your attention.`}</h2>
        </div>
        <nav className="dash__quick" aria-label="Quick actions">
          <Link className="btn btn--dark" to="/app/timeline">New timeline entry</Link>
          <Link className="btn" to="/app/documents">Upload a document</Link>
          <Link className="btn" to="/app/messages">Write a post</Link>
          <Link className="btn" to="/app/schedule">Add a task</Link>
        </nav>
      </header>

      {fresh.length > 0 && (
        <p className="dash__since" role="status">
          <b>Since your last visit</b>
          {fresh.length} new timeline {fresh.length === 1 ? 'entry' : 'entries'}
          {freshByClaude > 0 ? `, ${freshByClaude} from Claude Code` : ''}
          {freshErrors > 0 ? `, ${freshErrors} ${freshErrors === 1 ? 'error' : 'errors'} reported` : ''}.
        </p>
      )}

      <StatTiles items={[
        { value: data?.dbCount ?? '–', label: 'databases' },
        { value: loading ? '–' : entries.length >= 500 ? '500+' : entries.length, label: 'timeline entries' },
        { value: loading ? '–' : openErrors.length, label: openErrors.length === 1 ? 'open error' : 'open errors', alert: openErrors.length > 0 },
        { value: loading ? '–' : data?.tasks.length ?? 0, label: 'open tasks', hint: overdue.length ? `${overdue.length} overdue` : soon.length ? `${soon.length} due this week` : undefined, alert: overdue.length > 0 },
      ]} />

      <div className="dash__cols">
        <section className="dash__card" aria-labelledby="att-h">
          <h3 id="att-h">Needs attention</h3>
          {loading ? <p className="muted">Checking…</p> : attention === 0 && soon.length === 0 ? (
            <p className="dash__ok"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>No open errors, overdue tasks or unread feedback.</p>
          ) : (
            <ul className="dash__list">
              {openErrors.slice(0, 5).map((e) => (
                <li key={e.id}><Link to={link(e)}><span className="dash__dot dash__dot--bad" aria-hidden="true" /><span className="dash__t">{e.title}<small>Open error{e.database_id ? ` · ${data!.dbs[e.database_id] ?? ''}` : ''} · {ago(e.happened_at)}</small></span></Link></li>
              ))}
              {openErrors.length > 5 && <li className="dash__more"><Link to="/app/timeline">and {openErrors.length - 5} more open errors</Link></li>}
              {overdue.slice(0, 4).map((t) => (
                <li key={t.id}><Link to="/app/schedule"><span className="dash__dot dash__dot--bad" aria-hidden="true" /><span className="dash__t">{t.title}<small>Overdue since {fmtDate(t.due_date)}</small></span></Link></li>
              ))}
              {soon.slice(0, 4).map((t) => (
                <li key={t.id}><Link to="/app/schedule"><span className="dash__dot" aria-hidden="true" /><span className="dash__t">{t.title}<small>Due {fmtDate(t.due_date)}</small></span></Link></li>
              ))}
              {(data?.fb ?? 0) > 0 && (
                <li><Link to="/app/feedback"><span className="dash__dot" aria-hidden="true" /><span className="dash__t">{data!.fb} new feedback {data!.fb === 1 ? 'response' : 'responses'}<small>Not yet read</small></span></Link></li>
              )}
            </ul>
          )}
        </section>

        <section className="dash__card" aria-labelledby="act-h">
          <div className="dash__cardhead"><h3 id="act-h">Recent activity</h3><Link to="/app/timeline">Open the timeline</Link></div>
          {loading ? <p className="muted">Loading…</p> : recent.length === 0 ? (
            <p className="muted">Nothing has been logged yet. Claude Code adds entries here as it works.</p>
          ) : (
            <ol className="dash__feed">
              {recent.map((e) => (
                <li key={e.id}>
                  <Link to={link(e)}>
                    <span className={`dash__av${e.author === 'Claude Code' ? ' dash__av--cc' : ''}`} aria-hidden="true">{e.author === 'Claude Code' ? 'CC' : e.author.charAt(0)}</span>
                    <span className="dash__t">
                      {e.title}
                      <small>{e.type}{e.database_id ? ` · ${data!.dbs[e.database_id] ?? ''}` : ''} · {e.author} · {ago(e.happened_at)}</small>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {weeks.some((w) => w.value > 0) && (
        <section className="dash__card" aria-labelledby="wk-h">
          <div className="dash__cardhead"><h3 id="wk-h">Activity over the last 12 weeks</h3><span className="muted">Timeline entries per week</span></div>
          <Columns data={weeks} ariaLabel="Timeline entries per week" height={90} />
        </section>
      )}
    </section>
  )
}
