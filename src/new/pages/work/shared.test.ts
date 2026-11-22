import { describe, expect, it } from 'vitest'
import type { Entry } from '../databases/shared'
import { buildOrder, progress, reorder, saveError, summarise, type Decision, type Dep, type Stage } from './shared'

const dep = (database_id: string, depends_on_database_id: string, active = true): Dep => ({ id: `${database_id}>${depends_on_database_id}`, database_id, depends_on_database_id, reason: '', active })
const stage = (position: number, status: Stage['status'], id = `s${position}`): Stage => ({ id, database_id: 'd', position, title: `Stage ${position}`, goal: '', done_when: '', status, notes: '', completed_at: null })
const decision = (kind: Decision['kind'], status: Decision['status']): Decision => ({ id: `${kind}-${status}`, database_id: 'd', stage_id: null, kind, title: kind, body: '', status, resolved_at: null, created_at: '2026-11-01T00:00:00Z' })
let n = 0
const entry = (type: Entry['type'], status: Entry['status'], happened_at: string): Entry => ({
  id: `e${++n}`, database_id: 'd', happened_at, type, phase: '2', author: 'Rajen', title: `${type} ${n}`, summary: '', detail: '',
  status, parent_id: null, session_label: '', created_at: happened_at, created_via: 'web',
})

describe('buildOrder', () => {
  it('puts independent databases in one step, in the given order', () => {
    expect(buildOrder(['a', 'b', 'c'], [])).toEqual({ levels: [['a', 'b', 'c']], circular: [] })
  })

  it('orders a chain: each step waits for the one before', () => {
    const r = buildOrder(['c', 'b', 'a'], [dep('b', 'a'), dep('c', 'b')])
    expect(r.levels).toEqual([['a'], ['b'], ['c']])
    expect(r.circular).toEqual([])
  })

  it('lets a database wait for several others (it lands after the latest of them)', () => {
    const r = buildOrder(['a', 'b', 'c'], [dep('c', 'a'), dep('c', 'b'), dep('b', 'a')])
    expect(r.levels).toEqual([['a'], ['b'], ['c']])
  })

  it('reports a cycle as circular, finishes, and still orders the free databases', () => {
    const r = buildOrder(['x', 'y', 'z'], [dep('x', 'y'), dep('y', 'x')])
    expect(r.levels).toEqual([['z']])
    expect(r.circular.sort()).toEqual(['x', 'y'])
  })

  it('treats a database that waits on a circular one as circular too', () => {
    const r = buildOrder(['x', 'y', 'w', 'z'], [dep('x', 'y'), dep('y', 'x'), dep('w', 'x')])
    expect(r.levels).toEqual([['z']])
    expect(r.circular.sort()).toEqual(['w', 'x', 'y'])
  })

  it('handles a three-step loop', () => {
    const r = buildOrder(['a', 'b', 'c'], [dep('a', 'b'), dep('b', 'c'), dep('c', 'a')])
    expect(r.levels).toEqual([])
    expect(r.circular.sort()).toEqual(['a', 'b', 'c'])
  })

  it('ignores inactive links, links to itself and links to unknown databases', () => {
    const r = buildOrder(['a', 'b'], [dep('b', 'a', false), dep('a', 'a'), dep('a', 'ghost'), dep('ghost', 'b')])
    expect(r).toEqual({ levels: [['a', 'b']], circular: [] })
  })
})

describe('progress', () => {
  it('counts stages done of total and names the next stage by position', () => {
    const p = progress([stage(3, 'planned'), stage(1, 'done'), stage(2, 'in_progress')], [])
    expect(p.done).toBe(1)
    expect(p.total).toBe(3)
    expect(p.next?.position).toBe(2)
    expect(p.blocked).toBe(false)
  })

  it('leaves dropped stages out of the total', () => {
    const p = progress([stage(1, 'done'), stage(2, 'dropped'), stage(3, 'planned')], [])
    expect(p.total).toBe(2)
    expect(p.done).toBe(1)
    expect(p.next?.position).toBe(3)
  })

  it('has no next stage once everything counted is done', () => {
    const p = progress([stage(1, 'done'), stage(2, 'done'), stage(3, 'dropped')], [])
    expect(p).toMatchObject({ done: 2, total: 2, next: null, blocked: false })
  })

  it('is blocked by a blocked stage', () => {
    expect(progress([stage(1, 'blocked')], []).blocked).toBe(true)
  })

  it('is blocked by an open blocker, and counts them', () => {
    const p = progress([stage(1, 'planned')], [decision('blocker', 'open'), decision('blocker', 'open')])
    expect(p.blocked).toBe(true)
    expect(p.blockers).toBe(2)
  })

  it('is not blocked by a resolved blocker, an open question or an open decision', () => {
    const p = progress([stage(1, 'planned')], [decision('blocker', 'resolved'), decision('question', 'open'), decision('decision', 'open')])
    expect(p.blocked).toBe(false)
    expect(p.blockers).toBe(0)
  })

  it('copes with no stages at all', () => {
    expect(progress([], [])).toMatchObject({ done: 0, total: 0, next: null, blocked: false })
  })
})

