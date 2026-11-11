import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { SECTIONS } from '../pages/app/sections'
import '../pages/app/nav.css'

/* The last crumb of the top bar is set by the page itself, for example the name of the database being viewed. */
const Ctx = createContext<{ leaf: string; setLeaf: (s: string) => void }>({ leaf: '', setLeaf: () => {} })

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [leaf, setLeaf] = useState('')
  return <Ctx.Provider value={{ leaf, setLeaf }}>{children}</Ctx.Provider>
}

export function useCrumb(label?: string | null) {
  const { setLeaf } = useContext(Ctx)
  useEffect(() => {
    setLeaf(label ?? '')
    return () => setLeaf('')
  }, [label, setLeaf])
}

/** Opens a form when the address carries ?key=1 (used by the New menu), then removes it from the address. */
export function useOpenFromQuery(key: string, open: () => void) {
  const [params, setParams] = useSearchParams()
  const on = params.get(key)
  useEffect(() => {
    if (!on) return
    open()
    setParams((p) => { p.delete(key); return p }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])
}

const plus = <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
const chev = <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>

const CREATE = [
  { label: 'Timeline entry', hint: 'Record an action, error, fix or decision', to: '/app/timeline?new=1' },
  { label: 'Document', hint: 'Upload a PDF, Word, image or video', to: '/app/documents?upload=1' },
  { label: 'Post', hint: 'Share news on the message board', to: '/app/messages?new=1' },
  { label: 'Task or event', hint: 'Add to the schedule', to: '/app/schedule?new=1' },
]

function QuickCreate() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div className="qc" ref={box}>
      <button type="button" className="btn btn--dark btn--sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {plus}New{chev}
      </button>
      {open && (
        <ul className="qc__menu" role="menu">
          {CREATE.map((c) => (
            <li key={c.to} role="none">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); nav(c.to) }}>
                <b>{c.label}</b><span>{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A slim bar that stays at the top of every page: where you are, search, and create something new. */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  const { pathname } = useLocation()
  const { leaf } = useContext(Ctx)
  const seg = pathname.split('/')[2]
  const section = SECTIONS.find((s) => s.path === seg)
  if (!seg) return null // the Home hero has its own full-bleed layout
  return (
    <header className="tb">
      <div className="tb__in">
        <nav className="tb__crumbs" aria-label="Breadcrumb">
          <Link to="/app">Home</Link>
          {section && <><span aria-hidden="true">/</span>{leaf ? <Link to={`/app/${section.path}`}>{section.label}</Link> : <span aria-current="page">{section.label}</span>}</>}
          {leaf && <><span aria-hidden="true">/</span><span aria-current="page" className="tb__leaf">{leaf}</span></>}
        </nav>
        <div className="tb__act">
          <button type="button" className="tb__search" onClick={onSearch} aria-label="Search the workspace">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span>Search</span><kbd>Ctrl K</kbd>
          </button>
          <QuickCreate />
        </div>
      </div>
    </header>
  )
}
