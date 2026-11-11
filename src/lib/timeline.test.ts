import { describe, expect, it } from 'vitest'
import { buildThreads, countNodes, filterEntries, fixesFor, NO_FILTERS, type Entry } from './timeline'

let n = 0
const e = (over: Partial<Entry>): Entry => ({
  id: `id${++n}`, database_id: 'db1', happened_at: '2026-11-02T10:00:00Z', type: 'Note', phase: '1', author: 'Rajen',
  title: 't', summary: '', detail: '', status: null, parent_id: null, session_label: '',
  created_at: '2026-11-02T10:00:00Z', created_via: 'web', ...over,
})

describe('buildThreads', () => {
  it('groups newest first by day and chains replies under their error, oldest first', () => {
    const err = e({ id: 'err', type: 'Error', status: 'Open', happened_at: '2026-11-03T09:00:00Z', created_at: '2026-11-03T09:00:00Z' })
    const fix = e({ id: 'fix', type: 'Fix', parent_id: 'err', happened_at: '2026-11-03T11:00:00Z' })
    const resp = e({ id: 'resp', type: 'Response', parent_id: 'err', happened_at: '2026-11-03T10:00:00Z' })
    const old = e({ id: 'old', happened_at: '2026-10-30T12:00:00Z', created_at: '2026-10-30T12:00:00Z' })
    const groups = buildThreads([old, fix, err, resp])
    expect(groups).toHaveLength(2)
    expect(groups[0].nodes.map((x) => x.entry.id)).toEqual(['err'])
    expect(groups[0].nodes[0].children.map((c) => c.entry.id)).toEqual(['resp', 'fix'])
    expect(groups[1].nodes[0].entry.id).toBe('old')
    expect(countNodes(groups)).toBe(4)
  })
  it('shows an entry at the top level when its parent is not in the list', () => {
    const groups = buildThreads([e({ id: 'lonely', parent_id: 'gone' })])
    expect(groups[0].nodes[0].entry.id).toBe('lonely')
  })
  it('does not lose entries in a parent cycle', () => {
    const a = e({ id: 'a', parent_id: 'b' })
    const b = e({ id: 'b', parent_id: 'a' })
    expect(countNodes(buildThreads([a, b]))).toBe(2)
  })
  it('finds the fixes that resolve an error', () => {
    const fix = e({ id: 'f', type: 'Fix', parent_id: 'x' })
    expect(fixesFor('x', [fix, e({ type: 'Response', parent_id: 'x' })])).toEqual([fix])
  })
})

describe('filterEntries', () => {
  const rows = [
    e({ id: '1', database_id: 'db1', type: 'Error', status: 'Open', phase: '2', author: 'Claude Code', title: 'Login failed', happened_at: '2026-11-02T10:00:00' }),
    e({ id: '2', database_id: 'db2', type: 'Note', phase: '1', author: 'Rajen', summary: 'Counted 12 tables', happened_at: '2026-11-05T10:00:00' }),
    e({ id: '3', database_id: null, type: 'Decision', phase: 'Review', author: 'Huzayfa', detail: 'Chose Postgres', happened_at: '2026-11-08T10:00:00' }),
  ]
  const ids = (f: Partial<typeof NO_FILTERS>) => filterEntries(rows, { ...NO_FILTERS, ...f }).map((r) => r.id)
  it('returns everything with no filters', () => expect(ids({})).toEqual(['1', '2', '3']))
  it('by database and whole estate', () => {
    expect(ids({ database: 'db2' })).toEqual(['2'])
    expect(ids({ database: 'estate' })).toEqual(['3'])
  })
  it('by type, status, author', () => {
    expect(ids({ type: 'Error' })).toEqual(['1'])
    expect(ids({ status: 'Open' })).toEqual(['1'])
    expect(ids({ author: 'Huzayfa' })).toEqual(['3'])
  })
  it('by phase, with Other meaning anything but 1 and 2', () => {
    expect(ids({ phase: '2' })).toEqual(['1'])
    expect(ids({ phase: 'Other' })).toEqual(['3'])
  })
  it('by date range (inclusive) and text across title, summary and detail', () => {
    expect(ids({ from: '2026-11-05', to: '2026-11-08' })).toEqual(['2', '3'])
    expect(ids({ q: 'LOGIN' })).toEqual(['1'])
    expect(ids({ q: 'tables' })).toEqual(['2'])
    expect(ids({ q: 'postgres' })).toEqual(['3'])
  })
  it('combines filters', () => expect(ids({ type: 'Note', author: 'Huzayfa' })).toEqual([]))
})
