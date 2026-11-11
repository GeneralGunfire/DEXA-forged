import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { todayStr, unwrap, useLoad, useTeam } from '../../lib/data'
import { completeness, countBy } from '../../lib/completeness'
import { LoadState, PageHead } from '../../components/ui'
import { Bar, ScoreRing, Stars } from '../../components/viz'
import { average } from './Feedback'
import { sectionByPath } from './sections'
import './pages.css'

type Period = 'week' | 'month' | 'quarter' | 'all'
const PERIODS: { v: Period; label: string; days: number }[] = [
  { v: 'week', label: 'Last 7 days', days: 7 }, { v: 'month', label: 'Last 30 days', days: 30 },
  { v: 'quarter', label: 'Last 90 days', days: 90 }, { v: 'all', label: 'All time', days: 0 },
]

type Db = { id: string; name: string; machine: string; db_type: string; background: string; shortfalls: string; port: string; instance_name: string; build_record: string }
type Task = { id: string; title: string; kind: string; assignee: string | null; due_date: string | null; done: boolean; created_at: string }
type Fb = { rating: number | null; page: string; status: string; message: string; created_at: string }
type Raw = {
  tasks: Task[]; dbs: Db[]; entries: { database_id: string; entry_date: string }[]
  docs: { database_id: string | null; created_at: string }[]; posts: { posted_at: string }[]; fb: Fb[]
}

