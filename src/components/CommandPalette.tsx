import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SECTIONS } from '../pages/app/sections'
import '../pages/app/palette.css'

type Kind = 'page' | 'db' | 'entry' | 'doc' | 'post' | 'action'
type Hit = { key: string; group: string; kind: Kind; label: string; hint?: string; to: string }
type Index = { dbs: Hit[]; entries: Hit[]; docs: Hit[]; posts: Hit[] }

const ICON: Record<Kind, string> = {
  page: 'M5 5h14v14H5z M5 10h14',
  db: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6 M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6',
  entry: 'M12 3v18 M12 8h6 M12 16H6',
  doc: 'M7 3h7l5 5v13H7z M14 3v5h5',
  post: 'M4 5h16v11H9l-5 4z',
  action: 'M12 5v14 M5 12h14',
}

const ACTIONS: Hit[] = [
  { key: 'a1', group: 'Actions', kind: 'action', label: 'New timeline entry', hint: 'Timeline', to: '/app/timeline' },
  { key: 'a2', group: 'Actions', kind: 'action', label: 'Upload a document', hint: 'Documents', to: '/app/documents' },
  { key: 'a3', group: 'Actions', kind: 'action', label: 'Write a post', hint: 'Message board', to: '/app/messages' },
  { key: 'a4', group: 'Actions', kind: 'action', label: 'Add a task', hint: 'Schedule', to: '/app/schedule' },
]

function mark(text: string, words: string[]): ReactNode {
  if (!words.length) return text
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig')
  return text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))
}

