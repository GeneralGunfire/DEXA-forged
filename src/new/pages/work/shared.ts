// Types and helpers for the Work section (gateway planning). Counts and plain descriptions only: never patient data.
import { plainError } from '../calendar/cal'
import type { Entry } from '../databases/shared'

export type Db = { id: string; name: string; machine: string; db_type: string; status: string }

export const SECTION_KINDS = ['background', 'connection', 'gateway_fit', 'build_approach', 'how_it_works', 'legal'] as const
export type SectionKind = (typeof SECTION_KINDS)[number]
export const SECTION_LABEL: Record<SectionKind, string> = {
  background: 'Background', connection: 'Connection', gateway_fit: 'Gateway fit', build_approach: 'Build approach', how_it_works: 'How it works',
  legal: 'Legal constraints and obligations',
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

/**
 * What a person should read when a save is refused: the database's own message, with a short lead-in.
 * `typed` is true for forms (their text is kept); pass false for button actions that have nothing typed.
 */
export function saveError(e: unknown, typed = true): string {
  const x = e as { message?: string; code?: string } | null
  const m = (x?.message ?? '').trim()
  if (x?.code === '42501' || /failed to fetch|network|not a team member|row-level security/i.test(m)) return plainError(e)
  return `Not saved. ${m || 'The database gave no reason.'}${typed ? ' What you typed is still here.' : ''}`
}

/**
 * The position changes needed to move one stage up or down. Normally that is a swap with its neighbour (two updates,
 * to be sent together). If the two share a position, every stage is renumbered 1, 2, 3… and only the ones that change
 * are returned. Returns nothing when the stage is already at that end.
 */
export function reorder(stages: Pick<Stage, 'id' | 'position'>[], id: string, dir: 'up' | 'down'): { id: string; position: number }[] {
  const list = [...stages].sort((a, b) => a.position - b.position)
  const at = list.findIndex((x) => x.id === id)
  const to = dir === 'up' ? at - 1 : at + 1
  if (at < 0 || to < 0 || to >= list.length) return []
  const a = list[at], b = list[to]
  if (a.position !== b.position) return [{ id: a.id, position: b.position }, { id: b.id, position: a.position }]
  const order = list.map((x) => x.id)
  ;[order[at], order[to]] = [order[to], order[at]]
  return order.map((oid, i) => ({ id: oid, position: i + 1 })).filter((u) => list.find((x) => x.id === u.id)!.position !== u.position)
}

/**
 * What works and what did not, worked out from Phase 2 entries (type and status). Nothing here is stored.
 * Worked: fixes, and errors that are resolved. Did not: errors that are still open. Both newest first.
 */
export function summarise(entries: Entry[]) {
  const newest = (a: Entry, b: Entry) => b.happened_at.localeCompare(a.happened_at)
  return {
    worked: entries.filter((e) => e.type === 'Fix' || (e.type === 'Error' && e.status === 'Resolved')).sort(newest),
    failed: entries.filter((e) => e.type === 'Error' && e.status !== 'Resolved').sort(newest),
    counts: entries.reduce<Record<string, number>>((a, e) => ({ ...a, [e.type]: (a[e.type] ?? 0) + 1 }), {}),
  }
}

export const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100))
export const bar = 'block h-1.5 w-full overflow-hidden rounded-full bg-secondary'
