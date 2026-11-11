import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SECTIONS } from '../pages/app/sections'
import '../pages/app/palette.css'

type Hit = { key: string; group: string; label: string; hint?: string; to: string }
type Index = { dbs: Hit[]; entries: Hit[]; docs: Hit[]; posts: Hit[] }

/**
 * Search the whole workspace with Ctrl+K (or ⌘K): pages, databases, timeline entries, documents and posts.
 * The lists are loaded the first time it opens and then kept, so it feels instant.
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
      dbs: ok<{ id: string; name: string; db_type: string; machine: string }>(dbs).map((d) => ({ key: `d${d.id}`, group: 'Databases', label: d.name, hint: [d.db_type, d.machine].filter(Boolean).join(' · '), to: `/app/databases/${d.id}` })),
      entries: ok<{ id: string; database_id: string | null; title: string; type: string }>(tl).map((e) => ({ key: `e${e.id}`, group: 'Timeline', label: e.title, hint: `${e.type}${e.database_id ? ` · ${dbName.get(e.database_id) ?? ''}` : ''}`, to: e.database_id ? `/app/databases/${e.database_id}?tab=Timeline&entry=${e.id}` : `/app/timeline?entry=${e.id}` })),
      docs: [
        ...ok<{ id: string; name: string; database_id: string }>(dd).map((d) => ({ key: `dd${d.id}`, group: 'Documents', label: d.name, hint: dbName.get(d.database_id) ?? '', to: `/app/databases/${d.database_id}?tab=Documents&doc=${d.id}` })),
        ...ok<{ id: string; name: string; database_id: string | null }>(docs).map((d) => ({ key: `ld${d.id}`, group: 'Documents', label: d.name, hint: d.database_id ? dbName.get(d.database_id) ?? '' : 'Whole estate', to: d.database_id ? `/app/databases/${d.database_id}?tab=Documents` : '/app/documents' })),
      ],
      posts: ok<{ id: string; title: string }>(posts).map((p) => ({ key: `p${p.id}`, group: 'Message board', label: p.title, to: '/app/messages' })),
    })
    setLoading(false)
  }, [idx, loading])
  useEffect(() => { if (open) void load() }, [open, load])

  const pages = useMemo<Hit[]>(() => [{ key: 'home', group: 'Pages', label: 'Home', to: '/app' }, ...SECTIONS.map((s) => ({ key: `s${s.path}`, group: 'Pages', label: s.label, hint: s.blurb.split('.')[0], to: `/app/${s.path}` }))], [])

  const results = useMemo(() => {
    const n = q.trim().toLowerCase()
    const all = [...pages, ...(idx?.dbs ?? []), ...(idx?.entries ?? []), ...(idx?.docs ?? []), ...(idx?.posts ?? [])]
    if (!n) return [...pages.slice(0, 9), ...(idx?.dbs ?? []).slice(0, 4)]
    const words = n.split(/\s+/)
    return all.filter((h) => words.every((w) => `${h.label} ${h.hint ?? ''}`.toLowerCase().includes(w))).slice(0, 40)
  }, [q, idx, pages])

  useEffect(() => { setCur(0) }, [q])
  useEffect(() => { document.getElementById(`pal-${cur}`)?.scrollIntoView({ block: 'nearest' }) }, [cur])

  function go(h: Hit | undefined) { if (!h) return; onClose(); nav(h.to) }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCur((c) => Math.min(results.length - 1, c + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCur((c) => Math.max(0, c - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[cur]) }
  }

  let lastGroup = ''
  return (
    <dialog ref={ref} className="pal" aria-label="Search the workspace" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      {open && (
        <div className="pal__box" onKeyDown={onKey}>
          <div className="pal__in">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, databases, timeline, documents…"
              role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={results[cur] ? `pal-${cur}` : undefined} autoComplete="off" spellCheck={false} />
            <kbd>Esc</kbd>
          </div>
          <ul id="pal-list" role="listbox" className="pal__list">
            {results.map((h, i) => {
              const head = h.group !== lastGroup ? (lastGroup = h.group) : null
              return (
                <li key={h.key} role="presentation">
                  {head && <p className="pal__g">{head}</p>}
                  <button type="button" id={`pal-${i}`} role="option" aria-selected={i === cur} className={`pal__o${i === cur ? ' is-on' : ''}`} onMouseMove={() => setCur(i)} onClick={() => go(h)}>
                    <span className="pal__l">{h.label}</span>
                    {h.hint && <span className="pal__h">{h.hint}</span>}
                  </button>
                </li>
              )
            })}
            {results.length === 0 && <li className="pal__none">{loading ? 'Searching…' : `Nothing matches "${q}".`}</li>}
          </ul>
          <p className="pal__foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span></p>
        </div>
      )}
    </dialog>
  )
}