/**
 * Search the whole workspace with Ctrl+K (or ⌘K): pages, databases, timeline entries, documents and posts,
 * plus quick actions. The lists are loaded the first time it opens and then kept, so it feels instant.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const ref = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [cur, setCur] = useState(0)
  const [idx, setIdx] = useState<Index | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); setQ(''); setCur(0); setTimeout(() => input.current?.focus(), 0) }
    if (!open && d.open) d.close()
  }, [open])

  const load = useCallback(async () => {
    if (idx || loading) return
    setLoading(true)
    const [dbs, tl, docs, dd, posts] = await Promise.all([
      supabase.from('databases').select('id, name, db_type, machine').order('name'),
      supabase.from('timeline_entries').select('id, database_id, title, type, happened_at').order('happened_at', { ascending: false }).limit(600),
      supabase.from('documents').select('id, name, database_id'),
      supabase.from('db_documents').select('id, name, database_id').eq('is_current', true),
      supabase.from('posts').select('id, title'),
    ])
    const dbName = new Map(((dbs.data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]))
    const ok = <T,>(r: { data: unknown; error: unknown }): T[] => (r.error ? [] : ((r.data ?? []) as T[]))
    setIdx({
      dbs: ok<{ id: string; name: string; db_type: string; machine: string }>(dbs).map((d) => ({ key: `d${d.id}`, group: 'Databases', kind: 'db' as const, label: d.name, hint: [d.db_type, d.machine].filter(Boolean).join(' · '), to: `/app/databases/${d.id}` })),
      entries: ok<{ id: string; database_id: string | null; title: string; type: string }>(tl).map((e) => ({ key: `e${e.id}`, group: 'Timeline', kind: 'entry' as const, label: e.title, hint: `${e.type}${e.database_id ? ` · ${dbName.get(e.database_id) ?? ''}` : ''}`, to: e.database_id ? `/app/databases/${e.database_id}?tab=Timeline&entry=${e.id}` : `/app/timeline?entry=${e.id}` })),
      docs: [
        ...ok<{ id: string; name: string; database_id: string }>(dd).map((d) => ({ key: `dd${d.id}`, group: 'Documents', kind: 'doc' as const, label: d.name, hint: dbName.get(d.database_id) ?? '', to: `/app/databases/${d.database_id}?tab=Documents&doc=${d.id}` })),
        ...ok<{ id: string; name: string; database_id: string | null }>(docs).map((d) => ({ key: `ld${d.id}`, group: 'Documents', kind: 'doc' as const, label: d.name, hint: d.database_id ? dbName.get(d.database_id) ?? '' : 'Whole estate', to: d.database_id ? `/app/databases/${d.database_id}?tab=Documents` : '/app/documents' })),
      ],
      posts: ok<{ id: string; title: string }>(posts).map((p) => ({ key: `p${p.id}`, group: 'Message board', kind: 'post' as const, label: p.title, to: '/app/messages' })),
    })
    setLoading(false)
  }, [idx, loading])
  useEffect(() => { if (open) void load() }, [open, load])

  const pages = useMemo<Hit[]>(() => [{ key: 'home', group: 'Pages', kind: 'page', label: 'Home', to: '/app' }, ...SECTIONS.map((s) => ({ key: `s${s.path}`, group: 'Pages', kind: 'page' as const, label: s.label, hint: s.blurb.split('.')[0], to: `/app/${s.path}` }))], [])

  const words = useMemo(() => q.trim().toLowerCase().split(/\s+/).filter(Boolean), [q])
  const results = useMemo(() => {
    if (!words.length) return [...ACTIONS, ...pages.slice(0, 6), ...(idx?.dbs ?? []).slice(0, 4)]
    const all = [...ACTIONS, ...pages, ...(idx?.dbs ?? []), ...(idx?.entries ?? []), ...(idx?.docs ?? []), ...(idx?.posts ?? [])]
    const score = (h: Hit) => {
      const l = h.label.toLowerCase()
      return words.every((w) => l.startsWith(w)) ? 0 : words.every((w) => l.includes(w)) ? 1 : 2
    }
    return all
      .filter((h) => words.every((w) => `${h.label} ${h.hint ?? ''}`.toLowerCase().includes(w)))
      .sort((a, b) => score(a) - score(b))
      .slice(0, 40)
  }, [words, idx, pages])

  // keep the groups together while keeping best matches first inside each group
  const grouped = useMemo(() => {
    const order: string[] = []
    const by = new Map<string, Hit[]>()
    for (const h of results) { if (!by.has(h.group)) { by.set(h.group, []); order.push(h.group) } by.get(h.group)!.push(h) }
    return order.flatMap((g) => by.get(g)!)
  }, [results])

  useEffect(() => { setCur(0) }, [q])
  useEffect(() => { document.getElementById(`pal-${cur}`)?.scrollIntoView({ block: 'nearest' }) }, [cur])

  function go(h: Hit | undefined) { if (!h) return; onClose(); nav(h.to) }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(grouped.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(grouped[cur]) }
  }

  let lastGroup = ''
  return (
    <dialog ref={ref} className="pal" aria-label="Search the workspace" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      {open && (
        <div className="pal__box" onKeyDown={onKey}>
          <div className="pal__in">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or jump to…"
              role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={grouped[cur] ? `pal-${cur}` : undefined} autoComplete="off" spellCheck={false} />
            <kbd>Esc</kbd>
          </div>
          <ul id="pal-list" role="listbox" className="pal__list">
            {grouped.map((h, i) => {
              const head = h.group !== lastGroup ? (lastGroup = h.group) : null
              return (
                <li key={h.key} role="presentation">
                  {head && <p className="pal__g">{head}</p>}
                  <button type="button" id={`pal-${i}`} role="option" aria-selected={i === cur} className={`pal__o${i === cur ? ' is-on' : ''}`} onMouseMove={() => setCur(i)} onClick={() => go(h)}>
                    <span className={`pal__ic pal__ic--${h.kind}`} aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[h.kind]} /></svg>
                    </span>
                    <span className="pal__l">{mark(h.label, words)}</span>
                    {h.hint && <span className="pal__h">{h.hint}</span>}
                    <svg className="pal__go" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                </li>
              )
            })}
            {grouped.length === 0 && (
              <li className="pal__none">
                <strong>{loading ? 'Searching…' : `Nothing matches "${q}"`}</strong>
                {!loading && <span>Try a database name, a word from a timeline entry or the name of a document.</span>}
              </li>
            )}
          </ul>
          <p className="pal__foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>
            {words.length > 0 && <b>{grouped.length} {grouped.length === 1 ? 'result' : 'results'}</b>}
          </p>
        </div>
      )}
    </dialog>
  )
}
