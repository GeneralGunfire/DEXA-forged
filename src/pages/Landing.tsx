import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './landing.css'
import { ROADMAP } from '../data/roadmap'
import { supabase } from '../lib/supabase'
import { fmtDate, postImageUrl } from '../lib/data'
import { Dialog, plainExcerpt, Rich } from '../components/ui'

// The SA health explorer is a separate site. Set VITE_EXPLORER_URL to its public address.
const EXPLORER_URL = (import.meta.env.VITE_EXPLORER_URL as string | undefined) || ''

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)

// DRAFT COPY: edit freely. The roadmap becomes editable from inside Forged later.
const PILLARS = [
  {
    title: 'Connect the systems',
    text: 'South African health data sits across public, private and community systems. DEXA joins them up.',
    icon: svg(<><circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="6" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M7.3 11l9.4-4M7.3 13l9.4 4" /></>),
  },
  {
    title: 'Speak one language',
    text: 'Records from very different sources are translated into one common, standards-based model.',
    icon: svg(<><path d="M4 7h16M4 12h10M4 17h16" /><path d="M17 10l3 2-3 2" /></>),
  },
  {
    title: 'Consent and audit built in',
    text: 'Access is governed by patient consent, and every access is recorded.',
    icon: svg(<><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></>),
  },
]

const STEPS = [
  {
    title: 'Your systems',
    text: 'Hospitals, clinics, pharmacies and registries keep their data where it is.',
    icon: svg(<><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>),
  },
  {
    title: 'Adapters',
    text: 'A small adapter per source reads the data, whatever its format.',
    icon: svg(<><path d="M9 3v5M15 3v5" /><path d="M6 8h12v4a6 6 0 0 1-12 0V8z" /><path d="M12 18v3" /></>),
  },
  {
    title: 'One common model',
    text: 'Records are translated into a shared, standards-based model and identities are matched across sources.',
    icon: svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  },
  {
    title: 'Consent-gated access',
    text: 'People see only what consent allows, and every access is logged.',
    icon: svg(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  },
]

const AUDIENCES = [
  {
    title: 'Clinicians',
    text: 'The right history at the point of care, from every source, in one view.',
    img: '/who-clinician.jpg', pos: '50% 40%', alt: 'A clinician smiling at a laptop in a consulting room',
  },
  {
    title: 'Patients',
    text: 'Control over who sees your information, with a clear record of who did.',
    img: '/who-patient-care.jpg', pos: '42% 40%', alt: 'A nurse giving a young patient in a wheelchair a high five',
  },
  {
    title: 'Health institutions',
    text: 'Connect once to a common layer instead of building a custom link to every other system.',
    img: '/who-hospital.jpg', pos: '50% 50%', alt: 'A hospital building with an emergency entrance',
  },
]

const NAV = [
  { id: 'what', label: 'What we do' },
  { id: 'about', label: 'About' },
  { id: 'how', label: 'How it works' },
  { id: 'roadmap', label: 'Progress' },
]

function Head({ n, label, title, sub, center }: { n: string; label: string; title: string; sub?: string; center?: boolean }) {
  return (
    <header className={`lp__head${center ? ' lp__head--center' : ''}`}>
      <p className="lp__eyebrow"><span>{n}</span>{label}</p>
      <h2>{title}</h2>
      {sub && <p className="lp__sectionsub">{sub}</p>}
    </header>
  )
}

function ExplorerLink({ className, children }: { className: string; children: ReactNode }) {
  if (!EXPLORER_URL) {
    return <span className={`${className} is-disabled`} aria-disabled="true">{children} (link coming soon)</span>
  }
  return <a className={className} href={EXPLORER_URL} target="_blank" rel="noopener noreferrer">{children}</a>
}

type PublicPost = { id: string; title: string; body: string; image_paths: string[]; posted_at: string }

/** Latest public message-board posts. Renders nothing until there is at least one. */
function LatestNews() {
  const [posts, setPosts] = useState<PublicPost[]>([])
  const [open, setOpen] = useState<PublicPost | null>(null)

  useEffect(() => {
    let on = true
    supabase
      .from('posts')
      .select('id, title, body, image_paths, posted_at')
      .eq('is_public', true)
      .order('posted_at', { ascending: false })
      .limit(3)
      .then(({ data }) => { if (on && data) setPosts(data as PublicPost[]) })
    return () => { on = false }
  }, [])

  if (posts.length === 0) return null

  return (
    <section id="news" className="lp__band lp__band--soft">
      <div className="lp__wrap">
        <Head center n="05" label="Latest news" title="What we are working on" />
        <div className="news">
          {posts.map((p) => (
            <button key={p.id} type="button" className="newscard" onClick={() => setOpen(p)}>
              {p.image_paths[0] && (
                <div className="newscard__img"><img src={postImageUrl(p.image_paths[0])} alt="" loading="lazy" /></div>
              )}
              <div className="newscard__body">
                <time dateTime={p.posted_at}>{fmtDate(p.posted_at)}</time>
                <h3>{p.title}</h3>
                {p.body && <p>{plainExcerpt(p.body)}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
      <Dialog open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open && (
          <div className="dlg__body">
            <p className="muted" style={{ marginBottom: 12 }}>{fmtDate(open.posted_at)}</p>
            <Rich text={open.body} />
            {open.image_paths.length > 0 && (
              <div className="post__imgs">
                {open.image_paths.map((path) => (
                  <a key={path} href={postImageUrl(path)} target="_blank" rel="noopener noreferrer">
                    <img src={postImageUrl(path)} alt="" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </section>
  )
}

export default function Landing({ signedIn }: { signedIn: boolean }) {
  const [active, setActive] = useState<string>('')

  useEffect(() => {
    const els = NAV.map((n) => document.getElementById(n.id)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)
        if (hit) setActive(hit.target.id)
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])

  // Gentle fade-and-rise as sections scroll into view (skipped for reduced-motion users).
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const targets = document.querySelectorAll<HTMLElement>(
      '.lp__head, .lp__card, .lp__stepcard, .lp__aboutimg, .lp__abouttext, .lp__explorer > *, .lp__step, .lp__closing, .lp__footgrid > *',
    )
    targets.forEach((el) => {
      const idx = Array.from(el.parentElement?.children ?? []).indexOf(el)
      el.style.setProperty('--d', `${Math.min(idx, 4) * 90}ms`)
      el.classList.add('rv')
    })
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    targets.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="lp">
      <header className="lp__navwrap">
        <div className="lp__nav">
          <Link to="/" className="lp__brand" aria-label="DEXA home">
            <img src="/dexa-logo-navy.png" alt="DEXA" />
          </Link>
          <nav className="lp__links" aria-label="Sections">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className={active === n.id ? 'is-active' : ''} aria-current={active === n.id ? 'true' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>
          <Link to={signedIn ? '/app' : '/login'} className="lp__btn lp__btn--dark">
            {signedIn ? 'Open workspace' : 'Team sign in'}
          </Link>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="lp__hero">
          <div className="lp__herotext">
            <p className="lp__kicker">South African health data interoperability</p>
            <h1>The infrastructure behind better health.</h1>
            <p className="lp__lead">
              DEXA is building the connective layer that lets South Africa&rsquo;s health systems
              share the right information, safely, at the right moment.
            </p>
            <div className="lp__cta">
              <a href="#roadmap" className="lp__btn lp__btn--dark">Follow our progress</a>
              <a href="#what" className="lp__btn lp__btn--light">What we do</a>
            </div>
          </div>
          <div className="lp__heroimg">
            <img src="/hero-ambulance.jpg" alt="Aerial view of an ambulance on a tree-lined road with the DEXA logo" />
          </div>
        </section>

        {/* ---------- 01 What we do ---------- */}
        <section id="what" className="lp__band lp__band--soft">
          <div className="lp__wrap">
            <Head center n="01" label="What we do" title="One layer between every system" sub="Three ideas sit behind everything we build." />
            <div className="lp__cards">
              {PILLARS.map((p) => (
                <article key={p.title} className="lp__card">
                  <span className="lp__icon">{p.icon}</span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- About (the helicopter section, original layout) ---------- */}
        <section id="about" className="lp__band">
          <div className="lp__wrap lp__about">
            <div className="lp__aboutimg">
              <img src="/about-helicopter.png" alt="Air ambulance helicopter flying in front of a mountain" />
            </div>
            <div className="lp__abouttext">
              <h2>Built for the whole journey of care</h2>
              <p>
                From the ambulance to the hospital to the local clinic, a patient&rsquo;s story is
                scattered across systems that were never designed to talk to each other.
              </p>
              <p>
                DEXA is the infrastructure that connects them, so clinicians see what they need and
                patients stay in control.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- 02 How it works ---------- */}
        <section id="how" className="lp__band lp__band--soft">
          <div className="lp__wrap">
            <Head center n="02" label="How it works" title="From scattered records to one safe view" sub="Data stays where it lives. DEXA reads it, translates it and controls who can see it." />
            <ol className="lp__steps">
              {STEPS.map((s, i) => (
                <li key={s.title} className="lp__stepcard">
                  <div className="lp__steptop">
                    <span className="lp__stepnum">{i + 1}</span>
                    <span className="lp__stepicon">{s.icon}</span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- 03 Who it is for ---------- */}
        <section className="lp__band" aria-labelledby="who-title">
          <div className="lp__wrap">
            <header className="lp__head lp__head--center">
              <p className="lp__eyebrow"><span>03</span>Who it is for</p>
              <h2 id="who-title">Better outcomes for everyone involved</h2>
            </header>
            <div className="lp__cards">
              {AUDIENCES.map((a) => (
                <article key={a.title} className="lp__card lp__card--photo">
                  <div className="lp__cardimg">
                    <img src={a.img} alt={a.alt} style={{ objectPosition: a.pos }} loading="lazy" />
                  </div>
                  <div className="lp__cardbody">
                    <h3>{a.title}</h3>
                    <p>{a.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- 04 Explorer ---------- */}
        <section id="explorer" className="lp__band lp__band--dark">
          <div className="lp__wrap lp__explorer">
            <div>
              <p className="lp__eyebrow"><span>04</span>SA Health Explorer</p>
              <h2>See South African health infrastructure as it is today</h2>
              <p className="lp__explorertext">
                Our companion site maps the systems, registries and standards across public and
                private care, and how data moves between them.
              </p>
              <ExplorerLink className="lp__btn lp__btn--white">Open the explorer</ExplorerLink>
            </div>
            <div className="lp__explorerimg">
              <img
                src="/explorer-preview.png"
                alt="The SAHealth explorer: its overview page, with a top navigation bar and a hero image of a South African city"
                loading="lazy"
              />
            </div>
          </div>
        </section>

        <LatestNews />

        {/* ---------- 06 Progress ---------- */}
        <section id="roadmap" className="lp__band">
          <div className="lp__wrap">
            <Head center n="06" label="Progress" title="Our progress" sub="The order we are building in." />
            <ol className="lp__timeline">
              {ROADMAP.map((r, i) => (
                <li key={r.title} className="lp__step">
                  <span className="lp__num">{i + 1}</span>
                  <div>
                    <div className="lp__steprow">
                      <h3>{r.title}</h3>
                      <span className={`lp__chip ${r.status === 'In progress' ? 'lp__chip--on' : ''}`}>{r.status}</span>
                    </div>
                    <p>{r.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Closing call to action ---------- */}
        <section className="lp__band lp__band--soft">
          <div className="lp__wrap lp__closing">
            <h2>The infrastructure behind better health.</h2>
            <div className="lp__cta lp__cta--center">
              <ExplorerLink className="lp__btn lp__btn--dark">Explore the landscape</ExplorerLink>
              <Link to={signedIn ? '/app' : '/login'} className="lp__btn lp__btn--light">
                {signedIn ? 'Open workspace' : 'Team sign in'}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="lp__foot">
        <div className="lp__wrap lp__footgrid">
          <div className="lp__footbrand">
            <img src="/dexa-logo-navy.png" alt="DEXA" />
            <p>The infrastructure behind better health.</p>
            <p className="lp__footnote">
              South African health data interoperability. Built and tested on synthetic data only.
            </p>
          </div>
          <nav aria-label="Site">
            <h4>Site</h4>
            <ul>
              {NAV.map((n) => <li key={n.id}><a href={`#${n.id}`}>{n.label}</a></li>)}
            </ul>
          </nav>
          <nav aria-label="Explore">
            <h4>Explore</h4>
            <ul>
              <li><ExplorerLink className="lp__footlink">SA Health Explorer</ExplorerLink></li>
            </ul>
          </nav>
          <nav aria-label="Team">
            <h4>Team</h4>
            <ul>
              <li><Link to={signedIn ? '/app' : '/login'}>{signedIn ? 'Open workspace' : 'Team sign in'}</Link></li>
            </ul>
          </nav>
        </div>
        <div className="lp__wrap lp__footbar">
          <span>© 2026 DEXA. All rights reserved.</span>
          <a href="#top" onClick={(e) => {
            e.preventDefault()
            const panel = document.querySelector('.lp')
            if (panel && panel.scrollHeight > panel.clientHeight) panel.scrollTo({ top: 0, behavior: 'smooth' })
            else window.scrollTo({ top: 0, behavior: 'smooth' })
          }}>Back to top ↑</a>
        </div>
      </footer>
    </div>
  )
}
