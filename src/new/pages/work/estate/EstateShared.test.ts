import { describe, expect, it } from 'vitest'
import {
  filterRequirements, filterSections, groupByArea, NO_DB, NO_REQ_FILTERS, parseSourceLine, parseSources, requirementStats, safeHttpUrl,
  sectionCounts, topicStats, weakest, activeReqFilters, type EstateSection, type Requirement,
} from './EstateShared'

let n = 0
const sec = (o: Partial<EstateSection> = {}): EstateSection => ({
  id: `s${++n}`, topic: 'security', title: 'Title', body: '', confidence: 'confirmed', sources: '', position: n,
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...o,
})
const req = (o: Partial<Requirement> = {}): Requirement => ({
  id: `r${++n}`, area: 'security', title: 'Title', detail: '', kind: 'requirement', priority: 'should', status: 'proposed',
  source_note: '', database_id: null, created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...o,
})

describe('section counts and the weakest confidence', () => {
  it('counts sections by confidence', () => {
    expect(sectionCounts([sec({ confidence: 'confirmed' }), sec({ confidence: 'partly' }), sec({ confidence: 'partly' }), sec({ confidence: 'not_established' })]))
      .toEqual({ confirmed: 1, partly: 2, not_established: 1 })
    expect(sectionCounts([])).toEqual({ confirmed: 0, partly: 0, not_established: 0 })
  })

  it('takes the weakest confidence present', () => {
    expect(weakest([sec({ confidence: 'confirmed' }), sec({ confidence: 'not_established' }), sec({ confidence: 'partly' })])).toBe('not_established')
    expect(weakest([sec({ confidence: 'confirmed' }), sec({ confidence: 'partly' })])).toBe('partly')
    expect(weakest([sec({ confidence: 'confirmed' })])).toBe('confirmed')
    expect(weakest([])).toBeNull()
  })

  it('gives each topic its count and weakest confidence, and leaves out empty topics', () => {
    const stats = topicStats([
      sec({ topic: 'security', confidence: 'confirmed' }), sec({ topic: 'security', confidence: 'not_established' }),
      sec({ topic: 'identity', confidence: 'partly' }),
    ])
    expect(stats).toEqual({ security: { count: 2, weakest: 'not_established' }, identity: { count: 1, weakest: 'partly' } })
    expect(stats.risks).toBeUndefined()
  })
})

describe('requirement figures', () => {
  const list = [
    req({ status: 'proposed', priority: 'must' }), req({ status: 'agreed', priority: 'must' }), req({ status: 'done', priority: 'must' }),
    req({ status: 'dropped', priority: 'must' }), req({ status: 'proposed', priority: 'should' }),
    req({ kind: 'question', status: 'proposed' }), req({ kind: 'question', status: 'agreed' }), req({ kind: 'question', status: 'done' }), req({ kind: 'question', status: 'dropped' }),
    req({ kind: 'risk', status: 'proposed' }),
  ]
  const s = requirementStats(list)

  it('counts by status', () => expect(s.byStatus).toEqual({ proposed: 4, agreed: 2, done: 2, dropped: 2 }))
  it('counts open questions: questions that are not done or dropped', () => expect(s.openQuestions).toBe(2))
  it('counts must-haves that are still only proposed', () => expect(s.mustOutstanding).toBe(1))
  it('knows the total, and copes with nothing', () => {
    expect(s.total).toBe(10)
    expect(requirementStats([])).toEqual({ total: 0, byStatus: { proposed: 0, agreed: 0, done: 0, dropped: 0 }, openQuestions: 0, mustOutstanding: 0 })
  })
})

describe('filterSections', () => {
  const a = sec({ topic: 'security', title: 'Transport encryption', body: 'Use TLS everywhere.', updated_at: '2026-11-03T00:00:00Z' })
  const b = sec({ topic: 'identity', title: 'Sign-in options', body: 'Single sign-on is an option. TLS is needed.', updated_at: '2026-11-05T00:00:00Z' })
  const c = sec({ topic: 'security', title: 'Audit trail', body: 'Keep counts only.', updated_at: '2026-11-04T00:00:00Z' })
  const all = [a, b, c]

  it('shows one topic, newest edit first', () => expect(filterSections(all, { topic: 'security', q: '' }).map((s) => s.title)).toEqual(['Audit trail', 'Transport encryption']))
  it('shows every topic when none is chosen', () => expect(filterSections(all, { topic: '', q: '' }).map((s) => s.title)).toEqual(['Sign-in options', 'Audit trail', 'Transport encryption']))
  it('searches title and body across all topics, ignoring the chosen topic, ignoring case', () => {
    expect(filterSections(all, { topic: 'security', q: 'tls' }).map((s) => s.title)).toEqual(['Sign-in options', 'Transport encryption'])
    expect(filterSections(all, { topic: '', q: 'AUDIT' }).map((s) => s.title)).toEqual(['Audit trail'])
  })
  it('treats a blank search as no search, and finds nothing for an unknown word', () => {
    expect(filterSections(all, { topic: 'identity', q: '   ' })).toHaveLength(1)
    expect(filterSections(all, { topic: '', q: 'zebra' })).toEqual([])
  })
  it('does not change its input', () => {
    const copy = [...all]
    filterSections(all, { topic: '', q: '' })
    expect(all).toEqual(copy)
  })
})

