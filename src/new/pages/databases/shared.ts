import type { Entry } from '../../../lib/timeline'
export type { Entry }

export type Db = {
  id: string; name: string; machine: string; db_type: string; port: string; instance_name: string
  background: string; shortfalls: string; build_record: string; created_at: string; slug: string | null; status: string
}

export type Section = {
  id: string; area: string; title: string; summary: string; kind: 'text' | 'table' | 'queries' | 'sources' | 'chart'
  body: string; collapsed: boolean; position: number; updated_at: string; written_by: string
}

export const MACHINES = ["Rajen's PC", "Huzayfa's laptop"]
export const DB_TYPES = ['PostgreSQL', 'SQL Server', 'SQLite', 'MySQL', 'CSV files']
export const TABS = ['Overview', 'Background', 'Build record', 'Documents', 'Timeline'] as const
export type Tab = (typeof TABS)[number]

/** How a stored phase is shown. Display only: the stored value never changes. */
export const phaseName = (p: string) => (p === '1' ? 'Phase 1' : p === '1-2' ? 'Phases 1-2' : p === '2' ? 'Phase 2' : p)

export const TYPE_ORDER = ['Action', 'Decision', 'Fix', 'Note', 'Response', 'Error'] as const
/** A small coloured dot per entry type (palette colours only; red is for errors). */
export const TYPE_DOT: Record<string, string> = {
  Action: 'bg-primary', Decision: 'bg-accent', Fix: 'bg-primary/50', Note: 'bg-muted-foreground/60', Response: 'bg-foreground/40', Error: 'bg-destructive',
}

export const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  if (m < 43200) return `${Math.round(m / 1440)} d ago`
  return `${Math.round(m / 43200)} mo ago`
}

/** The note whose detail text becomes the "Known limits" block on a record's Overview. Matched exactly. */
export const LIMITS_TITLE = 'Verified against the source on 22 November 2026'
