import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate, unwrap, useLoad } from '../lib/data'
import { Rich } from './ui'
import '../pages/app/content.css'

type Section = {
  id: string; title: string; summary: string; kind: 'text' | 'table' | 'queries' | 'sources'
  body: string; collapsed: boolean; position: number; updated_at: string
}
type TableData = { columns: string[]; rows: string[][] }

/**
 * In-depth sections written by Claude Code (through the content-write function) for a database's
 * Background or Build record tab, or for the whole estate. Renders nothing when there are none,
 * so a record without in-depth content looks exactly as it did before.
 */
export function ContentSections({ databaseId, area }: { databaseId: string | null; area: 'background' | 'build' | 'estate' }) {
  const { data } = useLoad<Section[]>(async () => {
    let q = supabase.from('db_content').select('id, title, summary, kind, body, collapsed, position, updated_at').eq('area', area)
    q = databaseId ? q.eq('database_id', databaseId) : q.is('database_id', null)
    return unwrap<Section[]>(await q.order('position')) ?? []
  }, [databaseId, area])
  if (!data || data.length === 0) return null
  return (
    <section className="cs" aria-label="In-depth detail">
      <h3 className="cs__h">In depth</h3>
      {data.map((s) => (
        <details className="cs__item" key={s.id} open={!s.collapsed}>
          <summary>
            <span className="cs__title">{s.title}</span>
            {s.summary && <span className="cs__sum">{s.summary}</span>}
          </summary>
          <div className="cs__body">
            {s.kind === 'table' ? <TableView body={s.body} /> : s.kind === 'queries' ? <Queries body={s.body} /> : <Rich text={s.body} />}
            <p className="cs__foot">Written by Claude Code, updated {fmtDate(s.updated_at)}.</p>
          </div>
        </details>
      ))}
    </section>
  )
}

function Queries({ body }: { body: string }) {
  return <pre className="cs__pre">{body}</pre>
}

const PAGE = 100

/** A searchable table. On a phone each row becomes a small labelled card, so nothing scrolls sideways. */
function TableView({ body }: { body: string }) {
  const t = useMemo<TableData | null>(() => {
    try { const o = JSON.parse(body) as TableData; return Array.isArray(o.columns) && Array.isArray(o.rows) ? o : null } catch { return null }
  }, [body])
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const rows = useMemo(() => {
    if (!t) return []
    const n = q.trim().toLowerCase()
    return n ? t.rows.filter((r) => r.some((c) => c.toLowerCase().includes(n))) : t.rows
  }, [t, q])
  if (!t) return <p className="muted">This table could not be shown.</p>
  return (
    <>
      <div className="cs__bar">
        <input className="search" type="search" placeholder="Search this table" aria-label="Search this table" value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} />
        <span className="muted">{rows.length === t.rows.length ? `${rows.length} rows` : `${rows.length} of ${t.rows.length} rows`}</span>
      </div>
      {rows.length === 0 ? <p className="muted">Nothing matches that search.</p> : (
        <table className="cs__table">
          <thead><tr>{t.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {rows.slice(0, limit).map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} data-label={t.columns[j]}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.length > limit && (
        <button type="button" className="btn btn--sm" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - limit)} more</button>
      )}
    </>
  )
}
