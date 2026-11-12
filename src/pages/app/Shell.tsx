import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { ROADMAP } from '../../data/roadmap'
import { fmtDate, postImageUrl, SETUP, todayStr, unwrap, useLoad } from '../../lib/data'
import { plainExcerpt, SetupNotice } from '../../components/ui'
import { SECTIONS } from './sections'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { FeedbackProvider } from '../../components/feedback'
import { WaveBand } from '../../components/charts'
import { HeroField } from '../../components/HeroField'
import { CrumbProvider, TopBar } from '../../components/nav'
import { CommandPalette } from '../../components/CommandPalette'
import { Dashboard } from './Dashboard'
import { Skeleton } from '../../components/ui'
import './shell.css'
import './revamp.css'

// Each page is its own download, fetched when first opened (and quietly prefetched once the app is idle).
const loaders = {
  messages: () => import('./Messages'),
  databases: () => import('./Databases'),
  branding: () => import('./Branding'),
  schedule: () => import('./Schedule'),
  documents: () => import('./Documents'),
  feedback: () => import('./Feedback'),
  reports: () => import('./Reports'),
  timeline: () => import('./Timeline'),
  settings: () => import('./Settings'),
  claude: () => import('./ClaudeStart'),
}
const Messages = lazy(loaders.messages)
const DatabaseBoard = lazy(() => loaders.databases().then((m) => ({ default: m.DatabaseBoard })))
const DatabaseDetail = lazy(() => loaders.databases().then((m) => ({ default: m.DatabaseDetail })))
const Branding = lazy(loaders.branding)
const Schedule = lazy(loaders.schedule)
const Documents = lazy(loaders.documents)
const Feedback = lazy(loaders.feedback)
const Reports = lazy(loaders.reports)
const GlobalTimeline = lazy(loaders.timeline)
const Settings = lazy(loaders.settings)
const ClaudeStart = lazy(loaders.claude)

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
        <HeroField />
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

/** The sidebar: a short primary group, then two quiet groups. */
const NAV = [
  { label: '', items: ['home', 'databases', 'timeline', 'documents'] },
  { label: 'Team', items: ['messages', 'schedule', 'feedback'] },
  { label: 'Manage', items: ['reports', 'branding', 'claude-start', 'settings'] },
]

/** Small live counts shown beside a menu item: open errors, overdue tasks, unread feedback. */
function useNavCounts() {
  const q = useLoad<{ errors: number; overdue: number; feedback: number }>(async () => {
    const head = { count: 'exact', head: true } as const
    const [e, t, f] = await Promise.all([
      supabase.from('timeline_entries').select('id', head).eq('type', 'Error').eq('status', 'Open'),
      supabase.from('tasks').select('id', head).eq('done', false).lt('due_date', todayStr()),
      supabase.from('feedback').select('id', head).eq('status', 'new'),
    ])
    return { errors: e.error ? 0 : e.count ?? 0, overdue: t.error ? 0 : t.count ?? 0, feedback: f.error ? 0 : f.count ?? 0 }
  })
  const { reload } = q
  useEffect(() => {
    const i = setInterval(() => { if (document.visibilityState === 'visible') reload() }, 60000)
    return () => clearInterval(i)
  }, [reload])
  return q.data
}