export default function Reports() {
  const s = sectionByPath('reports')
  const { name: who } = useTeam()
  const [period, setPeriod] = useState<Period>('month')
  const [copied, setCopied] = useState(false)

  const { data, error, loading } = useLoad<Raw>(async () => {
    const [tasks, dbs, entries, docs, posts, fb, tl, dd] = await Promise.all([
      supabase.from('tasks').select('id,title,kind,assignee,due_date,done,created_at'),
      supabase.from('databases').select('id,name,machine,db_type,background,shortfalls,port,instance_name,build_record'),
      supabase.from('db_entries').select('database_id,entry_date'),
      supabase.from('documents').select('database_id,created_at'),
      supabase.from('posts').select('posted_at'),
      supabase.from('feedback').select('rating,page,status,message,created_at'),
      supabase.from('timeline_entries').select('database_id,happened_at'),
      supabase.from('db_documents').select('database_id,created_at'),
    ])
    // timeline entries count as development log entries and dated documents as documents; a table that is not set up yet counts as none
    const tlRows = tl.error ? [] : ((tl.data ?? []) as { database_id: string | null; happened_at: string }[]).map((x) => ({ database_id: x.database_id, entry_date: x.happened_at.slice(0, 10) }))
    const ddRows = dd.error ? [] : ((dd.data ?? []) as { database_id: string | null; created_at: string }[])
    return {
      tasks: unwrap<Task[]>(tasks) ?? [], dbs: unwrap<Db[]>(dbs) ?? [], entries: [...(unwrap<Raw['entries']>(entries) ?? []), ...tlRows] as Raw['entries'],
      docs: [...(unwrap<Raw['docs']>(docs) ?? []), ...ddRows] as Raw['docs'], posts: unwrap<Raw['posts']>(posts) ?? [],
      // feedback is optional until feedback.sql has been run: a missing table just means none yet
      fb: fb.error ? [] : (unwrap<Fb[]>(fb) ?? []),
    }
  })

  const r = useMemo(() => {
    if (!data) return null
    const days = PERIODS.find((p) => p.v === period)!.days
    const since = days ? Date.now() - days * 86400000 : 0
    const inP = (iso: string) => !since || new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).getTime() >= since
    const today = todayStr()

    const logCount = countBy(data.entries)
    const docCount = countBy(data.docs)
    const scores = data.dbs.map((d) => ({ d, c: completeness(d, logCount[d.id] ?? 0, docCount[d.id] ?? 0) })).sort((a, b) => a.c.pct - b.c.pct)
    const avgScore = scores.length ? Math.round(scores.reduce((t, x) => t + x.c.pct, 0) / scores.length) : 0

    const open = data.tasks.filter((t) => !t.done)
    const overdue = open.filter((t) => t.due_date && t.due_date < today)
    const done = data.tasks.filter((t) => t.done)
    const byPerson: Record<string, { open: number; done: number }> = {}
    for (const t of data.tasks) {
      const k = t.assignee ?? 'none'
      byPerson[k] ??= { open: 0, done: 0 }
      byPerson[k][t.done ? 'done' : 'open']++
    }

    const fb = data.fb.filter((f) => inP(f.created_at))
    const fbAvg = average(fb)
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: fb.filter((f) => f.rating === n).length }))
    const pages: Record<string, { n: number; low: number }> = {}
    for (const f of fb) {
      const k = f.page || '(no page)'
      pages[k] ??= { n: 0, low: 0 }
      pages[k].n++
      if ((f.rating ?? 5) <= 2) pages[k].low++
    }
    const topPages = Object.entries(pages).sort((a, b) => b[1].n - a[1].n).slice(0, 5)
    const worstPage = Object.entries(pages).filter(([, v]) => v.low > 0).sort((a, b) => b[1].low - a[1].low)[0]

    const posts = data.posts.filter((p) => inP(p.posted_at)).length
    const logs = data.entries.filter((e) => inP(e.entry_date)).length
    const uploads = data.docs.filter((d) => inP(d.created_at)).length
    const newFb = data.fb.filter((f) => f.status === 'new').length

    // plain-language insights, worked out from the numbers above
    const insights: string[] = []
    if (overdue.length) insights.push(`${overdue.length} task${overdue.length === 1 ? ' is' : 's are'} overdue: ${overdue.slice(0, 3).map((t) => t.title).join(', ')}${overdue.length > 3 ? '…' : ''}.`)
    else if (open.length) insights.push(`Nothing is overdue. ${open.length} task${open.length === 1 ? ' is' : 's are'} still open.`)
    const weak = scores.filter((x) => x.c.pct < 50)
    if (scores.length) {
      if (weak.length) insights.push(`${weak.length} of ${scores.length} database${scores.length === 1 ? '' : 's'} ${weak.length === 1 ? 'is' : 'are'} under 50% documented: ${weak.slice(0, 3).map((x) => x.d.name).join(', ')}${weak.length > 3 ? '…' : ''}.`)
      else insights.push(`Every database is at least 50% documented. The average is ${avgScore}%.`)
    }
    if (scores.length && logs === 0) insights.push('No development log entries were recorded in this period.')
    if (fb.length) {
      insights.push(`${fb.length} feedback response${fb.length === 1 ? '' : 's'} in this period${fbAvg != null ? `, averaging ${fbAvg.toFixed(1)} out of 5` : ''}.`)
      if (worstPage) insights.push(`${worstPage[0]} drew the most low ratings (${worstPage[1].low}).`)
    }
    if (newFb) insights.push(`${newFb} feedback item${newFb === 1 ? ' has' : 's have'} not been read yet.`)
    if (!insights.length) insights.push('Nothing to report yet. Add tasks, databases or feedback and this fills in by itself.')

    return { scores, avgScore, open, overdue, done, byPerson, fb, fbAvg, dist, topPages, posts, logs, uploads, newFb, insights, logCount, docCount }
  }, [data, period])

  const label = PERIODS.find((p) => p.v === period)!.label

  function asText() {
    if (!r) return ''
    const lines = [`DEXA Forged report: ${label}`, `Generated ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`, '', 'Highlights', ...r.insights.map((i) => `- ${i}`), '',
      `Activity: ${r.posts} posts, ${r.logs} log entries, ${r.uploads} uploads, ${r.fb.length} feedback`,
      `Tasks: ${r.done.length} done, ${r.open.length} open, ${r.overdue.length} overdue`, '', `Database documentation (average ${r.avgScore}%)`,
      ...r.scores.map((x) => `- ${x.d.name}: ${x.c.pct}%${x.c.missing.length ? ` (missing: ${x.c.missing.map((m) => m.label.toLowerCase()).join(', ')})` : ''}`)]
    return lines.join('\n')
  }
  async function copy() {
    try { await navigator.clipboard.writeText(asText()); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard blocked */ }
  }

  return (
    <div className="pg report">
      <PageHead
        title={s.label} blurb={s.blurb}
        action={
          <>
            <button type="button" className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy as text'}</button>
            <button type="button" className="btn btn--dark" onClick={() => window.print()}>Print or save as PDF</button>
          </>
        }
      />

      <div className="bar noprint">
        <div className="seg" role="group" aria-label="Period">
          {PERIODS.map((p) => <button key={p.v} type="button" aria-pressed={period === p.v} onClick={() => setPeriod(p.v)}>{p.label}</button>)}
        </div>
      </div>

      <LoadState loading={loading && !data} error={error}>
        {r && (
          <>
            <h2 className="print-title">DEXA Forged report: {label}</h2>

            <section className="rsec">
              <h3>Highlights</h3>
              <ul className="insights">{r.insights.map((i) => <li key={i}>{i}</li>)}</ul>
            </section>

            <div className="rtiles">
              <div><strong>{r.posts}</strong><span>posts</span></div>
              <div><strong>{r.logs}</strong><span>log entries</span></div>
              <div><strong>{r.uploads}</strong><span>uploads</span></div>
              <div><strong>{r.fb.length}</strong><span>feedback</span></div>
              <div><strong>{r.done.length}<small>/{r.done.length + r.open.length}</small></strong><span>tasks done</span></div>
            </div>

            <section className="rsec">
              <div className="rsec__head">
                <h3>Database documentation</h3>
                <span className="muted">Average {r.avgScore}%. <Link to="/app/databases">Open the board</Link></span>
              </div>
              {r.scores.length === 0 ? <p className="muted">No databases yet.</p> : (
                <ul className="dbscores">
                  {r.scores.map(({ d, c }) => (
                    <li key={d.id}>
                      <ScoreRing pct={c.pct} size={44} />
                      <div>
                        <Link to={`/app/databases/${d.id}`}><b>{d.name}</b></Link>
                        <small>{c.missing.length ? `Missing: ${c.missing.map((m) => m.label.toLowerCase()).join(', ')}` : 'Fully documented'}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="rcols">
              <section className="rsec">
                <h3>Tasks</h3>
                <div className="rtiles rtiles--3">
                  <div><strong>{r.open.length}</strong><span>open</span></div>
                  <div><strong>{r.done.length}</strong><span>done</span></div>
                  <div className={r.overdue.length ? 'is-bad' : ''}><strong>{r.overdue.length}</strong><span>overdue</span></div>
                </div>
                {Object.entries(r.byPerson).map(([k, v]) => (
                  <Bar key={k} label={k === 'none' ? 'Unassigned' : who(k) || 'Unknown'} value={v.done} max={Math.max(1, v.done + v.open)} tone="good" right={`${v.done} of ${v.done + v.open} done`} />
                ))}
              </section>

              <section className="rsec">
                <h3>Feedback</h3>
                {r.fb.length === 0 ? <p className="muted">No feedback in this period.</p> : (
                  <>
                    <div className="rfb">
                      <strong>{r.fbAvg != null ? r.fbAvg.toFixed(1) : '–'}</strong>
                      {r.fbAvg != null && <Stars value={Math.round(r.fbAvg)} />}
                      <span className="muted">{r.fb.length} responses</span>
                    </div>
                    {r.dist.map((x) => <Bar key={x.n} label={`${x.n}★`} value={x.c} max={Math.max(1, ...r.dist.map((y) => y.c))} tone={x.n >= 4 ? 'good' : x.n === 3 ? 'warn' : 'bad'} />)}
                    {r.topPages.length > 0 && (
                      <>
                        <h4>Most feedback by page</h4>
                        {r.topPages.map(([p, v]) => <Bar key={p} label={<code>{p}</code>} value={v.n} max={r.topPages[0][1].n} tone="ink" />)}
                      </>
                    )}
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </LoadState>
    </div>
  )
}
