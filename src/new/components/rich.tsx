import { Fragment, type ReactNode } from 'react'

// A small, safe renderer for post text: **bold**, *italic*, [text](https://link), "- " lists, "> " quotes.
// It builds React elements only, never HTML, so text from the database cannot inject markup.

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g

function inline(s: string): ReactNode[] {
  return s.split(INLINE).filter(Boolean).map((t, i) => {
    if (t.length > 4 && t.startsWith('**') && t.endsWith('**')) return <strong key={i} className="font-semibold text-foreground">{t.slice(2, -2)}</strong>
    if (t.length > 2 && t.startsWith('*') && t.endsWith('*')) return <em key={i}>{t.slice(1, -1)}</em>
    const m = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(t)
    if (m) return <a key={i} href={m[2]} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{m[1]}</a>
    return <Fragment key={i}>{t}</Fragment>
  })
}

export function Rich({ text, className = '' }: { text: string; className?: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/).filter((b) => b.trim())
  return (
    <div className={`space-y-4 text-[15px] leading-7 text-muted-foreground ${className}`}>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^>\s?/.test(l))) {
          return <blockquote key={i} className="border-l-2 border-primary pl-4 text-foreground">{lines.map((l) => l.replace(/^>\s?/, '')).join(' ')}</blockquote>
        }
        if (lines.every((l) => /^\s*-\s+/.test(l))) {
          return <ul key={i} className="list-disc space-y-1 pl-5 marker:text-muted-foreground">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*-\s+/, ''))}</li>)}</ul>
        }
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>
      })}
    </div>
  )
}