function Layout({ display, email }: { display: string; email: string }) {
  const loc = useLocation()
  const [searching, setSearching] = useState(false)
  const counts = useNavCounts()
  const [drawer, setDrawer] = useState(false) // the slide-in menu on phones
  // close the menu after going to a page, on Escape, and stop the page behind it scrolling while it is open
  useEffect(() => { setDrawer(false) }, [loc.pathname])
  useEffect(() => {
    if (!drawer) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', key)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [drawer])
  // once the app is idle, download the other pages in the background so they open instantly
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 1500))
    idle(() => { Object.values(loaders).forEach((l) => { l().catch(() => undefined) }) })
  }, [])
  const [rail, setRail] = useState(() => { try { return localStorage.getItem('forged_rail') === '1' } catch { return false } })
  const toggleRail = () => setRail((r) => { try { localStorage.setItem('forged_rail', r ? '0' : '1') } catch { /* storage blocked */ } return !r })
  // Ctrl+K or ⌘K opens the search from anywhere
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching(true) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  const linkClass = ({ isActive }: { isActive: boolean }) => `ws__link${isActive ? ' is-active' : ''}`
  const badge: Record<string, { n: number; tone: 'bad' | 'info'; what: string } | undefined> = {
    timeline: counts && counts.errors > 0 ? { n: counts.errors, tone: 'bad', what: 'open errors' } : undefined,
    schedule: counts && counts.overdue > 0 ? { n: counts.overdue, tone: 'bad', what: 'overdue tasks' } : undefined,
    feedback: counts && counts.feedback > 0 ? { n: counts.feedback, tone: 'info', what: 'new feedback' } : undefined,
  }
  let linkNo = 0
  const item = (key: string, to: string, label: string, ico: ReactNode, end = false) => {
    const bd = badge[key]
    return (
      <NavLink key={to} to={to} end={end} className={linkClass} title={rail ? label : undefined} style={{ '--i': linkNo++ } as CSSProperties}>
        {ico}
        <span className="ws__lbl">{label}</span>
        {bd && <b className={`ws__badge ws__badge--${bd.tone}`} aria-label={`${bd.n} ${bd.what}`}>{bd.n > 99 ? '99+' : bd.n}</b>}
      </NavLink>
    )
  }

  return (
    <FeedbackProvider>
    <CrumbProvider>
    <div className={`ws${rail ? ' ws--rail' : ''}${drawer ? ' ws--drawer' : ''}`}>
      <button type="button" className="ws__scrim" tabIndex={-1} aria-hidden="true" onClick={() => setDrawer(false)} />
      <aside className="ws__side" id="ws-menu" aria-label="Menu">
        <div className="ws__sidein">
          <button type="button" className="ws__close" onClick={() => setDrawer(false)} aria-label="Close the menu">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <div className="ws__top">
            <Link to="/" className="ws__logo" aria-label="DEXA Forged, public site">
              <img src="/dexa-logo-navy.png" alt="DEXA" />
              <span>Forged</span>
            </Link>
            <button type="button" className="ws__railbtn" onClick={toggleRail} aria-label={rail ? 'Expand the menu' : 'Collapse the menu'} aria-pressed={rail} title={rail ? 'Expand the menu' : 'Collapse the menu'}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6" /></svg>
            </button>
          </div>

          <button type="button" className="ws__search" onClick={() => setSearching(true)} aria-label="Search the workspace" title={rail ? 'Search (Ctrl K)' : undefined}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span className="ws__lbl">Search</span><kbd>Ctrl K</kbd>
          </button>
          <nav className="ws__nav" aria-label="Workspace">
            {NAV.map((g, i) => (
              <div className="ws__navgroup" key={i} role="group" aria-label={g.label || 'Main'}>
                {g.label && <p className="ws__group">{g.label}</p>}
                {g.items.map((k) => {
                  if (k === 'home') return item(k, '/app', 'Home', homeIcon, true)
                  const sec = SECTIONS.find((x) => x.path === k)
                  return sec ? item(k, `/app/${sec.path}`, sec.label, sec.icon) : null
                })}
              </div>
            ))}
          </nav>

          <div className="ws__user">
            <span className="ws__avatar" aria-hidden="true">{display.charAt(0)}</span>
            <div className="ws__who ws__lbl">
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
        <div className="ws__mbar">
          <button type="button" className="ws__burger" onClick={() => setDrawer(true)} aria-label="Open the menu" aria-expanded={drawer} aria-controls="ws-menu">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          </button>
          <Link to="/app" className="ws__mlogo" aria-label="Forged home"><img src="/dexa-logo-navy.png" alt="DEXA" /><span>Forged</span></Link>
          <button type="button" className="ws__burger" onClick={() => setSearching(true)} aria-label="Search the workspace">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          </button>
        </div>
        <TopBar onSearch={() => setSearching(true)} />
        <ErrorBoundary key={loc.pathname}>
          <Suspense fallback={<div className="pg"><Skeleton /></div>}><Outlet /></Suspense>
        </ErrorBoundary>
      </main>
      <CommandPalette open={searching} onClose={() => setSearching(false)} />
    </div>
    </CrumbProvider>
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
        <Route path="claude-start" element={<ClaudeStart />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  )
}
