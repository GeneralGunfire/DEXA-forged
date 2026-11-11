export const TYPES = ['Action', 'Error', 'Response', 'Fix', 'Decision', 'Note'] as const
export type EntryType = (typeof TYPES)[number]
export const AUTHORS = ['Rajen', 'Huzayfa', 'Claude Code'] as const
export const STATUSES = ['Open', 'Resolved'] as const
export const PHASES = ['1', '2', 'Other'] as const

export type Entry = {
  id: string
  database_id: string | null
  happened_at: string
  type: EntryType
  phase: string
  author: string
  title: string
  summary: string
  detail: string
  status: 'Open' | 'Resolved' | null
  parent_id: string | null
  session_label: string
  created_at: string
  created_via: 'web' | 'ingest'
}

export type Filters = {
  database: string      // '' = all, 'estate' = whole estate, otherwise a database id
  type: string
  phase: string         // '', '1', '2', 'Other'
  status: string
  author: string
  from: string          // yyyy-mm-dd
  to: string
  q: string
}

export const NO_FILTERS: Filters = { database: '', type: '', phase: '', status: '', author: '', from: '', to: '', q: '' }

export const activeFilterCount = (f: Filters, ignoreDatabase = false) =>
  (Object.keys(f) as (keyof Filters)[]).filter((k) => f[k] && !(ignoreDatabase && k === 'database')).length

/** Local calendar day, yyyy-mm-dd. */
export const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function filterEntries(entries: Entry[], f: Filters): Entry[] {
  const q = f.q.trim().toLowerCase()
  return entries.filter((e) => {
    if (f.database === 'estate' ? e.database_id !== null : f.database && e.database_id !== f.database) return false
    if (f.type && e.type !== f.type) return false
    if (f.phase) {
      const main = e.phase === '1' || e.phase === '2'
      if (f.phase === 'Other' ? main : e.phase !== f.phase) return false
    }
    if (f.status && e.status !== f.status) return false
    if (f.author && e.author !== f.author) return false
    const day = dayKey(e.happened_at)
    if (f.from && day < f.from) return false
    if (f.to && day > f.to) return false
    if (q && !`${e.title}\n${e.summary}\n${e.detail}`.toLowerCase().includes(q)) return false
    return true
  })
}

export type Node = { entry: Entry; children: Node[] }
export type DayGroup = { day: string; nodes: Node[] }

const byNewest = (a: Entry, b: Entry) => b.happened_at.localeCompare(a.happened_at) || b.created_at.localeCompare(a.created_at)
const byOldest = (a: Entry, b: Entry) => -byNewest(a, b)

/**
 * Chains replies under their parent. An entry whose parent is not in the list
 * (filtered out or deleted) is shown at the top level instead of vanishing.
 * Top level: newest first, grouped by day. Replies: oldest first, so a chain reads in order.
 */
export function buildThreads(entries: Entry[]): DayGroup[] {
  const ids = new Set(entries.map((e) => e.id))
  const kids = new Map<string, Entry[]>()
  const top: Entry[] = []
  for (const e of entries) {
    if (e.parent_id && ids.has(e.parent_id) && e.parent_id !== e.id) {
      kids.set(e.parent_id, [...(kids.get(e.parent_id) ?? []), e])
    } else top.push(e)
  }
  const seen = new Set<string>()
  const node = (e: Entry): Node => {
    seen.add(e.id)
    return { entry: e, children: (kids.get(e.id) ?? []).sort(byOldest).filter((c) => !seen.has(c.id)).map(node) }
  }
  const nodes = top.sort(byNewest).map(node)
  // a cycle (A -> B -> A) leaves entries unreachable; surface them rather than hide them
  for (const e of entries) if (!seen.has(e.id)) nodes.push(node(e))

  const groups: DayGroup[] = []
  for (const n of nodes) {
    const day = dayKey(n.entry.happened_at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.nodes.push(n)
    else groups.push({ day, nodes: [n] })
  }
  return groups
}

/** The fix(es) that resolved an error, if any. */
export const fixesFor = (errorId: string, entries: Entry[]) =>
  entries.filter((e) => e.parent_id === errorId && e.type === 'Fix')

export const countNodes = (groups: DayGroup[]) => {
  const n = (x: Node): number => 1 + x.children.reduce((s, c) => s + n(c), 0)
  return groups.reduce((s, g) => s + g.nodes.reduce((t, x) => t + n(x), 0), 0)
}

/* ---------- datetime-local <-> ISO ---------- */

export const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (v: string) => new Date(v).toISOString()

export const fmtDay = (day: string) =>
  new Date(day + 'T00:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