describe('summarise (what works / what did not)', () => {
  const list = [
    entry('Error', 'Open', '2026-11-20T10:00:00Z'),
    entry('Error', 'Resolved', '2026-11-18T10:00:00Z'),
    entry('Fix', null, '2026-11-19T10:00:00Z'),
    entry('Fix', null, '2026-11-21T10:00:00Z'),
    entry('Note', null, '2026-11-17T10:00:00Z'),
    entry('Action', null, '2026-11-16T10:00:00Z'),
    entry('Response', null, '2026-11-15T10:00:00Z'),
  ]

  it('counts fixes and resolved errors as what works, newest first', () => {
    const s = summarise(list)
    expect(s.worked.map((e) => [e.type, e.happened_at.slice(0, 10)])).toEqual([['Fix', '2026-11-21'], ['Fix', '2026-11-19'], ['Error', '2026-11-18']])
  })

  it('counts only errors that are not resolved as what did not', () => {
    const s = summarise(list)
    expect(s.failed).toHaveLength(1)
    expect(s.failed[0].status).toBe('Open')
  })

  it('does not put actions, notes, decisions or responses in either list', () => {
    const s = summarise([entry('Action', null, '2026-11-01T00:00:00Z'), entry('Note', null, '2026-11-02T00:00:00Z'), entry('Decision', null, '2026-11-03T00:00:00Z'), entry('Response', null, '2026-11-04T00:00:00Z')])
    expect(s.worked).toEqual([])
    expect(s.failed).toEqual([])
  })

  it('counts entries by type', () => {
    expect(summarise(list).counts).toEqual({ Error: 2, Fix: 2, Note: 1, Action: 1, Response: 1 })
  })

  it('is empty for no entries and does not change its input', () => {
    expect(summarise([])).toEqual({ worked: [], failed: [], counts: {} })
    const copy = [...list]
    summarise(list)
    expect(list).toEqual(copy)
  })
})

describe('reorder (move a stage up or down)', () => {
  const four = [stage(1, 'planned'), stage(2, 'planned'), stage(3, 'planned'), stage(4, 'planned')]

  it('swaps the positions of the stage and its neighbour, as two updates', () => {
    expect(reorder(four, 's3', 'up')).toEqual([{ id: 's3', position: 2 }, { id: 's2', position: 3 }])
    expect(reorder(four, 's2', 'down')).toEqual([{ id: 's2', position: 3 }, { id: 's3', position: 2 }])
  })

  it('works whatever order the list arrives in', () => {
    expect(reorder([four[3], four[0], four[2], four[1]], 's1', 'down')).toEqual([{ id: 's1', position: 2 }, { id: 's2', position: 1 }])
  })

  it('does nothing at either end or for an unknown stage', () => {
    expect(reorder(four, 's1', 'up')).toEqual([])
    expect(reorder(four, 's4', 'down')).toEqual([])
    expect(reorder(four, 'nope', 'up')).toEqual([])
  })

  it('keeps gaps in the numbering when swapping', () => {
    expect(reorder([stage(10, 'planned', 'a'), stage(20, 'planned', 'b')], 'b', 'up')).toEqual([{ id: 'b', position: 10 }, { id: 'a', position: 20 }])
  })

  it('renumbers when two stages share a position, so the move really happens', () => {
    const tied = [stage(1, 'planned', 'a'), stage(1, 'planned', 'b'), stage(2, 'planned', 'c')]
    const updates = reorder(tied, 'b', 'up')
    const after = Object.fromEntries(tied.map((s) => [s.id, s.position]))
    for (const u of updates) after[u.id] = u.position
    expect(new Set(Object.values(after)).size).toBe(3)
    expect(after.b).toBeLessThan(after.a)
  })
})

describe('saveError', () => {
  it("shows the database's message as it came", () => {
    const m = 'The body looks like it contains an email address. Remove it and try again. Entries must hold counts, errors and descriptions only.'
    expect(saveError({ message: m })).toBe(`Not saved. ${m} What you typed is still here.`)
  })

  it('leaves out "what you typed" for actions that have nothing typed', () => {
    expect(saveError({ message: 'Connection route not found' }, false)).toBe('Not saved. Connection route not found')
  })

  it('says so when the database gives no reason', () => {
    expect(saveError({}, false)).toBe('Not saved. The database gave no reason.')
  })
})
