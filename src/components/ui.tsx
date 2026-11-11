import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { SETUP, useSignedUrl } from '../lib/data'
import '../pages/app/pages.css'

export function PageHead({ title, blurb, action }: { title: string; blurb?: string; action?: ReactNode }) {
  useEffect(() => { document.title = `${title} · DEXA Forged` }, [title])
  return (
    <header className="pg__head">
      <div>
        <h1>{title}</h1>
        {blurb && <p>{blurb}</p>}
      </div>
      {action && <div className="pg__action">{action}</div>}
    </header>
  )
}

export function Dialog({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`dlg${wide ? " dlg--wide" : ""}`}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      {open && (
        <div className="dlg__box">
          <header className="dlg__head">
            <h2>{title}</h2>
            <button type="button" className="dlg__x" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="fld">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function SetupNotice() {
  return (
    <div className="notice notice--setup" role="alert">
      <strong>The database is not set up yet.</strong>
      <p>
        In Supabase, open <b>SQL Editor</b>, paste the contents of <code>supabase/setup.sql</code> from the
        project, and run it once. Then reload this page.
      </p>
    </div>
  )
}

export function LoadState({ loading, error, children }: { loading: boolean; error: string | null; children: ReactNode }) {
  if (error === SETUP) return <SetupNotice />
  if (error) return <p className="notice notice--err" role="alert">{error}</p>
  if (loading) return <Skeleton />
  return <>{children}</>
}

/** A quiet placeholder while a page loads, so the layout does not jump. */
export function Skeleton() {
  return (
    <div className="skel" role="status" aria-busy="true" aria-label="Loading">
      <i style={{ width: '38%' }} /><i /><i style={{ width: '82%' }} /><i style={{ width: '56%' }} />
    </div>
  )
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p>{title}</p>
      {text && <small>{text}</small>}
      {action}
    </div>
  )
}

export function Chip({ children, on }: { children: ReactNode; on?: boolean }) {
  return <span className={`chip${on ? ' chip--on' : ''}`}>{children}</span>
}

export function SignedImg({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const url = useSignedUrl(path)
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <div className={`${className ?? ''} ph`} />
}

/* ---------- light, safe formatting for posts and notes ----------
   **bold**, *italic*, [text](https://link), "- " bullet lists, blank line = new paragraph.
   Everything is rendered as React text, never as raw HTML. */

function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (/^\*[^*\n]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function Rich({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).filter((b) => b.trim())
  return (
    <div className="rich">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^>\s?/.test(l))) {
          return <aside className="callout" key={i}><b>In plain words</b><div>{lines.map((l) => l.replace(/^>\s?/, '')).join(' ')}</div></aside>
        }
        if (lines.every((l) => /^\s*-\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*-\s+/, ''))}</li>)}</ul>
        }
        return (
          <p key={i}>
            {lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}
          </p>
        )
      })}
    </div>
  )
}

export function plainExcerpt(text: string, n = 160) {
  const t = text.replace(/[*\[\]]|\(https?:\/\/[^)]+\)|^\s*-\s+/gm, '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n).trimEnd() + '…' : t
}