describe('filterRequirements and groupByArea', () => {
  const list = [
    req({ id: 'a', area: 'security', title: 'Encrypt in transit', priority: 'must', status: 'agreed', database_id: 'db1' }),
    req({ id: 'b', area: 'security', title: 'Log access', priority: 'should', status: 'proposed', kind: 'risk', detail: 'No audit today' }),
    req({ id: 'c', area: 'identity', title: 'Single sign-on', priority: 'could', status: 'dropped', kind: 'question', source_note: 'Asked at kickoff', database_id: 'db2' }),
    req({ id: 'd', area: 'identity', title: 'Named users', priority: 'must', status: 'proposed', database_id: 'db1' }),
  ]
  const ids = (f: Partial<typeof NO_REQ_FILTERS>) => filterRequirements(list, { ...NO_REQ_FILTERS, ...f }).map((r) => r.id)

  it('returns everything with no filters', () => expect(ids({})).toEqual(['a', 'b', 'c', 'd']))
  it('filters by area, kind, priority and status', () => {
    expect(ids({ area: 'identity' })).toEqual(['c', 'd'])
    expect(ids({ kind: 'risk' })).toEqual(['b'])
    expect(ids({ priority: 'must' })).toEqual(['a', 'd'])
    expect(ids({ status: 'proposed' })).toEqual(['b', 'd'])
  })
  it('filters by database, including "no database"', () => {
    expect(ids({ database: 'db1' })).toEqual(['a', 'd'])
    expect(ids({ database: NO_DB })).toEqual(['b'])
  })
  it('searches title, detail and source note, ignoring case', () => {
    expect(ids({ q: 'ENCRYPT' })).toEqual(['a'])
    expect(ids({ q: 'audit' })).toEqual(['b'])
    expect(ids({ q: 'kickoff' })).toEqual(['c'])
  })
  it('combines filters', () => expect(ids({ area: 'identity', priority: 'must', database: 'db1' })).toEqual(['d']))
  it('counts how many filters are active', () => {
    expect(activeReqFilters(NO_REQ_FILTERS)).toBe(0)
    expect(activeReqFilters({ ...NO_REQ_FILTERS, area: 'security', q: ' ' })).toBe(1)
  })

  it('groups by area in topic order, leaving out empty areas, with must first inside a group', () => {
    const g = groupByArea(list)
    expect(g.map((x) => x.area)).toEqual(['security', 'identity'])
    expect(g[0].rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(g[1].rows.map((r) => r.id)).toEqual(['d', 'c'])
    expect(groupByArea([])).toEqual([])
  })
})

describe('source links: only real http and https addresses become links', () => {
  it('accepts http and https addresses with a proper host', () => {
    expect(safeHttpUrl('https://www.example.org/path?a=1')).toBe('https://www.example.org/path?a=1')
    expect(safeHttpUrl('HTTP://Example.org')).toBe('http://example.org/')
  })

  it('refuses every other kind of address', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'mailto:a@b.org', 'ftp://example.org', 'file:///etc/hosts', 'https://', 'http://localhost', 'example.org', '']) {
      expect(safeHttpUrl(bad), bad).toBeNull()
    }
  })

  it('links an address anywhere in a line and keeps the rest as text', () => {
    expect(parseSourceLine('Protection of Personal Information Act, section 19: https://www.gov.example/popia')).toEqual([
      { text: 'Protection of Personal Information Act, section 19: ' }, { text: 'https://www.gov.example/popia', href: 'https://www.gov.example/popia' },
    ])
    expect(parseSourceLine('See https://a.example.org/x and https://b.example.org/y for detail')).toEqual([
      { text: 'See ' }, { text: 'https://a.example.org/x', href: 'https://a.example.org/x' }, { text: ' and ' },
      { text: 'https://b.example.org/y', href: 'https://b.example.org/y' }, { text: ' for detail' },
    ])
  })

  it('leaves sentence punctuation outside the link', () => {
    expect(parseSourceLine('(https://a.example.org/x).')).toEqual([{ text: '(' }, { text: 'https://a.example.org/x', href: 'https://a.example.org/x' }, { text: ').' }])
  })

  it('never turns script or markup into anything but text', () => {
    expect(parseSourceLine('<a href="javascript:alert(1)">click</a>')).toEqual([{ text: '<a href="javascript:alert(1)">click</a>' }])
    const p = parseSourceLine('x https://ok.example.org/<script>alert(1)</script>')
    expect(p.filter((x) => x.href)).toEqual([{ text: 'https://ok.example.org/', href: 'https://ok.example.org/' }])
    expect(p.map((x) => x.text).join('')).toBe('x https://ok.example.org/<script>alert(1)</script>')
  })

  it('splits the field into lines and skips blank ones', () => {
    const out = parseSources('First source\r\n\r\n  https://x.example.org  \nThird')
    expect(out).toHaveLength(3)
    expect(out[1]).toEqual([{ text: 'https://x.example.org', href: 'https://x.example.org/' }])
    expect(parseSources('')).toEqual([])
  })
})
