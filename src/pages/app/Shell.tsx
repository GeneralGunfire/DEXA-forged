import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { ROADMAP } from '../../data/roadmap'
import { fmtDate, postImageUrl, SETUP, unwrap, useLoad } from '../../lib/data'
import { plainExcerpt, SetupNotice } from '../../components/ui'
import { SECTIONS } from './sections'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { FeedbackProvider } from '../../components/feedback'
import { WaveBand } from '../../components/charts'
import { CommandPalette } from '../../components/CommandPalette'
import { Dashboard } from './Dashboard'
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

  const scrollToNews = () => {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('news')?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }


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
        <WaveBand tone="light" drift className="wh__wave" />
        <button type="button" className="wh__scroll" onClick={scrollToNews}>
          News and dashboard
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </section>

      <div className="wd">
        <Dashboard name={name} />
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

/** The sidebar, grouped by what each section is for. */
const NAV = [
  { label: 'Workspace', items: ['home', 'messages', 'schedule', 'documents'] },
  { label: 'Databases', items: ['databases', 'timeline'] },
  { label: 'Insight', items: ['reports', 'feedback'] },
  { label: 'Admin', items: ['branding', 'settings'] },
]

function Layout({ display, email }: { display: string; email: string }) {
  const loc = useLocation()
  const [searching, setSearching] = useState(false)
  // Ctrl+K or ⌘K opens the search from anywhere
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching(true) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const linkClass = ({ isActive }: { isActive: boolean }) => `ws__link${isActive ? ' is-active' : ''}`
  const item = (to: string, label: string, ico: ReactNode, end = false) => (
    <NavLink key={to} to={to} end={end} className={linkClass}>
      {ico}
      <span>{label}</span>
    </NavLink>
  )

  return (
    <FeedbackProvider>
    <div className="ws">
      <aside className="ws__side">
        <div className="ws__sidein">
          <Link to="/" className="ws__logo" aria-label="DEXA Forged, public site">
            <img src="/dexa-logo-navy.png" alt="DEXA" />
            <span>Forged</span>
          </Link>

          <button type="button" className="ws__search" onClick={() => setSearching(true)} aria-label="Search the workspace">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span>Search</span><kbd>Ctrl K</kbd>
          </button>
          <nav className="ws__nav" aria-label="Workspace">
            {NAV.map((g) => (
              <div className="ws__navgroup" key={g.label} role="group" aria-label={g.label}>
                <p className="ws__group">{g.label}</p>
                {g.items.map((k) => {
                  if (k === 'home') return item('/app', 'Home', homeIcon, true)
                  const s = SECTIONS.find((x) => x.path === k)
                  return s ? item(`/app/${s.path}`, s.label, s.icon) : null
                })}
              </div>
            ))}
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
        <ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary>
      </main>
      <CommandPalette open={searching} onClose={() => setSearching(false)} />
    </div>
    </FeedbackProvider>
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
