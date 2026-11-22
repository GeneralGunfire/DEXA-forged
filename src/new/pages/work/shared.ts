// Types and helpers for the Work section (gateway planning). Counts and plain descriptions only: never patient data.
import { plainError } from '../calendar/cal'

export type Db = { id: string; name: string; machine: string; db_type: string; status: string }

export const SECTION_KINDS = ['background', 'connection', 'gateway_fit', 'build_approach', 'how_it_works'] as const
export type SectionKind = (typeof SECTION_KINDS)[number]
export const SECTION_LABEL: Record<SectionKind, string> = {
  background: 'Background', connection: 'Connection', gateway_fit: 'Gateway fit', build_approach: 'Build approach', how_it_works: 'How it works',
}
export type PlanSection = { id: string; database_id: string; kind: SectionKind; title: string; body: string; position: number; updated_at: string }

export const CONFIDENCE = ['confirmed', 'assumed', 'unknown'] as const
export type Confidence = (typeof CONFIDENCE)[number]
export type ConnOption = {
  id: string; database_id: string; route: string; description: string; owner_party: string; approval_needed: string
  popia_note: string; confidence: Confidence; chosen: boolean
}

export const MAP_STATUS = ['mapped', 'gap', 'conflict'] as const
export type MapStatus = (typeof MAP_STATUS)[number]
export type Mapping = { id: string; database_id: string; source_field: string; canonical_field: string; transform: string; status: MapStatus; note: string }

export const STAGE_STATUS = ['planned', 'in_progress', 'done', 'blocked', 'dropped'] as const
export type StageStatus = (typeof STAGE_STATUS)[number]
export const STAGE_LABEL: Record<StageStatus, string> = { planned: 'Planned', in_progress: 'In progress', done: 'Done', blocked: 'Blocked', dropped: 'Dropped' }
export type Stage = {
  id: string; database_id: string; position: number; title: string; goal: string; done_when: string
  status: StageStatus; notes: string; completed_at: string | null
}

export const DECISION_KINDS = ['decision', 'question', 'blocker'] as const
export type DecisionKind = (typeof DECISION_KINDS)[number]
export type Decision = {
  id: string; database_id: string; stage_id: string | null; kind: DecisionKind; title: string; body: string
  status: 'open' | 'resolved'; resolved_at: string | null; created_at: string
}

export type Dep = { id: string; database_id: string; depends_on_database_id: string; reason: string; active: boolean }

/** Stages that count towards progress (a dropped stage is out of the plan). */
export const counted = (stages: Stage[]) => stages.filter((s) => s.status !== 'dropped')

export function progress(stages: Stage[], decisions: Decision[]) {
  const list = counted(stages).sort((a, b) => a.position - b.position)
  const done = list.filter((s) => s.status === 'done').length
  const next = list.find((s) => s.status !== 'done') ?? null
  const blockers = decisions.filter((d) => d.kind === 'blocker' && d.status === 'open').length
  const blocked = blockers > 0 || list.some((s) => s.status === 'blocked')
  return { total: list.length, done, next, blocked, blockers }
}

/**
 * Build order from the "build after" links. Level 0 can start now; each later level waits for the one before.
 * Databases that depend on each other in a loop (or on one that is itself in a loop) are returned as `circular`
 * and are never walked twice, so this always finishes.
 */
export function buildOrder(ids: string[], deps: Dep[]) {
  const known = new Set(ids)
  const after = new Map<string, Set<string>>(ids.map((i) => [i, new Set<string>()]))
  for (const d of deps) {
    if (d.active && known.has(d.database_id) && known.has(d.depends_on_database_id) && d.database_id !== d.depends_on_database_id) after.get(d.database_id)!.add(d.depends_on_database_id)
  }
  const placed = new Set<string>()
  const levels: string[][] = []
  for (;;) {
    const level = ids.filter((i) => !placed.has(i) && [...after.get(i)!].every((p) => placed.has(p)))
    if (level.length === 0) break
    level.forEach((i) => placed.add(i))
    levels.push(level)
  }
  return { levels, circular: ids.filter((i) => !placed.has(i)) }
}

/** What a person should read when a save is refused. The typed text is never cleared. */
export function saveError(e: unknown): string {
  const x = e as { message?: string; code?: string } | null
  const m = (x?.message ?? '').trim().replace(/[.]+$/, '')
  if (x?.code === '42501' || /failed to fetch|network|not a team member|row-level security/i.test(m)) return plainError(e)
  return `The database did not accept this, so nothing was saved. It said: “${m || 'no reason given'}”. Text that looks like patient data, an email, a phone number, an ID or card number, a connection string, or a secret is refused. Reword it with counts and plain descriptions only. What you typed is still here.`
}

export const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100))
export const bar = 'block h-1.5 w-full overflow-hidden rounded-full bg-secondary'
