import { describe, expect, it } from 'vitest'
import {
  filterRequirements, filterSections, groupByArea, NO_DB, NO_REQ_FILTERS, parseSourceLine, parseSources, requirementStats, safeHttpUrl,
  sectionCounts, topicStats, weakest, activeReqFilters, parseBody, leadFirst, previewText, plainText, parseSourceItems, type EstateSection, type Requirement,
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

const SAMPLE = [
  '**In plain words**', 'The gateway reads **three** registers and never keeps the answers.', '',
  '**Key facts**', '- Two owners have confirmed in writing', '- One owner has not replied', '',
  '**What it means for DEXA**', 'We can start with the two confirmed sources.', '',
  '**Not established**', '- Whether the third source allows read access',
].join('\n')

describe('parseBody: labelled blocks', () => {
  it('splits on bold label lines and names each block', () => {
    const b = parseBody(SAMPLE)
    expect(b.map((x) => [x.label, x.kind])).toEqual([
      ['In plain words', 'lead'], ['Key facts', 'facts'], ['What it means for DEXA', 'dexa'], ['Not established', 'unknown'],
    ])
    expect(b[0].text).toBe('The gateway reads **three** registers and never keeps the answers.')
    expect(b[1].text).toBe('- Two owners have confirmed in writing\n- One owner has not replied')
  })

  it('accepts a colon on the label, in either place, and any letter case', () => {
    expect(parseBody('**Key facts:**\n- a').map((x) => [x.label, x.kind])).toEqual([['Key facts', 'facts']])
    expect(parseBody('**KEY FACTS**:\n- a')[0].kind).toBe('facts')
  })

  it('treats text before the first label as a plain block, and unknown labels as "other"', () => {
    const b = parseBody('Some opening words.\n\n**Extra notes**\nMore.')
    expect(b.map((x) => [x.label, x.kind, x.text])).toEqual([[null, 'plain', 'Some opening words.'], ['Extra notes', 'other', 'More.']])
  })

  it('does not treat bold in the middle of a line, or a bold line with more text, as a label', () => {
    expect(parseBody('We use **TLS** here.\n**Note:** something')).toEqual([{ label: null, kind: 'plain', text: 'We use **TLS** here.\n**Note:** something' }])
  })

  it('copes with Windows line endings, empty text and a label with nothing under it', () => {
    expect(parseBody('**Key facts**\r\n- a\r\n')[0].text).toBe('- a')
    expect(parseBody('')).toEqual([])
    expect(parseBody('**Not established**')).toEqual([{ label: 'Not established', kind: 'unknown', text: '' }])
  })

  it('puts "In plain words" first without changing the order of the rest', () => {
    const b = parseBody('**Key facts**\n- a\n\n**In plain words**\nHello')
    expect(leadFirst(b).map((x) => x.label)).toEqual(['In plain words', 'Key facts'])
  })

  it('never produces HTML: markup in the text stays text', () => {
    const b = parseBody('**In plain words**\n<img src=x onerror=alert(1)> and <b>bold</b>')
    expect(b[0].text).toBe('<img src=x onerror=alert(1)> and <b>bold</b>')
  })
})

describe('previewText and plainText', () => {
  it('previews the "In plain words" text with the formatting removed', () => {
    expect(previewText(SAMPLE)).toBe('The gateway reads three registers and never keeps the answers.')
  })
  it('falls back to the first block with text, but not the "Not established" block first', () => {
    expect(previewText('**Key facts**\n- one\n- two\n\n**Not established**\n- x')).toBe('one two')
    expect(previewText('**Not established**\n- only this')).toBe('only this')
    expect(previewText('')).toBe('')
  })
  it('cuts a long preview at a word and adds an ellipsis', () => {
    const p = previewText('**In plain words**\n' + 'word '.repeat(100), 50)
    expect(p.endsWith('…')).toBe(true)
    expect(p.length).toBeLessThanOrEqual(51)
  })
  it('removes bold, italic, links and bullet dashes', () => {
    expect(plainText('- **a** and *b* and [site](https://x.example.org)\n- c')).toBe('a and b and site c')
  })
})

describe('parseSourceItems: a trailing note in brackets becomes a label', () => {
  it('splits off the note and keeps the link', () => {
    const [a] = parseSourceItems('Registry overview https://www.example.org/reg (search snippet only)')
    expect(a.note).toBe('search snippet only')
    expect(a.parts).toEqual([{ text: 'Registry overview ' }, { text: 'https://www.example.org/reg', href: 'https://www.example.org/reg' }])
  })
  it('gives no note for a line without one, or when the brackets hold a web address, or when the line is only the brackets', () => {
    expect(parseSourceItems('Plain title')[0].note).toBeNull()
    expect(parseSourceItems('See (https://www.example.org/x)')[0].note).toBeNull()
    expect(parseSourceItems('(search snippet only)')[0].note).toBeNull()
  })
  it('keeps one item per non-blank line', () => {
    expect(parseSourceItems('One (opened in full)\n\nTwo\r\nThree (not opened)').map((s) => s.note)).toEqual(['opened in full', null, 'not opened'])
  })
  it('does not take a bracket inside a web address as a note', () => {
    const [a] = parseSourceItems('Spec https://www.example.org/a_(b)')
    expect(a.note).toBeNull()
  })
})
