import type { ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { ROADMAP } from '../../data/roadmap'
import { fmtDate, postImageUrl, SETUP, todayStr, unwrap, useLoad } from '../../lib/data'
import { plainExcerpt, SetupNotice } from '../../components/ui'
import { SECTIONS } from './sections'
import Messages from './Messages'
import { DatabaseBoard, DatabaseDetail } from './Databases'
import Branding from './Branding'
import Schedule from './Schedule'
import Documents from './Documents'
import Feedback from './Feedback'
import Reports from './Reports'
import GlobalTimeline from './Timeline'
import Settings from './Settings'
import './shell.css'

const homeIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" />
  </svg>
)
const signOutIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 4H5v16h5" /><path d="M16 8l4 4-4 4M20 12H9" />
  </svg>
)

/* ---------------- home: hero, then news and dashboard ---------------- */

type NewsPost = { id: string; title: string; body: string; image_paths: string[]; posted_at: string }

function Home({ name }: { name: string }) {
  const news = useLoad<NewsPost[]>(async () =>
    unwrap<NewsPost[]>(
      await supabase.from('posts').select('id, title, body, image_paths, posted_at').order('posted_at', { ascending: false }).limit(3),
    ) ?? [])

  const stats = useLoad<number[]>(async () => {
    const head = { count: 'exact', head: true } as const
    const [tasks, events, docs, dbs, fresh] = await Promise.all([
      supabase.from('tasks').select('id', head).eq('done', false),
      supabase.from('tasks').select('id', head).eq('kind', 'event').eq('done', false).gte('due_date', todayStr()),
      supabase.from('documents').select('id', head),
      supabase.from('databases').select('id', head),
      supabase.from('feedback').select('id', head).eq('status', 'new'),
    ])
    for (const r of [tasks, events, docs, dbs]) if (r.error) throw r.error
    // feedback is optional until feedback.sql has been run, so a missing table counts as zero
    return [tasks.count ?? 0, events.count ?? 0, docs.count ?? 0, dbs.count ?? 0, fresh.error ? 0 : (fresh.count ?? 0)]
  })

  const scrollToNews = () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('news')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  const cards = [
    { to: 'schedule', label: 'Open tasks' },
    { to: 'schedule', label: 'Upcoming events' },
    { to: 'documents', label: 'Documents' },
    { to: 'databases', label: 'Databases' },
    { to: 'feedback', label: 'New feedback' },
  ]

  return (
    <>
      <section className="wh" aria-label="Welcome">
        <div className="wh__content">
          <p className="wh__kicker">DEXA Forged</p>
          <h1>Welcome back, {name}.</h1>
          <p className="wh__sub">The infrastructure behind better health.</p>
          <div className="wh__cta">
            <Link className="wh__btn wh__btn--white" to="/app/messages">Message board</Link>
            <Link className="wh__btn wh__btn--ghost" to="/app/schedule">Schedule</Link>
          </div>
        </div>
        <button type="button" className="wh__scroll" onClick={scrollToNews}>
          News and dashboard
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </section>

      <div className="wd">
        <section id="news" className="wd__sec" aria-labelledby="news-title">
          <header className="wd__head">
            <div>
              <p className="wd__eyebrow">Latest</p>
              <h2 id="news-title">News and announcements</h2>
            </div>
            <Link className="wd__more" to="/app/messages">Open message board →</Link>
          </header>
          {news.error === SETUP ? (
            <SetupNotice />
          ) : news.data && news.data.length > 0 ? (
            <div className="news">
              {news.data.map((p) => (
                <Link key={p.id} to="/app/messages" className="newscard">
                  {p.image_paths[0] && (
                    <div className="newscard__img"><img src={postImageUrl(p.image_paths[0])} alt="" loading="lazy" /></div>
                  )}
                  <div className="newscard__body">
                    <time dateTime={p.posted_at}>{fmtDate(p.posted_at)}</time>
                    <h3>{p.title}</h3>
                    {p.body && <p>{plainExcerpt(p.body)}</p>}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="wd__empty">
              <p>{news.loading ? 'Loading…' : 'No announcements yet.'}</p>
              {!news.loading && <small>Posts from the message board will appear here.</small>}
            </div>
          )}
        </section>

        <section className="wd__sec" aria-labelledby="glance-title">
          <header className="wd__head">
            <div>
              <p className="wd__eyebrow">Overview</p>
              <h2 id="glance-title">At a glance</h2>
            </div>
          </header>
          <div className="wd__stats">
            {cards.map((c, i) => (
              <Link key={c.label} to={`/app/${c.to}`} className="wd__stat">
                <strong>{stats.data ? stats.data[i] : '–'}</strong>
                <span>{c.label}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="wd__sec" aria-labelledby="build-title">
          <header className="wd__head">
            <div>
              <p className="wd__eyebrow">Roadmap</p>
              <h2 id="build-title">Build progress</h2>
            </div>
            <Link className="wd__more" to="/#roadmap">See the public view →</Link>
          </header>
          <ol className="wd__build">
            {ROADMAP.map((r, i) => (
              <li key={r.title}>
                <span className="wd__num">{i + 1}</span>
                <span className="wd__bt">{r.title}</span>
                <span className={`wd__chip${r.status === 'In progress' ? ' wd__chip--on' : ''}`}>{r.status}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  )
}

/* ---------------- layout with the sidebar ---------------- */

function Layout({ display, email }: { display: string; email: string }) {
  const linkClass = ({ isActive }: { isActive: boolean }) => `ws__link${isActive ? ' is-active' : ''}`
  const item = (to: string, label: string, ico: ReactNode, end = false) => (
    <NavLink key={to} to={to} end={end} className={linkClass}>
      {ico}
      <span>{label}</span>
    </NavLink>
  )

  return (
    <div className="ws">
      <aside className="ws__side">
        <div className="ws__sidein">
          <Link to="/" className="ws__logo" aria-label="DEXA Forged, public site">
            <img src="/dexa-logo-navy.png" alt="DEXA" />
            <span>Forged</span>
          </Link>

          <p className="ws__group">Workspace</p>
          <nav className="ws__nav" aria-label="Workspace">
            {item('/app', 'Home', homeIcon, true)}
            {SECTIONS.map((s) => item(`/app/${s.path}`, s.label, s.icon))}
          </nav>

          <div className="ws__user">
            <span className="ws__avatar" aria-hidden="true">{display.charAt(0)}</span>
            <div className="ws__who">
              <strong>{display}</strong>
              <small title={email}>{email}</small>
            </div>
            <button type="button" className="ws__signout" onClick={() => supabase.auth.signOut()} aria-label="Sign out" title="Sign out">
              {signOutIcon}
            </button>
          </div>
        </div>
      </aside>

      <main className="ws__main">
        <Outlet />
      </main>
    </div>
  )
}

export default function Workspace({ session }: { session: Session }) {
  const email = session.user.email ?? ''
  const raw = email.split('@')[0]
  const display = raw.charAt(0).toUpperCase() + raw.slice(1)

  return (
    <Routes>
      <Route element={<Layout display={display} email={email} />}>
        <Route index element={<Home name={display} />} />
        <Route path="messages" element={<Messages />} />
        <Route path="databases" element={<DatabaseBoard />} />
        <Route path="databases/:id" element={<DatabaseDetail />} />
        <Route path="branding" element={<Branding />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="documents" element={<Documents />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="reports" element={<Reports />} />
        <Route path="timeline" element={<GlobalTimeline />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  )
}
